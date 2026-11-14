// Exact real-PG17 sort-order regression for the Prime-owned disposable fresh2.
// Not a signer, writer-authority or original W9 history acceptance test.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const fixture = "vaylet-issue416-fresh2-20261114-prime-pg17";
const originalId =
  "6999833d7b858b3df00b25fa9550bfd152a31cb49224003c44f4f2937886ed15";
const imageId =
  "sha256:ab20e934b27ba3ff927c1b4c9ff8cf6c32f315f743efe68dd3441182a87fb085";

function docker(args) {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    timeout: 30_000,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  return result;
}

const inspection = docker(["inspect", fixture]);
assert.equal(
  inspection.status,
  0,
  "original Prime fresh2 test fixture required",
);
const target = JSON.parse(inspection.stdout)[0];
assert.equal(target.Id, originalId);
assert.equal(target.Image, imageId);
assert.equal(target.Config.Labels["vaylet.owner"], "issue416-prime-fresh2");
assert.equal(target.Config.Labels["vaylet.environment"], "isolated-test");
assert.equal(target.State.Running, true);
assert.deepEqual(target.HostConfig.PortBindings["5432/tcp"], [
  { HostIp: "127.0.0.1", HostPort: "51017" },
]);
assert.equal(
  target.Mounts.find(
    (mount) => mount.Destination === "/var/lib/postgresql/data",
  )?.Name,
  "vaylet-issue416-fresh2-20261114-prime-pgdata",
);

function query(statement, expectedFailure = false) {
  const result = docker([
    "exec",
    fixture,
    "psql",
    "-X",
    "-A",
    "-t",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    "issue416_fresh2_migration",
    "-d",
    "issue416_fresh2_db",
    "-c",
    "SET ROLE vap1_proof_owner; " + statement,
  ]);
  if (expectedFailure) {
    assert.notEqual(result.status, 0, "invalid order must fail in PostgreSQL");
    assert.match(result.stderr, /VAP1_STATE_NONCANONICAL/);
    return;
  }
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim().split(/\r?\n/).at(-1);
}

const root = "auth_proof_private";
const utf8 = (value) =>
  `${root}.tlv_field(${value[0]},4,pg_catalog.convert_to('${value[1]}','UTF8'))`;
const binary = (id, hex) =>
  `${root}.tlv_field(${id},6,pg_catalog.decode('${hex}','hex'))`;
const key = "01" + "00".repeat(16);

function admissionRow(kind, audience = "test") {
  return (
    "(" +
    [
      `${root}.u16(1)`,
      `${root}.u16(8)`,
      utf8([1, audience]),
      utf8([2, kind]),
      binary(3, key),
      utf8([4, "ADMIT"]),
      `${root}.tlv_field(5,3,${root}.u64(1))`,
      `${root}.tlv_field(6,3,${root}.u64(1))`,
      `${root}.tlv_field(7,7,pg_catalog.decode(repeat('ab',32),'hex'))`,
      `${root}.tlv_field(8,0,'\\x'::bytea)`,
    ].join(" || ") +
    ")"
  );
}

function group(rows) {
  const prefix =
    "pg_catalog.convert_to('VAYLET/VAP1/ARRAY','UTF8') || '\\x00'::bytea";
  return (
    "(" +
    [
      prefix,
      `${root}.u16(1)`,
      `${root}.u8(16)`,
      `${root}.u32(${rows.length})`,
      ...rows.map(
        (row) =>
          `${root}.u8(6) || ${root}.u32(pg_catalog.octet_length(${row})) || ${row}`,
      ),
    ].join(" || ") +
    ")"
  );
}

test("real PG17 uses Node's U2 class-defined UTF8 key values, not record byte lengths", () => {
  const organization = admissionRow("ORGANIZATION");
  const user = admissionRow("USER");
  query(`SELECT ${root}.assert_state_group(5,${group([organization, user])});`);
  query(
    `SELECT ${root}.assert_state_group(5,${group([user, organization])});`,
    true,
  );
  query(
    `SELECT ${root}.assert_state_group(5,${group([organization, organization])});`,
    true,
  );
});

test("real PG17 considers preceding audience key before object kind or full record", () => {
  const one = admissionRow("USER", "aa");
  const two = admissionRow("ORGANIZATION", "bbb");
  query(`SELECT ${root}.assert_state_group(5,${group([one, two])});`);
  query(`SELECT ${root}.assert_state_group(5,${group([two, one])});`, true);
});

test("real PG17 retained runtime and PUBLIC effective private-function denial", () => {
  assert.equal(
    query(
      "RESET ROLE; SELECT has_function_privilege('issue416_fresh2_runtime'," +
        "'auth_proof_private.state_row_sort_key(integer,bytea)','EXECUTE')::text;",
    ),
    "false",
  );
});
