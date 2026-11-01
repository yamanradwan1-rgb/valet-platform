import { createServer } from "node:http";
import { performance } from "node:perf_hooks";

import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  boundPostgresPool,
  runtimePoolSnapshot,
} from "../src/common/database/bounded-postgres-pool";
import {
  fixture,
  startIssue333Lab,
  stopIssue333Lab,
} from "./dashboard-issue333-lab";

const marker = "ISSUE333_SYNTHETIC_LOCATION_DATA";

function gate<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

async function bounded<T>(
  promise: Promise<T>,
  label: string,
  timeoutMs = 8000,
): Promise<T> {
  let timeout!: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("Timed out: " + label)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

async function makeSubject() {
  const manager = await fixture.createUser();
  const { membershipId, organizationId } = await fixture.createMembership(
    manager.id,
    { role: "LOCATION_MANAGER" },
  );
  const revoked = await fixture.addLocation(organizationId);
  const retained = await fixture.addLocation(organizationId);
  for (const locationId of [revoked.locationId, retained.locationId]) {
    await fixture.query(
      "INSERT INTO membership_location_access " +
        "(organization_id, membership_id, location_id) VALUES ($1,$2,$3)",
      [organizationId, membershipId, locationId],
    );
  }
  const adminUser = await fixture.createUser();
  await fixture.addMembership(organizationId, adminUser.id, "ORG_ADMIN");
  const admin = await fixture.nativeLogin(adminUser);
  await fixture.enrollAndAssure(admin);
  const current = await fixture.query<{ version: number }>(
    "SELECT version FROM organization_memberships WHERE id=$1",
    [membershipId],
  );
  return {
    admin,
    locationId: revoked.locationId,
    membershipId,
    organizationId,
    version: current.rows[0]!.version,
  };
}

function makeHttpProbe(
  pool: Pool,
  subject: { organizationId: string; membershipId: string; locationId: string },
) {
  const entered = gate<number>();
  const resume = gate();
  const state = { finishAt: 0, abortedBeforeFinish: false };
  const server = createServer(async (_request, response) => {
    let client: PoolClient | undefined;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      client?.release();
    };
    response.once("finish", () => {
      state.finishAt = performance.now();
      release();
    });
    response.once("close", () => {
      if (state.finishAt === 0) state.abortedBeforeFinish = true;
      release();
    });
    try {
      client = await pool.connect();
      const result = await client.query<{ pid: number }>(
        "SELECT pg_backend_pid()::integer AS pid",
      );
      const pid = result.rows[0]!.pid;
      await client.query(
        "SELECT pg_advisory_lock_shared(" +
          "hashtextextended('staff-management-org:' || $1::text, 0))",
        [subject.organizationId],
      );
      const authorized = await client.query<{ authorized: boolean }>(
        "SELECT EXISTS (SELECT 1 FROM membership_location_access a " +
          "JOIN organization_memberships m ON m.id=a.membership_id " +
          "WHERE a.organization_id=$1 AND a.membership_id=$2 " +
          "AND a.location_id=$3 AND m.role='LOCATION_MANAGER' " +
          "AND m.status='ACTIVE') AS authorized",
        [subject.organizationId, subject.membershipId, subject.locationId],
      );
      if (!authorized.rows[0]?.authorized) {
        throw new Error("Synthetic reader was not authorized");
      }
      entered.resolve(pid);
      await resume.promise;
      if (!response.destroyed) {
        response.setHeader("Content-Type", "text/plain");
        response.end(marker);
      }
    } catch (error) {
      entered.reject(error);
      release();
      if (!response.headersSent && !response.destroyed) {
        response.statusCode = 503;
        response.end("PROBE_FAILED");
      }
    }
  });
  return {
    entered: entered.promise,
    resume: resume.resolve,
    state,
    async start() {
      await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve),
      );
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected ephemeral loopback HTTP port");
      }
      const abort = new AbortController();
      const body = fetch("http://127.0.0.1:" + address.port + "/", {
        signal: abort.signal,
      }).then(async (response) => ({
        status: response.status,
        text: await response.text(),
      }));
      return {
        body,
        async stop() {
          resume.resolve();
          abort.abort();
          await Promise.allSettled([body]);
          server.closeAllConnections();
          await new Promise<void>((resolve) => server.close(() => resolve()));
        },
      };
    },
  };
}

