import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { setTimeout as delay } from "node:timers/promises";

import { BLOCKING_WITNESS_SQL, validateBlockingWitness } from "./race-pg-observer.mjs";
import {
  ACL_SQL, FUNCTION_ACL_SQL, IDENTITY_SQL, MIGRATION_SQL,
  assertCommittedExactLedger, assertPrivateAcl,
} from "./pg17-acceptance-catalog.mjs";
import {
  ACCEPTANCE_TARGET, assertAcceptanceEnvironment, assertAcceptanceIdentity,
} from "./pg17-acceptance-target.mjs";

const require = createRequire(new URL("../package.json", import.meta.url));
const SESSION_LEASE = [416, 30];
const TEST_FENCE = [416, 3001]; // Never a production rank or domain lock.

export function assertDockerFixture(identityText, portText) {
  const t = ACCEPTANCE_TARGET;
  const expected = `${t.containerId}|/${t.container}|running|postgres:17-alpine|issue416-worker-38|isolated-test|true|416`;
  if (identityText.trim() !== expected ||
    portText.trim() !== `${t.host}:${t.port}`) {
    throw new Error("W30_PG17_DOCKER_CONTAINER_ATTESTATION_FAILED");
  }
  return true;
}

function inspectDockerFixture() {
  const t = ACCEPTANCE_TARGET;
  try {
    const run = (args) => execFileSync("docker", args, {
      encoding: "utf8", timeout: 3500, windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    });
    assertDockerFixture(
      run(["inspect", "--format", "{{.Id}}|{{.Name}}|{{.State.Status}}|{{.Config.Image}}|{{index .Config.Labels `vaylet.owner`}}|{{index .Config.Labels `vaylet.environment`}}|{{index .Config.Labels `vaylet.disposable`}}|{{index .Config.Labels `vaylet.issue`}}", t.container]),
      run(["port", t.container, "5432/tcp"]),
    );
  } catch {
    throw new Error("W30_PG17_DOCKER_CONTAINER_ATTESTATION_FAILED");
  }
}

function clientFor(env) {
  const t = assertAcceptanceEnvironment(env);
  const Client = require("pg").Client;
  return new Client({
    host: t.host, port: t.port, database: t.database,
    user: t.login, password: t.password, ssl: false,
    connectionTimeoutMillis: 3000, query_timeout: 3500,
    application_name: "issue416_w30_readonly_acceptance",
  });
}

async function readOnlyPreflight(client, target) {
  await client.query("BEGIN READ ONLY ISOLATION LEVEL READ COMMITTED");
  try {
    const identity = (await client.query(IDENTITY_SQL)).rows;
    if (identity.length !== 1) {
      throw new Error("W30_PG17_IDENTITY_ROW_COUNT");
    }
    const attested = assertAcceptanceIdentity(identity[0], target);
    const ledger = (await client.query(MIGRATION_SQL)).rows;
    const migrations = assertCommittedExactLedger(ledger);
    const acl = (await client.query(ACL_SQL, [target.runtime])).rows;
    const funcs = (await client.query(FUNCTION_ACL_SQL, [target.runtime])).rows;
    assertPrivateAcl(acl, funcs);
    return Object.freeze({ ...attested, migrations, aclTables: acl.length });
  } finally {
    await client.query("ROLLBACK").catch(() => {});
  }
}

export async function runPg17ReadOnlyPreflight(env = process.env) {
  const t = assertAcceptanceEnvironment(env);
  inspectDockerFixture();
  const client = clientFor(env);
  try {
    await client.connect();
    return await readOnlyPreflight(client, t);
  } finally {
    await client.end().catch(() => {});
  }
}

async function pairForSmoke(env) {
  const t = assertAcceptanceEnvironment(env);
  inspectDockerFixture();
  const a = clientFor(env);
  const b = clientFor(env);
  try {
    await a.connect();
    await b.connect();
    const aid = await readOnlyPreflight(a, t);
    const bid = await readOnlyPreflight(b, t);
    if (aid.backendPid === bid.backendPid || aid.serverStarted !== bid.serverStarted) {
      throw new Error("W30_PG17_TWO_DISTINCT_SAME_SERVER_CONNECTIONS_REQUIRED");
    }
    const owned = await a.query(
      "SELECT pg_try_advisory_lock($1::integer,$2::integer) AS acquired",
      SESSION_LEASE,
    );
    if (owned.rows[0]?.acquired !== true) {
      throw new Error("W30_PG17_FIXTURE_LEASE_ALREADY_OWNED");
    }
    const concurrent = await b.query(
      "SELECT pg_try_advisory_lock($1::integer,$2::integer) AS acquired",
      SESSION_LEASE,
    );
    if (concurrent.rows[0]?.acquired !== false) {
      if (concurrent.rows[0]?.acquired === true) {
        await b.query("SELECT pg_advisory_unlock($1::integer,$2::integer)", SESSION_LEASE);
      }
      throw new Error("W30_PG17_FIXTURE_LEASE_NOT_EXCLUSIVE");
    }
    return { a, b, aid, bid };
  } catch (error) {
    await Promise.allSettled([a.end(), b.end()]);
    throw error;
  }
}

