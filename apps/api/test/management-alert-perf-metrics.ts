import { performance } from "node:perf_hooks";

import type { PostgresTransaction } from "../src/common/database/postgres";
import { inPostgresTransaction } from "../src/common/database/postgres-transaction";
import type { StaffSessionContext } from "../src/modules/auth/staff-session-context";
import type { DashboardLocationScope } from "../src/modules/dashboard/dashboard-location-authorization";
import { queryRetrievalSlaAlertCases } from "../src/modules/dashboard/management-alert-sources/retrieval-sla-alert-reader";
import { queryIncidentAlertCases } from "../src/modules/dashboard/management-alert-sources/incident-alert-reader";
import { queryPresenceReviewAlertCases } from "../src/modules/dashboard/management-alert-sources/presence-review-alert-reader";
import type { PresenceServerTestContext } from "./shift-presence-server-test-context";

export type AlertPerfFamily = "ALT-01" | "ALT-08" | "ALT-12";
export interface AlertPerfReader {
  readonly db: PresenceServerTestContext;
  readonly context: StaffSessionContext;
  readonly scope: DashboardLocationScope;
  readonly family: AlertPerfFamily;
  readonly expectedLimit: number;
}

export interface AlertPerfStats {
  readonly count: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly maxMs: number;
  readonly minMs: number;
}

interface PlanNode {
  readonly "Node Type": string;
  readonly "Index Name"?: string;
  readonly "Relation Name"?: string;
  readonly "Actual Rows"?: number;
  readonly "Actual Loops"?: number;
  readonly "Rows Removed by Filter"?: number;
  readonly "Rows Removed by Join Filter"?: number;
  readonly "Shared Hit Blocks"?: number;
  readonly "Shared Read Blocks"?: number;
  readonly "Sort Method"?: string;
  readonly Plans?: readonly PlanNode[];
}
interface ExplainedStatement {
  readonly Plan: PlanNode;
  readonly "Planning Time": number;
  readonly "Execution Time": number;
}
interface ExplainedRow {
  readonly "QUERY PLAN": ExplainedStatement[];
}

const sourceTables: Record<AlertPerfFamily, string> = {
  "ALT-01": "FROM retrieval_requests AS request",
  "ALT-08": "FROM incidents AS incident",
  "ALT-12": "FROM shift_presence_exceptions AS e",
};

function assertAlertSize(rows: readonly unknown[], config: AlertPerfReader) {
  if (rows.length !== config.expectedLimit) {
    throw new Error(
      `${config.family} expected ${config.expectedLimit} qualified rows, received ${rows.length}`,
    );
  }
}

async function runReader(
  tx: PostgresTransaction,
  config: AlertPerfReader,
): Promise<readonly unknown[]> {
  const input = {
    context: config.context,
    scope: config.scope,
    limit: 21,
  };
  switch (config.family) {
    case "ALT-01":
      return queryRetrievalSlaAlertCases(tx, { ...input, graceSeconds: 0 });
    case "ALT-08":
      return queryIncidentAlertCases(tx, input);
    case "ALT-12":
      return queryPresenceReviewAlertCases(tx, input);
  }
}

async function singleRead(config: AlertPerfReader): Promise<void> {
  await inPostgresTransaction(config.db.runtimePool, async (tx) => {
    assertAlertSize(await runReader(tx, config), config);
  });
}

function percentile(sorted: readonly number[], fraction: number): number {
  const rank = (sorted.length - 1) * fraction;
  const lower = Math.floor(rank);
  return (
    sorted[lower]! +
    (sorted[Math.ceil(rank)]! - sorted[lower]!) * (rank - lower)
  );
}

export function describeLatencies(samples: readonly number[]): AlertPerfStats {
  if (samples.length === 0) throw new Error("No latency samples collected.");
  const sorted = [...samples].sort((a, b) => a - b);
  const rounded = (value: number) => Number(value.toFixed(3));
  return {
    count: sorted.length,
    minMs: rounded(sorted[0]!),
    p50Ms: rounded(percentile(sorted, 0.5)),
    p95Ms: rounded(percentile(sorted, 0.95)),
    maxMs: rounded(sorted[sorted.length - 1]!),
  };
}

export async function measureSerial(
  config: AlertPerfReader,
  warmup = 20,
  measured = 100,
): Promise<AlertPerfStats> {
  for (let i = 0; i < warmup; i++) await singleRead(config);
  const samples: number[] = [];
  for (let i = 0; i < measured; i++) {
    const start = performance.now();
    await singleRead(config);
    samples.push(performance.now() - start);
  }
  return describeLatencies(samples);
}

export async function measureConcurrency(
  config: AlertPerfReader,
  concurrent: 4 | 8 | 16,
  waves = 5,
): Promise<
  AlertPerfStats & { readonly concurrent: number; readonly waves: number }
> {
  const samples: number[] = [];
  for (let wave = 0; wave < waves; wave++) {
    const durations = await Promise.all(
      Array.from({ length: concurrent }, async () => {
        const start = performance.now();
        await singleRead(config);
        return performance.now() - start;
      }),
    );
    samples.push(...durations);
  }
  return { concurrent, waves, ...describeLatencies(samples) };
}

export async function explainSource(config: AlertPerfReader) {
  return inPostgresTransaction(config.db.runtimePool, async (tx) => {
    let candidate: { sql: string; args: unknown[] } | undefined;
    // Read-only statement tracer. The authoritative reader runs unchanged;
    // this captures the SAME parameterized source query executed by the app.
    const traced = {
      query: async (sql: string, args?: readonly unknown[]) => {
        if (sql.includes(sourceTables[config.family])) {
          candidate = { sql, args: [...(args ?? [])] };
        }
        return args === undefined ? tx.query(sql) : tx.query(sql, [...args]);
      },
    } as unknown as PostgresTransaction;
    assertAlertSize(await runReader(traced, config), config);
    if (candidate === undefined) throw new Error("Source SQL trace missing.");
    const statement: { sql: string; args: unknown[] } = candidate;
    const explained = await tx.query<ExplainedRow>(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${statement.sql}`,
      statement.args,
    );
    const output = explained.rows[0]?.["QUERY PLAN"]?.[0];
    if (output === undefined) throw new Error("EXPLAIN JSON is missing.");
    const nodes: Array<{
      nodeType: string;
      relation?: string;
      index?: string;
      actualRows: number;
      loops: number;
      filtered: number;
      joinFiltered: number;
      hits: number;
      reads: number;
      sortMethod?: string;
    }> = [];
    const collect = (node: PlanNode) => {
      nodes.push({
        nodeType: node["Node Type"],
        ...(node["Relation Name"] ? { relation: node["Relation Name"] } : {}),
        ...(node["Index Name"] ? { index: node["Index Name"] } : {}),
        actualRows: node["Actual Rows"] ?? 0,
        loops: node["Actual Loops"] ?? 0,
        filtered: node["Rows Removed by Filter"] ?? 0,
        joinFiltered: node["Rows Removed by Join Filter"] ?? 0,
        hits: node["Shared Hit Blocks"] ?? 0,
        reads: node["Shared Read Blocks"] ?? 0,
        ...(node["Sort Method"] ? { sortMethod: node["Sort Method"] } : {}),
      });
      for (const child of node.Plans ?? []) collect(child);
    };
    collect(output.Plan);
    return {
      planningMs: output["Planning Time"],
      executionMs: output["Execution Time"],
      root: output.Plan["Node Type"],
      nodes,
      // Full raw EXPLAIN tree is retained for exact audit, not an invented summary.
      plan: output,
    };
  });
}
