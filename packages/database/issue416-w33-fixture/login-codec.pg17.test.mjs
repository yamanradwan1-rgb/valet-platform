// Independent Node ↔ W27 disposable PG17 v1 login codec tests.
// A stored PHC digest alone never attests Argon2 password possession.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const fixture = "vaylet-issue416-w33-pg17";
const operation = "00000000-0000-0000-0000-000000000015";
const id = "00000000-0000-0000-0000-000000000011";
const session = "00000000-0000-0000-0000-000000000012";
const refresh = "00000000-0000-0000-0000-000000000013";
const limiter = "00000000-0000-0000-0000-000000000014";
const email = "staff@example.test";
const phc = "$argon2id$v=19$m=65536,t=3,p=4$c3ludGhldGlj$bm90LXJlYWwtaGFzaA";
const digest = (value) => createHash("sha256").update(value).digest();
const bytes = (text) => Buffer.from(text, "utf8");
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
const field = (idValue, type, value) => Buffer.concat([
  u16(idValue), Buffer.from([type]), u32(value.length), value,
]);
function run(command) {
  const result = spawnSync("docker", command, {
    encoding: "utf8", timeout: 30000,
  });
  if (result.error) throw result.error;
  return result;
}
const inspect = run(["inspect", fixture]);
assert.equal(inspect.status, 0);
const container = JSON.parse(inspect.stdout)[0];
assert.equal(container.Config.Image, "postgres:17-alpine");
assert.equal(container.Config.Labels["vaylet.owner"], "worker-33");
assert.equal(container.Config.Labels["vaylet.environment"], "isolated-test");
assert.equal(container.State.Running, true);
function sql(source, expectedFailure = false) {
  const result = run([
    "exec", fixture, "psql", "-U", "issue416_w33_migration",
    "-d", "issue416_w33_db", "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1",
    "-c", source,
  ]);
  if (expectedFailure) assert.notEqual(result.status, 0);
  else assert.equal(result.status, 0, result.stderr);
  return result.stdout + result.stderr;
}
function transaction(statement) {
  return "BEGIN; INSERT INTO public.users(id,email,password_hash,status,updated_at) VALUES " +
    "('" + id + "'::uuid,'" + email + "','" + phc + "','ACTIVE',clock_timestamp()); " +
    "SET ROLE vap1_proof_owner; " + statement + "; ROLLBACK;";
}

test("exact source User row hashes stored PHC and matches Node TLV", () => {
  const prefixFields = [
    field(1, 5, uuid(id)),
    field(2, 4, bytes(email)),
    field(3, 4, bytes("ACTIVE")),
    field(4, 7, digest(bytes(phc))),
  ];
  const versionPrefix = Buffer.concat([u16(1), u16(4), ...prefixFields]);
  const expected = Buffer.concat([
    u16(1), u16(5), ...prefixFields, field(5, 7, digest(versionPrefix)),
  ]);
  const actual = sql(transaction(
    "SELECT encode(auth_proof_private.user_state_row_v1('" + id + "'::uuid),'hex')",
  ));
  assert.ok(actual.includes(expected.toString("hex")));
  assert.ok(!actual.includes(phc));
});

test("exact DB-selected User group + verified current PHC fence", () => {
  const group = sql(transaction(
    "SELECT encode(auth_proof_private.user_state_group_v1('" + id + "'::uuid),'hex')",
  ));
  assert.match(group, /5641594c45542f564150312f4152524159000001110000000106/);
  const good = digest(bytes(phc)).toString("hex");
  sql(transaction(
    "SELECT auth_proof_private.assert_a01_password_version('" + id +
      "'::uuid,decode('" + good + "','hex'))",
  ));
  const rejected = sql(transaction(
    "SELECT auth_proof_private.assert_a01_password_version('" + id +
      "'::uuid,decode(repeat('ff',32),'hex'))",
  ), true);
  assert.match(rejected, /VAP1_A01_PASSWORD_VERSION_STALE/);
});

test("ten-field A01 canonical payload matches Node encoding", () => {
  const access = "staff-access-sha256:v1:" + "a".repeat(64);
  const renewal = "staff-refresh-sha256:v1:" + "b".repeat(64);
  const expected = Buffer.concat([
    bytes("VAYLET/VAP1\0"), Buffer.from([1]), u16(1), u16(10),
    field(1, 2, u32(1)), field(2, 5, uuid(operation)),
    field(3, 4, bytes("STAFF_LOGIN_COMMIT")),
    field(4, 5, uuid(id)), field(5, 7, digest(bytes(phc))),
    field(6, 5, uuid(session)), field(7, 5, uuid(refresh)),
    field(8, 4, bytes(access)), field(9, 4, bytes(renewal)),
    field(10, 5, uuid(limiter)),
  ]);
  const sqlPayload = (candidate) =>
    "SET ROLE vap1_proof_owner; SELECT encode(auth_proof_private.a01_payload_v1(" +
    "'" + operation + "'::uuid,'" + id + "'::uuid,decode('" +
    digest(bytes(phc)).toString("hex") + "','hex')," +
    "'" + session + "'::uuid,'" + refresh + "'::uuid,'" + candidate + "','" +
    renewal + "','" + limiter + "'::uuid),'hex')";
  const actual = sql(sqlPayload(access));
  assert.ok(actual.includes(expected.toString("hex")));
  assert.match(sql(sqlPayload("INVALID"), true), /VAP1_A01_PAYLOAD_INVALID/);
});

test("ordinary runtime cannot call private source/candidate helpers", () => {
  const result = sql("SELECT has_schema_privilege('issue416_w33_runtime'," +
    "'auth_proof_private','USAGE') OR has_function_privilege(" +
    "'issue416_w33_runtime','auth_proof_private.user_state_row_v1(uuid)'," +
    "'EXECUTE') OR has_function_privilege('issue416_w33_runtime'," +
    "'auth_proof_private.a01_payload_v1(uuid,uuid,bytea,uuid,uuid,text,text,uuid)'," +
    "'EXECUTE')");
  assert.match(result, /\bf\b/);
});
