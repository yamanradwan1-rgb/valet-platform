// Run only against the W27-owned, synthetic, isolated PG17 Docker fixture.
// This verifies a codec, not authorization, a signer, or a reset command.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { test } from "node:test";

const fixture = "vaylet-issue416-w27-pg17";
const operation = "00000000-0000-0000-0000-000000000001";
const prefix = Buffer.from("VAYLET/VAP1\0", "utf8");
const arrayPrefix = Buffer.from("VAYLET/VAP1/ARRAY\0", "utf8");
const uuid = (value) => Buffer.from(value.replaceAll("-", ""), "hex");
const u16 = (value) => {
  const result = Buffer.alloc(2);
  result.writeUInt16BE(value);
  return result;
};
const u32 = (value) => {
  const result = Buffer.alloc(4);
  result.writeUInt32BE(value);
  return result;
};
const u64 = (value) => {
  const result = Buffer.alloc(8);
  result.writeBigUInt64BE(BigInt(value));
  return result;
};
const bytes = (value) => Buffer.from(value, "utf8");
const field = (id, kind, value) =>
  Buffer.concat([u16(id), Buffer.from([kind]), u32(value.length), value]);
const frame = (kind, fields) =>
  Buffer.concat([
    prefix, Buffer.from([kind]), u16(1), u16(fields.length), ...fields,
  ]);

function invokeDocker(args) {
  const run = spawnSync("docker", args, { encoding: "utf8", timeout: 30000 });
  if (run.error) throw run.error;
  return { code: run.status, stdout: run.stdout.trim(), stderr: run.stderr.trim() };
}

const inspect = invokeDocker(["inspect", fixture]);
assert.equal(inspect.code, 0, "explicit W27 fixture is required");
const container = JSON.parse(inspect.stdout)[0];
assert.equal(container.Config.Image, "postgres:17-alpine");
assert.equal(container.Config.Labels["vaylet.owner"], "worker-27");
assert.equal(container.Config.Labels["vaylet.environment"], "isolated-test");
assert.equal(container.Config.Labels["vaylet.disposable"], "true");
assert.equal(container.State.Running, true);

function sql(statement, { expectedFailure = false } = {}) {
  const run = invokeDocker([
    "exec", fixture, "psql", "-U", "issue416_w27_migration",
    "-d", "issue416_w27_db", "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1",
    "-c", statement,
  ]);
  if (expectedFailure) {
    assert.notEqual(run.code, 0, "malformed/unauthorized input must be rejected");
    return run.stderr;
  }
  assert.equal(run.code, 0, run.stderr);
  return run.stdout.split(/\r?\n/).at(-1).trim();
}

const emptyGroup = (group) => Buffer.concat([
  arrayPrefix, u16(1), Buffer.from([group + 11]), u32(0),
]);
const groupsSql = "ARRAY(SELECT auth_proof_private.empty_state_group(i) FROM generate_series(5,20) i)";
const stateSql = (groups = groupsSql) =>
  `SET ROLE vap1_proof_owner; SELECT pg_catalog.encode(auth_proof_private.state_frame_v1('${operation}'::uuid, 'STAFF_LOGIN_COMMIT', 1, ${groups}), 'hex');`;

test("closed 20-field state TLV: independent Node and real PG17 bytes match", () => {
  const fields = [
    field(1, 2, u32(1)),
    field(2, 5, uuid(operation)),
    field(3, 4, bytes("STAFF_LOGIN_COMMIT")),
    field(4, 3, u64(1)),
    ...Array.from({ length: 16 }, (_, index) => {
      const group = index + 5;
      return field(group, 6, emptyGroup(group));
    }),
  ];
  const expected = frame(3, fields);
  const actual = sql(stateSql());
  assert.equal(actual, expected.toString("hex"));
  assert.equal(expected.readUInt16BE(prefix.length + 3), 20);
  assert.equal(createHash("sha256").update(expected).digest().length, 32);
});

test("reject malformed groups, missing group, wrong kind and forged count", () => {
  const invalidCases = [
    "ARRAY(SELECT CASE WHEN i=5 THEN '\\x00'::bytea ELSE auth_proof_private.empty_state_group(i) END FROM generate_series(5,20) i)",
    "ARRAY(SELECT auth_proof_private.empty_state_group(i) FROM generate_series(5,19) i)",
    "ARRAY(SELECT CASE WHEN i=5 THEN auth_proof_private.empty_state_group(6) ELSE auth_proof_private.empty_state_group(i) END FROM generate_series(5,20) i)",
    "ARRAY(SELECT CASE WHEN i=5 THEN pg_catalog.set_byte(auth_proof_private.empty_state_group(5),24,1) ELSE auth_proof_private.empty_state_group(i) END FROM generate_series(5,20) i)",
    "ARRAY(SELECT CASE WHEN i=5 THEN auth_proof_private.empty_state_group(5) || '\\x00'::bytea ELSE auth_proof_private.empty_state_group(i) END FROM generate_series(5,20) i)",
  ];
  for (const groups of invalidCases) {
    const stderr = sql(stateSql(groups), { expectedFailure: true });
    assert.match(stderr, /VAP1_STATE_NONCANONICAL/);
  }
});

