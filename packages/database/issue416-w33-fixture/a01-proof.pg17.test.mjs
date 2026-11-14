// Synthetic worker-33 PostgreSQL 17 only. Never connects to a real database.
import assert from "node:assert/strict";
import { createHmac, createHash, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { test } from "node:test";
import readline from "node:readline";

const fixture = "vaylet-issue416-w33-pg17";
const database = "issue416_w33_db";
const migrationRole = "issue416_w33_migration";
const key = Buffer.from(Array.from({ length: 32 }, (_, i) => i));
const user = randomUUID();
const sessionId = randomUUID();
const refreshId = randomUUID();
const limiterId = randomUUID();
const operation = randomUUID();
const audit = randomUUID();
const phc = "$argon2id$v=19$m=65536,t=3,p=4$c3ludGhldGlj$bm90LXJlYWwtaGFzaA";
const fingerprint = "e".repeat(64);
const keyHash = "anti-abuse-hmac-sha256:v1:" + "a".repeat(64);
const hash = (x) => createHash("sha256").update(x).digest("hex");
const access = "staff-access-sha256:v1:" + hash(sessionId);
const refresh = "staff-refresh-sha256:v1:" + hash(refreshId);
const uuidSql = (v) => "'" + v + "'::uuid";
const hexSql = (v) => "decode('" + v + "','hex')";

class FixtureSession {
  constructor() {
    this.proc = spawn("docker", [
      "exec", "-i", fixture, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
      "-U", migrationRole, "-d", database, "-P", "pager=off",
    ], { stdio: ["pipe", "pipe", "pipe"] });
    this.lines = [];
    this.pending = undefined;
    this.index = 0;
    this.stderr = "";
    const reader = readline.createInterface({ input: this.proc.stdout });
    reader.on("line", (line) => {
      if (!this.pending) return;
      if (line.trim() === this.pending.marker) {
        const done = this.pending;
        this.pending = undefined;
        done.resolve(this.lines.join("\n"));
      } else this.lines.push(line);
    });
    this.proc.stderr.on("data", (data) => {
      this.stderr += data.toString();
    });
    this.proc.on("exit", (code) => {
      if (this.pending) {
        const done = this.pending;
        this.pending = undefined;
        done.reject(new Error("psql exited " + code + ": " + this.stderr));
      }
    });
  }
  query(sql) {
    assert.equal(this.pending, undefined, "Concurrent psql query");
    const marker = "__w33_sql_" + ++this.index + "__";
    this.lines = [];
    return new Promise((resolve, reject) => {
      this.pending = { marker, resolve, reject };
      this.proc.stdin.write(sql.trim() + ";\n\\echo " + marker + "\n");
    });
  }
  close() {
    this.proc.stdin.end();
  }
}

const sqlArgs = [
  "'w33-test'", uuidSql(operation), uuidSql(user), hexSql(hash(phc)),
  uuidSql(sessionId), uuidSql(refreshId), "'" + access + "'",
  "'" + refresh + "'", uuidSql(limiterId), hexSql(fingerprint),
].join(",");
const inspect = spawnSync("docker", ["inspect", fixture], { encoding: "utf8" });
assert.equal(inspect.status, 0);
const live = JSON.parse(inspect.stdout)[0];
assert.equal(live.Config.Image, "postgres:17-alpine");
assert.equal(live.Config.Labels["vaylet.owner"], "worker-33");
assert.equal(live.Config.Labels["vaylet.environment"], "isolated-test");
assert.equal(live.HostConfig.NetworkMode, "none");
assert.equal(live.State.Running, true);

test("A01 full source-derived challenge with independently computed HMAC", async () => {
  const setup = new FixtureSession();
  try {
    await setup.query(`
      BEGIN;
      INSERT INTO public.users(id,email,password_hash,status,updated_at)
        VALUES (${uuidSql(user)},'w33+${user}@synthetic.test', '${phc}',
          'ACTIVE',clock_timestamp());
      INSERT INTO public.anti_abuse_events(id,scope,key_hash,state)
        VALUES (${uuidSql(limiterId)},'v1:staff-login-identifier',
          '${keyHash}','PENDING');
      SET ROLE vap1_proof_owner;
      INSERT INTO auth_proof_private.proof_keys (
        audience,key_id,root_key,promotion_epoch,disposition
      ) VALUES ('w33-test','w33-key',${hexSql(key.toString("hex"))},1,
        'ACTIVE_SIGNING') ON CONFLICT DO NOTHING;
      INSERT INTO auth_proof_private.key_selection (
        audience,key_id,promotion_epoch
      ) VALUES ('w33-test','w33-key',1) ON CONFLICT DO NOTHING;
      UPDATE auth_proof_private.proof_purposes SET enabled=true
        WHERE purpose='STAFF_LOGIN_COMMIT';
      UPDATE auth_proof_private.security_boundary
        SET phase='DRAINED',boundary_epoch=2
        WHERE singleton AND phase='LEGACY_COMPAT';
      UPDATE auth_proof_private.security_boundary
        SET phase='PROTECTED',deployment_audience='w33-test',
          t0_audit_event_id=${uuidSql(audit)},boundary_epoch=3
        WHERE singleton AND phase='DRAINED';
      INSERT INTO auth_proof_private.authority_admissions(
        audience,object_kind,object_key_bytes,disposition,
        admission_version,material_digest,operator_reference,audit_event_id
      ) VALUES (
        'w33-test','USER',decode('01${user.replaceAll("-", "")}','hex'),
        'ADMIT',1,
        pg_catalog.substring(auth_proof_private.user_state_row_v1(
          ${uuidSql(user)}),
          pg_catalog.octet_length(auth_proof_private.user_state_row_v1(
            ${uuidSql(user)})) - 31, 32),
        'worker33-synthetic',${uuidSql(audit)});
      COMMIT
    `);
    // Independent prior transaction: no same-XID reservation laundering.
    const lease = await setup.query(`BEGIN; SET ROLE vap1_proof_owner;
      SELECT auth_proof_private.a01_bind_limiter(
        'w33-test',${uuidSql(operation)},${uuidSql(limiterId)},
        ${hexSql(fingerprint)},'${keyHash}');
      COMMIT`);
    assert.ok(lease.includes(limiterId),lease);
  } finally { setup.close(); }

  const run = new FixtureSession();
  try {
    await run.query("BEGIN; SET ROLE vap1_proof_owner");
    const response = await run.query(`SELECT
      challenge_id,encode(proof_bytes,'hex'),
      encode(payload_bytes,'hex'),encode(state_bytes,'hex'),
      backend_pid,full_xid FROM auth_proof_private.a01_prepare(${sqlArgs})`);
    const fields = response.split("|");
    assert.equal(fields.length, 6, response);
    const [challengeId, proofHex, payloadHex, stateHex, pid, xid] = fields;
    assert.equal(challengeId?.length, 36);
    assert.equal(Buffer.from(proofHex, "hex").subarray(0, 11).toString(),
      "VAYLET/VAP1");
    assert.equal(Buffer.from(payloadHex, "hex").subarray(0, 11).toString(),
      "VAYLET/VAP1");
    assert.equal(Buffer.from(stateHex, "hex").subarray(0, 11).toString(),
      "VAYLET/VAP1");
    assert.ok(Number(pid) > 0 && BigInt(xid) > 0n);
    const mac = createHmac("sha256", key)
      .update(Buffer.from(proofHex, "hex")).digest("hex");
    // PL/pgSQL exception subtransactions preserve the same genuine backend
    // and full XID while proving tampering fails without consuming the nonce.
    const reject = (candidateMac, candidateProof, expectedSqlState = "42501") => `
      DO $w33_neg$ BEGIN
        PERFORM 1 FROM auth_proof_private.a01_execute(
          ${[uuidSql(challengeId),hexSql(candidateProof),
            hexSql(candidateMac),sqlArgs].join(",")});
        RAISE EXCEPTION 'UNEXPECTED_A01_ACCEPTANCE';
      EXCEPTION WHEN SQLSTATE '${expectedSqlState}' THEN NULL;
      END $w33_neg$`;
    await run.query(reject("f".repeat(64),proofHex));
    await run.query(reject(mac,"00" + proofHex.slice(2)));
    const execute = await run.query(`SELECT * FROM auth_proof_private.a01_execute(
      ${uuidSql(challengeId)},${hexSql(proofHex)},${hexSql(mac)},
      ${sqlArgs})`);
    assert.ok(execute.includes(sessionId),execute);
    await run.query(reject(mac,proofHex,"23505"));
    await run.query("COMMIT");
  } finally { run.close(); }

  const verify = new FixtureSession();
  try {
    await verify.query("SET ROLE vap1_proof_owner");
    const persisted = await verify.query(`SELECT
      (SELECT count(*) FROM public.staff_auth_sessions
        WHERE id=${uuidSql(sessionId)}),
      (SELECT count(*) FROM public.staff_refresh_credentials
        WHERE id=${uuidSql(refreshId)}),
      (SELECT state FROM public.anti_abuse_events
        WHERE id=${uuidSql(limiterId)}),
      (SELECT count(*) FROM auth_proof_private.operation_receipts
        WHERE operation_id=${uuidSql(operation)})`);
    assert.equal(persisted, "1|1|IGNORED|1");
    const runtime = await verify.query(`SELECT
      has_schema_privilege('issue416_w33_runtime',
        'auth_proof_private','USAGE'),
      has_function_privilege('issue416_w33_runtime',
        'auth_proof_private.a01_prepare(text,uuid,uuid,bytea,uuid,uuid,text,text,uuid,bytea)',
        'EXECUTE')`);
    assert.equal(runtime, "f|f");
    const receiptArgs = [
      "'w33-test'",uuidSql(operation),uuidSql(user),uuidSql(sessionId),
      uuidSql(refreshId),uuidSql(limiterId),
      "'" + access + "'","'" + refresh + "'",
    ];
    const readback = await verify.query(`SELECT receipt_status FROM
      auth_proof_private.a01_read_commit_receipt(
        ${receiptArgs.join(",")})`);
    assert.equal(readback, "COMMITTED");
    const wrongVerifier = await verify.query(`SELECT receipt_status FROM
      auth_proof_private.a01_read_commit_receipt(
        ${[...receiptArgs.slice(0,7),
          "'staff-refresh-sha256:v1:" + "f".repeat(64) + "'"].join(",")})`);
    assert.equal(wrongVerifier, "UNKNOWN");
    const observerGrant = await verify.query(`SELECT has_function_privilege(
      'issue416_w33_runtime',
      'auth_proof_private.a01_read_commit_receipt(text,uuid,uuid,uuid,uuid,uuid,text,text)',
      'EXECUTE')`);
    assert.equal(observerGrant, "f");
    const unresolved = await verify.query(`SELECT
      auth_proof_private.a01_count_unresolved(
        'w33-test',${uuidSql(operation)},${uuidSql(limiterId)})`);
    assert.equal(unresolved, "IGNORED");
    const wrongLease = await verify.query(`
      DO $w33_wrong_xid$ BEGIN
        PERFORM auth_proof_private.consume_verified_challenge(
          (SELECT challenge_id FROM auth_proof_private.proof_challenges
            WHERE operation_id=${uuidSql(operation)}),
          (SELECT auth_proof_private.proof_bytes(challenge_id)
            FROM auth_proof_private.proof_challenges
            WHERE operation_id=${uuidSql(operation)}),
          ${hexSql("00".repeat(32))},
          (SELECT payload_digest FROM auth_proof_private.proof_challenges
            WHERE operation_id=${uuidSql(operation)}),
          (SELECT state_digest FROM auth_proof_private.proof_challenges
            WHERE operation_id=${uuidSql(operation)}));
        RAISE EXCEPTION 'UNEXPECTED_REPLAY_ACCEPTANCE';
      EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
      END $w33_wrong_xid$`);
    assert.equal(wrongLease, "");
  } finally { verify.close(); }
});
