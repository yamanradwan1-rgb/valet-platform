import { describe, expect, it } from "vitest";

import { assertFixedSource113, assertFailed113Snapshot,
  assertResolve113OnlyChangedTarget, FAILED_113,
  SUCCEEDED_112 } from "./resolve-113-guard.mjs";
import { assertResolve113Mode } from "./resolve-113.mjs";

const sourceFixed = `
CREATE SCHEMA auth_proof_private AUTHORIZATION vap1_proof_owner;
SET ROLE vap1_proof_owner;
REVOKE ALL ON SCHEMA auth_proof_private FROM PUBLIC;
RESET ROLE;`;
const catalogEmpty = { schema_count: 0, relation_count: 0, proof_role_count: 0 };

function history() {
  return [
    { id: "112", migration_name: SUCCEEDED_112, checksum: "A",
      started_at: "1", finished_at: "2", rolled_back_at: null,
      applied_steps_count: 1, logs: null },
    { id: "113", migration_name: FAILED_113, checksum: "B",
      started_at: "3", finished_at: null, rolled_back_at: null,
      applied_steps_count: 0,
      logs: "SQLSTATE 42501: permission denied for schema auth_proof_private" },
  ];
}

describe("Issue416 precise W9 recovery guard", () => {
  it("requires exact explicit CLI mode", () => {
    expect(() => assertResolve113Mode(["--resolve-113"])).not.toThrow();
    for (const argv of [[], ["--rolled-back"], ["--resolve-114"],
      ["--resolve-113", "--force"]]) {
      expect(() => assertResolve113Mode(argv)).toThrow("exactly --resolve-113");
    }
  });

  it("rejects the originally failed REVOKE-before-owner source", () => {
    expect(() => assertFixedSource113(sourceFixed)).not.toThrow();
    expect(() => assertFixedSource113(sourceFixed.replace(
      "SET ROLE vap1_proof_owner;\nREVOKE", "REVOKE"))).toThrow();
    expect(() => assertFixedSource113(sourceFixed.replace(
      "REVOKE ALL ON SCHEMA auth_proof_private FROM PUBLIC;\nRESET ROLE;",
      "RESET ROLE;\nREVOKE ALL ON SCHEMA auth_proof_private FROM PUBLIC;"))).toThrow();
  });

  it("admits only the exact one failed 113 + successful 112 with empty catalog", () => {
    expect(assertFailed113Snapshot(history(), catalogEmpty)).toBe("113");
    for (const changed of [
      { ...catalogEmpty, schema_count: 1 },
      { ...catalogEmpty, proof_role_count: 1 },
      { ...catalogEmpty, relation_count: 1 },
    ]) expect(() => assertFailed113Snapshot(history(), changed)).toThrow();
    const wrong = history();
    wrong[1].logs = "wrong error";
    expect(() => assertFailed113Snapshot(wrong, catalogEmpty)).toThrow();
    const later = [...history(), { ...history()[1], id: "114", migration_name: "20261113011400_next" }];
    expect(() => assertFailed113Snapshot(later, catalogEmpty)).toThrow();
  });

  it("postcheck requires only row 113 rolled_back_at to change", () => {
    const old = history();
    const now = history();
    now[1].rolled_back_at = "2026-11-13T21:00:00Z";
    expect(() => assertResolve113OnlyChangedTarget(old, now)).not.toThrow();
    now[0].checksum = "tampered";
    expect(() => assertResolve113OnlyChangedTarget(old, now)).toThrow();
    now[0].checksum = old[0].checksum;
    now[1].rolled_back_at = null;
    expect(() => assertResolve113OnlyChangedTarget(old, now)).toThrow();
  });
});