test("state group row requires exact field order, type and count", () => {
  const row = [
    "auth_proof_private.u16(1)", "auth_proof_private.u16(5)",
    `auth_proof_private.tlv_field(1,5,pg_catalog.uuid_send('${operation}'::uuid))`,
  ];
  row.push(
    "auth_proof_private.tlv_field(2,4,pg_catalog.convert_to('u@example.test','UTF8'))",
    "auth_proof_private.tlv_field(3,4,pg_catalog.convert_to('ACTIVE','UTF8'))",
    "auth_proof_private.tlv_field(4,0,'\\x'::bytea)",
    "auth_proof_private.tlv_field(5,7,pg_catalog.decode(repeat('11',32),'hex'))",
  );
  const validRecord = row.join(" || ");
  sql(`SET ROLE vap1_proof_owner; SELECT auth_proof_private.assert_state_row(6,${validRecord});`);
  const wrongType = validRecord.replace(
    "tlv_field(3,4,pg_catalog.convert_to('ACTIVE','UTF8'))",
    "tlv_field(3,5,pg_catalog.uuid_send('00000000-0000-0000-0000-000000000002'::uuid))",
  );
  assert.match(
    sql(`SET ROLE vap1_proof_owner; SELECT auth_proof_private.assert_state_row(6,${wrongType});`,
      { expectedFailure: true }),
    /VAP1_STATE_NONCANONICAL/,
  );
  assert.match(
    sql(`SET ROLE vap1_proof_owner; SELECT auth_proof_private.assert_state_row(6,${validRecord} || '\\x00'::bytea);`,
      { expectedFailure: true }),
    /VAP1_STATE_NONCANONICAL/,
  );
});

test("full 18-field syntactic proof vector: PG17 SHA256/HMAC match frozen specification", () => {
  const key = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
  const setup = `
    BEGIN;
    SET ROLE vap1_proof_owner;
    INSERT INTO auth_proof_private.proof_keys(audience,key_id,root_key,promotion_epoch,disposition)
      VALUES ('test','k1',decode('${key}','hex'),1,'ACTIVE_SIGNING');
    INSERT INTO auth_proof_private.proof_purposes(purpose,actor_kind)
      VALUES ('LOGIN','ANONYMOUS');
    INSERT INTO auth_proof_private.proof_challenges(
      challenge_id,audience,key_id,promotion_epoch,purpose,operation_id,nonce,
      backend_pid,full_xid,actor_kind,subject_user_id,payload_digest,state_digest,
      issued_at_ms,expires_at_ms
    ) VALUES (
      '00000000-0000-0000-0000-000000000003','test','k1',1,'LOGIN',
      '${operation}',decode(repeat('a5',32),'hex'),1234,4294967297,'ANONYMOUS',
      '00000000-0000-0000-0000-000000000002',
      decode('f7461d21c52f716334a63b35ea279fb307821531c5978eba3d024aed736d159c','hex'),
      decode(repeat('11',32),'hex'),1700000000000,1700000030000
    );
    SELECT encode(auth_proof_crypto.digest(proof_bytes,'sha256'),'hex') || ':' ||
      encode(auth_proof_private.pgcrypto_hmac(proof_bytes,decode('${key}','hex')),'hex')
    FROM (SELECT auth_proof_private.proof_bytes(
      '00000000-0000-0000-0000-000000000003'::uuid) AS proof_bytes) v;
    ROLLBACK;`;
  const run = invokeDocker([
    "exec", fixture, "psql", "-U", "issue416_w27_migration",
    "-d", "issue416_w27_db", "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1",
    "-c", setup,
  ]);
  assert.equal(run.code, 0, run.stderr);
  assert.match(run.stdout,
    /9207707792636b1fca6f07b7ea0df1e0b39e0f04087c470701a1c0261de8fa29:2b0da4ae9b1dc22e10bedc1e1c0a31fe1f2c339273f49092116eaa26d4799fbb/);
});

test("private state codec has no ordinary runtime or PUBLIC grant", () => {
  const acl = sql(`SELECT has_schema_privilege('issue416_w27_runtime',
    'auth_proof_private','USAGE')::text || ':' ||
    has_function_privilege('issue416_w27_runtime',
      'auth_proof_private.state_frame_v1(uuid,text,bigint,bytea[])','EXECUTE')::text || ':' ||
    EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        COALESCE(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
      WHERE p.oid = 'auth_proof_private.state_frame_v1(uuid,text,bigint,bytea[])'::regprocedure
        AND a.grantee = 0 AND a.privilege_type = 'EXECUTE')::text;`);
  assert.equal(acl, "false:false:false");
});
