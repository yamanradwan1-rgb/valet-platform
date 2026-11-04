import type { PoolClient } from "pg";

import type { PostgresPool } from "../src/common/database/postgres";
import type { StaffSessionContext } from "../src/modules/auth/staff-session-context";
import { listManagementAlertPreview } from "../src/modules/dashboard/management-alert-preview-query";

const sourceMarkers = [
  ["ALT-01", "FROM retrieval_requests AS request"],
  ["ALT-02/03", "FROM tasks AS task"],
  ["ALT-08", "FROM incidents AS incident"],
  ["ALT-12", "FROM shift_presence_exceptions AS e"],
] as const;

interface CapturedQuery {
  readonly family: (typeof sourceMarkers)[number][0];
  readonly sql: string;
  readonly params: readonly unknown[];
}

interface PgExplainPlan {
  readonly Plan: {
    readonly "Node Type": string;
    readonly "Actual Rows": number;
    readonly "Shared Hit Blocks": number;
    readonly "Shared Read Blocks": number;
    readonly Plans?: readonly unknown[];
  };
  readonly "Planning Time": number;
  readonly "Execution Time": number;
}

/**
 * Executes the actual authorized aggregate without source mocks and captures
 * its original parameterized candidate queries. PostgreSQL's EXPLAIN then
 * runs each branch under the SAME restricted pool against the SAME fixture.
 * This is four SQL statements for five categories: ALT-02/03 are folded.
 */
export async function explainManagementAlertMixedAggregate(
  pool: PostgresPool,
  context: StaffSessionContext,
  locationId: string,
  expectedCount: number,
  expectedHasMore: boolean,
) {
  const captured = new Map<CapturedQuery["family"], CapturedQuery>();
  const tracingPool = {
    connect: async () => {
      const client = await pool.connect();
      return new Proxy(client, {
        get(target, property) {
          if (property === "query") {
            return (...argumentsList: unknown[]) => {
              const [sql, params] = argumentsList;
              if (typeof sql === "string") {
                for (const [family, marker] of sourceMarkers) {
                  if (sql.includes(marker)) {
                    if (!Array.isArray(params)) {
                      throw new Error(
                        "Parameterized source query not captured.",
                      );
                    }
                    captured.set(family, { family, sql, params: [...params] });
                  }
                }
              }
              return Reflect.apply(target.query, target, argumentsList);
            };
          }
          const value: unknown = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      }) as PoolClient;
    },
  } as unknown as PostgresPool;
  const response = await listManagementAlertPreview(tracingPool, {
    context,
    locationId,
  });
  if (
    response.count !== expectedCount ||
    response.hasMore !== expectedHasMore ||
    response.items.length !== expectedCount
  ) {
    throw new Error("Traced mixed-source preview lost eligible cases.");
  }
  if (captured.size !== sourceMarkers.length) {
    throw new Error(
      `Expected all four source SQL statements, got ${captured.size}.`,
    );
  }

  const evidence = [];
  for (const [family] of sourceMarkers) {
    const candidate = captured.get(family);
    if (candidate === undefined)
      throw new Error(`Missing ${family} source SQL.`);
    const client = await pool.connect();
    try {
      await client.query("BEGIN READ ONLY");
      const result = await client.query<{ "QUERY PLAN": PgExplainPlan[] }>(
        `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${candidate.sql}`,
        [...candidate.params],
      );
      const plan = result.rows[0]?.["QUERY PLAN"]?.[0];
      if (plan === undefined) throw new Error(`Missing ${family} PG EXPLAIN.`);
      await client.query("COMMIT");
      evidence.push({
        family,
        actualExecutionMs: plan["Execution Time"],
        actualPlanningMs: plan["Planning Time"],
        actualRootRows: plan.Plan["Actual Rows"],
        inclusiveRootSharedHits: plan.Plan["Shared Hit Blocks"],
        inclusiveRootSharedReads: plan.Plan["Shared Read Blocks"],
        plan,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  return evidence;
}
