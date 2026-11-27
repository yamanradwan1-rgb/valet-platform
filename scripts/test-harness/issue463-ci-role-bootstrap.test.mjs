import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ISSUE463_SHARED_ROLES } from "./issue463-shared-role-policy.mjs";

const workflow = readFileSync(
  new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8",
);
const postgresLane = workflow.slice(
  workflow.indexOf("- name: Attest and pre-provision shared Issue416 CI owners"),
  workflow.indexOf("- name: Run bounded PostgreSQL API project"),
);
const e2eLane = workflow.slice(
  workflow.indexOf("- name: Prepare Option C E2E database identities"),
  workflow.indexOf("- name: Run database migrations", workflow.indexOf(
    "- name: Prepare Option C E2E database identities",
  )),
);

test("both isolated CI clusters bootstrap all four roles without privacy credentials", () => {
  for (const lane of [postgresLane, e2eLane]) {
    assert.ok(lane.length > 0);
    for (const [index, role] of ISSUE463_SHARED_ROLES.entries()) {
      const line = lane.split("\n").find((value) => value.includes(
        `CREATE ROLE ${role} `));
      assert.ok(line, `missing cluster bootstrap for ${role}`);
      assert.match(line, /NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS/);
      if (index < 2) assert.match(line, /NOLOGIN/);
      else assert.match(line, /LOGIN PASSWORD NULL/);
    }
  }
});

test("bootstrap ADMIN and migrator SET membership are separate and role-specific", () => {
  for (const [lane, migrationRole] of [
    [postgresLane, "valet"],
    [e2eLane, "valet_e2e_migrator"],
  ]) {
    const lines = lane.split("\n");
    const adminLine = lines.find((line) =>
      line.includes(`TO ${migrationRole} WITH ADMIN TRUE, INHERIT FALSE, SET FALSE`) &&
      line.includes(ISSUE463_SHARED_ROLES[3]));
    assert.ok(adminLine, `missing four-role creator ADMIN edge for ${migrationRole}`);
    for (const role of ISSUE463_SHARED_ROLES) assert.ok(adminLine.includes(role));
    const setRoleIndex = lines.findIndex((line) =>
      line.includes(`SET ROLE ${migrationRole}`));
    assert.ok(setRoleIndex >= 0);
    const setEdge = lines.findIndex((line) =>
      line.includes(`TO ${migrationRole} WITH ADMIN FALSE, INHERIT FALSE, SET TRUE`));
    assert.ok(setEdge > setRoleIndex);
    assert.ok(lines[setEdge].includes(ISSUE463_SHARED_ROLES[0]));
    assert.ok(lines[setEdge].includes(ISSUE463_SHARED_ROLES[1]));
    assert.ok(!lines[setEdge].includes(ISSUE463_SHARED_ROLES[2]));
    assert.ok(!lines[setEdge].includes(ISSUE463_SHARED_ROLES[3]));
    assert.ok(lines.slice(setEdge + 1).some((line) => line.includes("RESET ROLE")));
  }
});
