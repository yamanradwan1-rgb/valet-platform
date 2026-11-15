import { randomBytes, randomUUID } from "node:crypto";

import {
  begin, observeQuotaWait, quotaCounts, quotaInput, reserve, withQuotaPair,
} from "./pg17-quota-fixture.mjs";

function equal(a, b) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error("W38_QUOTA_DURABLE_POSTCONDITION_MISMATCH");
  }
}

export async function runQuotaInterleaving(direction, outcome) {
  if (!["A-first", "B-first"].includes(direction) ||
    !["C", "R", "D", "T"].includes(outcome)) {
    throw new Error("W38_QUOTA_INVALID_INTERLEAVING");
  }
  return withQuotaPair(async ({ a, b, aid, bid }) => {
    const holder = direction === "A-first" ? a : b;
    const waiter = direction === "A-first" ? b : a;
    const holdingPid = direction === "A-first" ? aid : bid;
    const waitingPid = direction === "A-first" ? bid : aid;
    const input = quotaInput();
    await begin(holder);
    const first = await reserve(holder, input);
    await begin(waiter, outcome === "T" ? 550 : 2500);
    const waiting = reserve(waiter, input).then(
      (ids) => ({ ids }), (error) => ({ sqlstate: error.code }),
    );
    await observeQuotaWait(holder, waitingPid, holdingPid);
    if (outcome === "T") {
      const result = await waiting;
      equal(result.sqlstate, "55P03");
      await waiter.query("ROLLBACK");
      await holder.query("ROLLBACK");
      equal(await quotaCounts(holder, input.audience, input.operationId), [0, 0]);
      return { direction, outcome, sqlstate: "55P03", physicalWait: true };
    }
    if (outcome === "D") {
      await holder.end();
    } else {
      await holder.query(outcome === "C" ? "COMMIT" : "ROLLBACK");
    }
    const result = await waiting;
    if (!result.ids) throw new Error("W38_QUOTA_UNEXPECTED_WAITING_SQLSTATE");
    equal(result.ids.length, 4);
    if (outcome === "C") equal(first, result.ids);
    else if (first.some((id) => result.ids.includes(id))) {
      throw new Error("W38_QUOTA_ROLLED_BACK_RESERVATION_RESURRECTED");
    }
    if (outcome === "D") {
      const alive = await waiter.query(
        "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid=$1) AS alive",
        [holdingPid],
      );
      equal(alive.rows[0].alive, false);
    }
    await waiter.query("COMMIT");
    equal(await quotaCounts(waiter, input.audience, input.operationId), [1, 4]);
    return { direction, outcome, physicalWait: true, bundleCount: 1, entryCount: 4 };
  });
}

export async function runQuotaConflictingFingerprint(direction) {
  return withQuotaPair(async ({ a, b, aid, bid }) => {
    const holder = direction === "A-first" ? a : b;
    const waiter = direction === "A-first" ? b : a;
    const input = quotaInput();
    const changed = { ...input, fingerprint: randomBytes(32) };
    await begin(holder);
    await reserve(holder, input);
    await begin(waiter);
    const waiting = reserve(waiter, changed).then(
      () => ({ ok: true }), (error) => ({ sqlstate: error.code }),
    );
    await observeQuotaWait(holder,
      direction === "A-first" ? bid : aid,
      direction === "A-first" ? aid : bid);
    await holder.query("COMMIT");
    const result = await waiting;
    equal(result.sqlstate, "23505");
    await waiter.query("ROLLBACK");
    equal(await quotaCounts(holder, input.audience, input.operationId), [1, 4]);
    return { direction, sqlstate: "23505", physicalWait: true };
  });
}

export async function runQuotaCapacityNegative() {
  return withQuotaPair(async ({ a, b }) => {
    const audience = `w38-cap-${randomUUID()}`;
    const targetHash = `anti-abuse-hmac-sha256:v1:${randomBytes(32).toString("hex")}`;
    for (let i = 0; i < 3; i++) {
      await begin(a);
      await reserve(a, quotaInput({ audience, targetHash }));
      await a.query("COMMIT");
    }
    await begin(b);
    const over = quotaInput({ audience, targetHash });
    const rejected = await reserve(b, over).then(
      () => ({ ok: true }), (error) => ({ sqlstate: error.code }),
    );
    equal(rejected.sqlstate, "P0001");
    await b.query("ROLLBACK");
    equal(await quotaCounts(a, over.audience, over.operationId), [0, 0]);
    return { committedReservations: 3, fourthSqlstate: "P0001" };
  });
}

export async function runR03UnboundDenials() {
  return withQuotaPair(async ({ a, b }) => {
    const audience = `w38-r03-${randomUUID()}`;
    const requestId = randomUUID();
    const hash = `anti-abuse-hmac-sha256:v1:${randomBytes(32).toString("hex")}`;
    for (const [client, table, columns, params] of [
      [a, "reset_redeem_client_attempts", "audience,request_id,key_hash,occurred_at,reservation_xid",
        [audience, requestId, hash]],
      [b, "reset_redeem_credential_attempts",
        "audience,request_id,client_attempt_id,key_hash,occurred_at,reservation_xid",
        [audience, requestId, randomUUID(), hash]],
    ]) {
      await begin(client);
      const placeholders = params.map((_, i) => `$${i + 1}`).join(",");
      const sql = `INSERT INTO auth_proof_private.${table} (${columns})
        VALUES (${placeholders},clock_timestamp(),1)`;
      const denied = await client.query(sql, params).then(
        () => ({ ok: true }), (error) => ({ sqlstate: error.code, detail: error.message }),
      );
      equal(denied.sqlstate, "42501");
      if (!denied.detail?.includes("VAP1_R03_TRUSTED_BINDER_UNAVAILABLE")) {
        throw new Error("W38_R03_UNBOUND_TRIGGER_NOT_PROVEN");
      }
      await client.query("ROLLBACK");
    }
    const results = await a.query(`SELECT
      (SELECT count(*)::int FROM auth_proof_private.reset_redeem_client_attempts
        WHERE audience=$1) AS clients,
      (SELECT count(*)::int FROM auth_proof_private.reset_redeem_credential_attempts
        WHERE audience=$1) AS credentials`, [audience]);
    equal([results.rows[0].clients, results.rows[0].credentials], [0, 0]);
    return { clientDenied: "42501", credentialDenied: "42501", persistentRows: 0 };
  });
}

export async function runDormantQuotaControls() {
  const results = [];
  for (const direction of ["A-first", "B-first"]) {
    for (const outcome of ["C", "R", "D", "T"]) {
      results.push(await runQuotaInterleaving(direction, outcome));
    }
    results.push(await runQuotaConflictingFingerprint(direction));
  }
  results.push(await runQuotaCapacityNegative());
  results.push(await runR03UnboundDenials());
  return Object.freeze({ status: "DORMANT_QUOTA_NEGATIVE_CONTROLS_ONLY",
    controlsExecuted: results.length, domainTrialsPassed: 0, domainTrialsBlocked: 210 });
}