async function waitForExclusiveBlocker(readerPid: number): Promise<number> {
  const until = Date.now() + 1800;
  while (Date.now() < until) {
    const waiting = await fixture.query<{ pid: number; blockers: number[] }>(
      "SELECT activity.pid, pg_blocking_pids(activity.pid) AS blockers " +
        "FROM pg_stat_activity activity JOIN pg_locks lock ON lock.pid=activity.pid " +
        "WHERE activity.datname=current_database() AND lock.locktype='advisory' " +
        "AND lock.mode='ExclusiveLock' AND NOT lock.granted",
    );
    const match = waiting.rows.find((row) => row.blockers.includes(readerPid));
    if (match) return match.pid;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Canonical writer never blocked on reader advisory");
}

beforeAll(startIssue333Lab, 180_000);
afterAll(stopIssue333Lab, 90_000);

describe("Issue333 U002 deliberately uncoupled HTTP advisory lease falsifier", () => {
  it.each(["WATCHDOG", "BACKEND_LOSS"] as const)(
    "%s releases advisory before synthetic HTTP finish",
    async (failure) => {
      const subject = await makeSubject();
      const pool = boundPostgresPool(
        new Pool({ connectionString: fixture.runtimeDatabaseUrl(), max: 2 }),
        2,
        8,
        {
          lockMs: 500,
          statementMs: 1000,
          transactionMs: 2800,
          idleTransactionMs: 1000,
        },
      );
      const probe = makeHttpProbe(pool, subject);
      const request = await probe.start();
      let writer: ReturnType<typeof fixture.managementPost> | undefined;
      try {
        const readerPid = await bounded(probe.entered, "reader advisory");
        const held = await fixture.query<{ role: string; held: string }>(
          "SELECT a.usename AS role, count(l.pid)::text AS held " +
            "FROM pg_stat_activity a JOIN pg_locks l ON l.pid=a.pid " +
            "WHERE a.pid=$1 AND a.datname=current_database() " +
            "AND l.locktype='advisory' AND l.mode='ShareLock' AND l.granted " +
            "GROUP BY a.usename",
          [readerPid],
        );
        expect(held.rows[0]).toEqual({
          role: new URL(fixture.runtimeDatabaseUrl()).username,
          held: "1",
        });
        writer = fixture.managementPost(
          "/v1/staff/management/organizations/" +
            subject.organizationId +
            "/staff/" +
            subject.membershipId +
            "/location-access/revoke",
          subject.admin.accessToken,
          {
            expectedVersion: subject.version,
            locationIds: [subject.locationId],
          },
        );
        const writerPid = await waitForExclusiveBlocker(readerPid);
        if (failure === "BACKEND_LOSS") {
          const killed = await fixture.query<{ terminated: boolean }>(
            "SELECT pg_terminate_backend($1) AS terminated WHERE EXISTS " +
              "(SELECT 1 FROM pg_stat_activity WHERE pid=$1 " +
              "AND datname=current_database() AND usename=$2)",
            [readerPid, held.rows[0]!.role],
          );
          expect(killed.rows[0]?.terminated).toBe(true);
        }
        const commit = await bounded(writer, "canonical HTTP revoke", 9000);
        const writerAt = performance.now();
        expect(commit.status).toBe(201);
        const grant = await fixture.query<{ count: string }>(
          "SELECT count(*)::text AS count FROM membership_location_access " +
            "WHERE organization_id=$1 AND membership_id=$2 AND location_id=$3",
          [subject.organizationId, subject.membershipId, subject.locationId],
        );
        expect(grant.rows[0]?.count).toBe("0");
        const locks = await fixture.query<{ count: string }>(
          "SELECT count(*)::text AS count FROM pg_locks " +
            "WHERE pid=$1 AND locktype='advisory'",
          [readerPid],
        );
        expect(locks.rows[0]?.count).toBe("0");
        expect(probe.state.finishAt).toBe(0);
        expect(probe.state.abortedBeforeFinish).toBe(false);
        if (failure === "WATCHDOG") {
          expect(runtimePoolSnapshot(pool).leaseExpirations).toBeGreaterThan(0);
        }
        probe.resume();
        const delivered = await bounded(request.body, "synthetic HTTP finish");
        expect(delivered).toEqual({ status: 200, text: marker });
        expect(probe.state.finishAt).toBeGreaterThan(writerAt);
        console.log(
          "ISSUE333_U002_W2_LEASE_FALSIFIER",
          JSON.stringify({
            failure,
            readerPid,
            writerPid,
            writerStatus: commit.status,
            revokedGrantCount: grant.rows[0]?.count,
            readerLockAfterCommit: locks.rows[0]?.count,
            writerBeforeServerFinish: probe.state.finishAt > writerAt,
            abortedBeforeFinish: probe.state.abortedBeforeFinish,
            leaseExpirations: runtimePoolSnapshot(pool).leaseExpirations,
          }),
        );
      } finally {
        probe.resume();
        await request.stop();
        await writer?.catch(() => undefined);
        await pool.end();
      }
    },
    30_000,
  );
});