async function waitForPhysicalWitness(holder, waiterPid, holdingPid) {
  const deadline = Date.now() + 1400;
  while (Date.now() < deadline) {
    const rows = (await holder.query(BLOCKING_WITNESS_SQL, [
      waiterPid, holdingPid,
    ])).rows;
    try {
      return validateBlockingWitness(rows, {
        waitingPid: waiterPid, holdingPid, namedFence: "W30_TEST_ONLY_ADVISORY",
      });
    } catch (error) {
      if (error.message !== "ISSUE416_RACE_PHYSICAL_LOCK_WAIT_NOT_OBSERVED") {
        throw error;
      }
    }
    await delay(20); // Polls PG evidence, never generates the contested lock.
  }
  throw new Error("W30_PG17_NO_PHYSICAL_BLOCKING_WITNESS");
}

// Physical transport and SQL rollback smoke ONLY. No auth command, domain case,
// admission rank, receipt or audit is exercised; zero of the 210 trials pass.
async function onePhysicalSmoke(direction, outcome, env) {
  if (!["C", "R", "D", "T"].includes(outcome) ||
      !["A-first", "B-first"].includes(direction)) {
    throw new Error("W30_PG17_UNSUPPORTED_TRANSPORT_FAULT");
  }
  const pair = await pairForSmoke(env);
  const holder = direction === "A-first" ? pair.a : pair.b;
  const waiter = direction === "A-first" ? pair.b : pair.a;
  const holdingPid = direction === "A-first" ? pair.aid.backendPid : pair.bid.backendPid;
  const waitingPid = direction === "A-first" ? pair.bid.backendPid : pair.aid.backendPid;
  let waiting;
  try {
    await holder.query("BEGIN READ ONLY ISOLATION LEVEL READ COMMITTED");
    await holder.query("SET LOCAL lock_timeout = '2000ms'");
    await holder.query("SET LOCAL statement_timeout = '3000ms'");
    await holder.query(
      "SELECT pg_advisory_xact_lock($1::integer,$2::integer)", TEST_FENCE,
    );
    await waiter.query("BEGIN READ ONLY ISOLATION LEVEL READ COMMITTED");
    await waiter.query("SET LOCAL lock_timeout = '2000ms'");
    await waiter.query("SET LOCAL statement_timeout = '3000ms'");
    waiting = waiter.query(
      "SELECT pg_advisory_xact_lock($1::integer,$2::integer)", TEST_FENCE,
    ).then(() => ({ ok: true }), (error) => ({ ok: false, sqlstate: error.code }));
    const witness = await waitForPhysicalWitness(holder, waitingPid, holdingPid);
    if (witness.namedFenceVerified !== false || !witness.observedPhysicalWait) {
      throw new Error("W30_PG17_SYNTHETIC_FENCE_MISREPRESENTED");
    }
    if (outcome === "T") {
      const result = await waiting;
      if (result.ok || result.sqlstate !== "55P03") {
        throw new Error("W30_PG17_LOCK_TIMEOUT_SQLSTATE_MISSING");
      }
      await waiter.query("ROLLBACK");
      await holder.query("ROLLBACK");
    } else {
      if (outcome === "D") {
        await holder.end(); // Disconnect before any COMMIT; backend ROLLBACK.
      } else {
        await holder.query(outcome === "C" ? "COMMIT" : "ROLLBACK");
      }
      const result = await waiting;
      if (!result.ok) throw new Error("W30_PG17_WAIT_FAILED_AFTER_RELEASE");
      if (outcome === "D") {
        const alive = await waiter.query(
          "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid=$1::integer) AS alive",
          [holdingPid],
        );
        if (alive.rows[0]?.alive !== false) {
          throw new Error("W30_PG17_PRECOMMIT_DISCONNECT_NOT_CONFIRMED");
        }
      }
      await waiter.query("ROLLBACK");
    }
    return Object.freeze({ direction, outcome, physicalWait: true });
  } finally {
    await Promise.allSettled([pair.a.end(), pair.b.end()]);
  }
}

export async function runPg17PhysicalLockSmoke(env = process.env) {
  const observations = [];
  for (const direction of ["A-first", "B-first"]) {
    for (const outcome of ["C", "R", "D", "T"]) {
      observations.push(await onePhysicalSmoke(direction, outcome, env));
    }
  }
  return Object.freeze({
    status: "PHYSICAL_TRANSPORT_SMOKE_ONLY",
    physicalSmokes: observations.length,
    domainAcceptancePassed: 0,
    domainAcceptanceDeclared: 210,
  });
}
