import {
  baselineSha,
  t3RepositoryRoot as root,
  prepareT1Source,
  createT1Controller,
} from "./guest-t3-baseline-source";
import { mkdirSync, writeFileSync } from "node:fs";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { createRuntimePostgresPool } from "../src/common/database/postgres";

import type { ApiRequest } from "../src/common/http/api-request";
import { AntiAbuseService } from "../src/modules/anti-abuse/anti-abuse.service";
import { AntiAbuseKeyDeriver } from "../src/modules/anti-abuse/anti-abuse-key";
import { TrustedClientAddressResolver } from "../src/modules/anti-abuse/client-address";
import { GuestAccessService } from "../src/modules/guest-access/guest-access.service";
import { GuestAuthOriginPolicy } from "../src/modules/guest-access/guest-browser-transport";
import { GuestRequestAdmission } from "../src/modules/guest-access/guest-request-admission";
import { GuestCredentialAuthorizer } from "../src/modules/guest-access/guest-credential-authorizer";
import { ShiftTestContext } from "./shift-test-context";
import {
  createSessionHelper,
  createVehicleHelper,
} from "./staff-valet-session-fixture-helpers";

describe("T3 measured immutable T1 baseline versus classified read", () => {
  const context = new ShiftTestContext("t3_measured_cost");
  let baselinePool: Pool;
  beforeAll(async () => {
    prepareT1Source();
    await context.setup();
    await context.runtimePool.end();
    baselinePool = new Pool({ connectionString: context.runtimeUrl, max: 4 });
    context.runtimePool = baselinePool;
    process.env.ANTI_ABUSE_HMAC_SECRET_B64URL = Buffer.alloc(32, 75).toString(
      "base64url",
    );
  }, 120_000);
  afterAll(async () => {
    await context.teardown();
  }, 60_000);

  it("measures explicit statements, round trips, acquisitions, writes and query plan", async () => {
    const fixture = await context.createFixture();
    const vehicle = await createVehicleHelper(context, fixture, {
      temporaryDescriptor: "T3 cost fixture",
    });
    const session = await createSessionHelper(context, fixture, vehicle, {
      state: "PARKED",
    });
    const access = new GuestAccessService(context.runtimePool);
    const token = (
      await access.executeIssue({
        authenticatedUserId: fixture.userId,
        valetSessionId: session,
        intent: "ISSUE_OR_ROTATE",
      })
    ).rawToken;
    const keys = new AntiAbuseKeyDeriver();
    const addresses = new TrustedClientAddressResolver();
    const origins = new GuestAuthOriginPolicy();
    const request: ApiRequest = {
      headers: { authorization: `Bearer ${token}` },
      rawHeaders: ["Authorization", `Bearer ${token}`],
      socket: { remoteAddress: "127.0.0.1" },
    };
    const controller = await createT1Controller(baselinePool, access);

    const measurements: Record<string, unknown> = { baselineSha };
    await context.adminPool.query(
      `INSERT INTO anti_abuse_events(scope,key_hash,state,occurred_at,group_key_hash,request_class)
       SELECT 'v1:guest-token','anti-abuse-hmac-sha256:v1:' || repeat(md5(value::text),2),
         'COUNTED',clock_timestamp()-interval '5 minutes',
         'anti-abuse-hmac-sha256:v1:' || repeat(md5(value::text),2),'A' FROM generate_series(1,100000) value`,
    );
    await context.adminPool.query("ANALYZE anti_abuse_events");
    measurements.representativeUnrelatedEvents = 100000;
    async function measure(
      label: string,
      pool: Pool,
      run: () => Promise<unknown>,
    ) {
      let acquisitions = 0;
      let roundTrips = 0;
      let statements = 0;
      let transactions = 0;
      let inserts = 0;
      let updates = 0;
      let cleanupCalls = 0;
      const connect = pool.connect.bind(pool);
      const wrapped = new WeakSet<object>();
      const acquisitionLatencies: number[] = [];
      pool.connect = ((...args: unknown[]) => {
        acquisitions += 1;
        const started = performance.now();
        const result = Reflect.apply(connect, pool, args);
        if (!(result instanceof Promise)) return result;
        return result.then((client: unknown) => {
          acquisitionLatencies.push(performance.now() - started);
          return client;
        });
      }) as Pool["connect"];
      const onConnect = (client: import("pg").PoolClient) => {
        if (wrapped.has(client)) return;
        wrapped.add(client);
        const query = client.query.bind(client);
        client.query = ((...args: unknown[]) => {
          const sql =
            typeof args[0] === "string"
              ? args[0]
              : ((args[0] as { text?: string })?.text ?? "");
          roundTrips += 1;
          if (/^BEGIN/i.test(sql)) {
            transactions += 1;
          }
          if (/INSERT INTO anti_abuse_events/i.test(sql)) inserts += 1;
          if (/cleanup_expired_anti_abuse_events/i.test(sql)) cleanupCalls += 1;
          statements += sql
            .split(";")
            .filter((part) => part.trim() !== "").length;
          const result = Reflect.apply(query, client, args);
          if (
            /UPDATE anti_abuse_events/i.test(sql) &&
            result instanceof Promise
          ) {
            return result.then((value: { rowCount?: number }) => {
              updates += value.rowCount ?? 0;
              return value;
            });
          }
          return result;
        }) as typeof client.query;
      };
      pool.on("acquire", onConnect);
      const latencies: number[] = [];
      const before = await context.adminPool.query(
        "SELECT count(*)::int AS rows, count(*) FILTER (WHERE state='IGNORED')::int AS ignored FROM anti_abuse_events",
      );
      for (let index = 0; index < 20; index += 1) {
        const started = performance.now();
        await run();
        latencies.push(performance.now() - started);
      }
      pool.off("acquire", onConnect);
      pool.connect = connect;
      const after = await context.adminPool.query(
        "SELECT count(*)::int AS rows, count(*) FILTER (WHERE state='IGNORED')::int AS ignored FROM anti_abuse_events",
      );
      latencies.sort((a, b) => a - b);
      acquisitionLatencies.sort((a, b) => a - b);
      const acquisitionPercentile = (percentile: number) =>
        acquisitionLatencies[
          Math.max(0, Math.ceil(acquisitionLatencies.length * percentile) - 1)
        ];
      measurements[label] = {
        perReadStatements: statements / 20,
        perReadRoundTrips: roundTrips / 20,
        perReadAcquisitions: acquisitions / 20,
        perReadTransactions: transactions / 20,
        perReadInserts: inserts / 20,
        perReadUpdates: updates / 20,
        perReadCleanupCalls: cleanupCalls / 20,
        insertedRows: after.rows[0].rows - before.rows[0].rows,
        ignoredRows: after.rows[0].ignored - before.rows[0].ignored,
        p50Ms: latencies[10],
        p95Ms: latencies[18],
        p99Ms: latencies[19],
        acquisitionP50Ms: acquisitionPercentile(0.5),
        acquisitionP95Ms: acquisitionPercentile(0.95),
        acquisitionP99Ms: acquisitionPercentile(0.99),
      };
      return statements;
    }
    const before = await measure("before", baselinePool, () =>
      controller.getSession(request, {}, { setHeader: () => undefined }),
    );
    await baselinePool.end();
    context.runtimePool = createRuntimePostgresPool(context.runtimeUrl);
    const current = new AntiAbuseService(context.runtimePool, keys);
    const authorizer = new GuestCredentialAuthorizer(
      current,
      origins,
      new GuestRequestAdmission(current, addresses, access),
    );
    // Bind historical compatible rows outside the steady-state read sample.
    await authorizer.read(request);
    const after = await measure("after", context.runtimePool, () =>
      authorizer.read(request),
    );
    expect(after).toBeLessThan(before / 2);
    const explain = () =>
      context.adminPool.query(
        "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) WITH instant AS MATERIALIZED (SELECT clock_timestamp() AS at) SELECT occurred_at FROM anti_abuse_events,instant WHERE scope=$1 AND group_key_hash=$2 AND state IN ('PENDING','COUNTED') AND occurred_at > instant.at-interval '15 minutes'",
        [
          "v1:guest-token",
          keys.derive("v1:guest-token", `visit:${session}`).keyHash,
        ],
      );
    const redact = (plan: unknown) =>
      JSON.parse(
        JSON.stringify(plan)
          .replaceAll(
            keys.derive("v1:guest-token", token).keyHash,
            "[redacted]",
          )
          .replaceAll(
            keys.derive("v1:guest-token", `visit:${session}`).keyHash,
            "[redacted]",
          ),
      );
    // Owned disposable DB only: reproduce the pre-index plan after the forward migration.
    await context.adminPool.query(
      "DROP INDEX anti_abuse_events_guest_group_window_idx",
    );
    measurements.planWithoutGroupIndex = redact((await explain()).rows[0]);
    await context.adminPool.query(
      "CREATE INDEX IF NOT EXISTS anti_abuse_events_guest_group_window_idx ON anti_abuse_events(scope,group_key_hash,occurred_at) WHERE group_key_hash IS NOT NULL AND state IN ('PENDING','COUNTED')",
    );
    await context.adminPool.query("ANALYZE anti_abuse_events");
    const indexed = (await explain()).rows[0];
    expect(JSON.stringify(indexed)).toContain(
      "anti_abuse_events_guest_group_window_idx",
    );
    measurements.planIndexed = redact(indexed);
    await measure("afterIndexed", context.runtimePool, () =>
      authorizer.read(request),
    );
    mkdirSync(`${root}/tmp/guest-t3-evidence`, { recursive: true });
    writeFileSync(
      `${root}/tmp/guest-t3-evidence/cost.json`,
      JSON.stringify(measurements, null, 2),
    );
    console.info("T3 measured cost", JSON.stringify(measurements));
  }, 60_000);
});
