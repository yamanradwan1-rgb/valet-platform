import { describe, expect, it } from "vitest";

import { assertFixedSource113, assertFailed113Snapshot,
  assertPinnedSource113, assertResolve113OnlyChangedTarget, FAILED_113,
  SUCCEEDED_112, W9_MIGRATIONS } from "./resolve-113-guard.mjs";
import { assertResolve113Mode } from "./resolve-113.mjs";

const sourceFixed = `
CREATE SCHEMA auth_proof_private AUTHORIZATION vap1_proof_owner;
SET ROLE vap1_proof_owner;
REVOKE ALL ON SCHEMA auth_proof_private FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE vap1_proof_owner
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
RESET ROLE;`;
const catalogEmpty = { schema_count: 0, relation_count: 0, proof_role_count: 0 };

function history() {
  return [
    { id: W9_MIGRATIONS.prior112.id, migration_name: SUCCEEDED_112,
      checksum: W9_MIGRATIONS.prior112.checksum,
      started_at: "2026-11-13 20:50:14.48293+00", finished_at: "2026-11-13 20:50:14.500594+00",
      rolled_back_at: null,
      applied_steps_count: 1, logs: null },
    { id: W9_MIGRATIONS.historical113.id, migration_name: FAILED_113,
      checksum: W9_MIGRATIONS.historical113.checksum,
      started_at: "2026-11-13 20:50:14.506337+00", finished_at: null,
      rolled_back_at: "2026-11-13 21:09:34.483501+00",
      applied_steps_count: 0,
      logs: "SQLSTATE 42501: permission denied for schema auth_proof_private" },
    { id: W9_MIGRATIONS.latest113.id, migration_name: FAILED_113,
      checksum: W9_MIGRATIONS.latest113.checksum,
      started_at: "2026-11-13 21:09:49.969868+00", finished_at: null,
      rolled_back_at: null, applied_steps_count: 0, logs: "" },
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
    expect(() => assertPinnedSource113(sourceFixed)).toThrow("exact reviewed");
    expect(() => assertFixedSource113(sourceFixed.replace(
      "SET ROLE vap1_proof_owner;\nREVOKE", "REVOKE"))).toThrow();
    expect(() => assertFixedSource113(sourceFixed.replace(
      "SET ROLE vap1_proof_owner;\nREVOKE ALL ON SCHEMA auth_proof_private FROM PUBLIC;",
      "REVOKE ALL ON SCHEMA auth_proof_private FROM PUBLIC;\nSET ROLE vap1_proof_owner;"))).toThrow();
    expect(() => assertFixedSource113(sourceFixed.replace(
      "SET ROLE vap1_proof_owner;\nREVOKE", "ALTER DEFAULT PRIVILEGES FOR ROLE vap1_proof_owner\n  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;\nSET ROLE vap1_proof_owner;\nREVOKE"))).toThrow();
  });

  it("admits only pinned 112 + historical rolledback 113 + newest failed 113", () => {
    expect(assertFailed113Snapshot(history(), catalogEmpty)).toBe(W9_MIGRATIONS.latest113.id);
    for (const changed of [
      { ...catalogEmpty, schema_count: 1 },
      { ...catalogEmpty, proof_role_count: 1 },
      { ...catalogEmpty, relation_count: 1 },
    ]) expect(() => assertFailed113Snapshot(history(), changed)).toThrow();
    for (const index of [0, 1, 2]) {
      const wrong = history();
      wrong[index].checksum = "changed";
      expect(() => assertFailed113Snapshot(wrong, catalogEmpty)).toThrow();
    }
    const wrongHistory = history();
    wrongHistory[1].logs = "wrong error";
    expect(() => assertFailed113Snapshot(wrongHistory, catalogEmpty)).toThrow();
    const wrongLatest = history();
    wrongLatest[2].logs = "unrecognized error";
    expect(() => assertFailed113Snapshot(wrongLatest, catalogEmpty)).toThrow();
    const thirdAttempt = [...history(), { ...history()[2], id: "unexpected" }];
    expect(() => assertFailed113Snapshot(thirdAttempt, catalogEmpty)).toThrow();
    const later = [...history(), { ...history()[2], id: "114", migration_name: "20261113011400_next" }];
    expect(() => assertFailed113Snapshot(later, catalogEmpty)).toThrow();
    const wrongRolledBack = history();
    wrongRolledBack[1].rolled_back_at = null;
    expect(() => assertFailed113Snapshot(wrongRolledBack, catalogEmpty)).toThrow();
  });

  it("postcheck requires only latest 113 rolled_back_at to change", () => {
    const old = history();
    const now = history();
    now[2].rolled_back_at = "2026-11-13T21:15:00Z";
    expect(() => assertResolve113OnlyChangedTarget(old, now)).not.toThrow();
    now[0].checksum = "tampered";
    expect(() => assertResolve113OnlyChangedTarget(old, now)).toThrow();
    now[0].checksum = old[0].checksum;
    now[1].rolled_back_at = "2026-11-13T21:19:00Z";
    expect(() => assertResolve113OnlyChangedTarget(old, now)).toThrow();
    now[1].rolled_back_at = old[1].rolled_back_at;
    now[2].rolled_back_at = null;
    expect(() => assertResolve113OnlyChangedTarget(old, now)).toThrow();
  });
});
