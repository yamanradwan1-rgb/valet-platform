import { describe, expect, it, vi } from "vitest";
import { fixtureSessionLockRoles } from "./staff-auth-native-session-lock-owner";

const bootstrap = "postgresql://valet@localhost:5432/valet";
const ci = {
  GITHUB_ACTIONS: "true",
  GITHUB_JOB: "postgres",
  VAYLET_CI_POSTGRES_BOOTSTRAP_URL: bootstrap,
};

describe("Staff Auth fixture session lock ownership", () => {
  it("leaves the CI role outside fixture snapshots using public catalogs", async () => {
    const query = vi.fn(async () => ({ rows: [{ approved: true }] }));
    const client = { query };
    await expect(fixtureSessionLockRoles(client, bootstrap, ci)).resolves.toEqual([]);
    await expect(fixtureSessionLockRoles(client, bootstrap, ci)).resolves.toEqual([]);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query).toHaveBeenCalledWith(expect.not.stringMatching(/pg_authid|rolpassword/), [
      "vaylet_staff_session_lock_owner",
    ]);
  });

  it("rejects an unapproved role or bootstrap instead of claiming the role", async () => {
    const query = vi.fn(async () => ({ rows: [{ approved: false }] }));
    await expect(fixtureSessionLockRoles({ query }, bootstrap, ci)).rejects.toThrow("CI-owned");
    await expect(fixtureSessionLockRoles({ query }, `${bootstrap}_other`, ci)).rejects.toThrow("outside");
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("keeps local role snapshot behavior", async () => {
    const query = vi.fn();
    await expect(fixtureSessionLockRoles({ query }, bootstrap, {})).resolves.toEqual([
      "vaylet_staff_session_lock_owner",
    ]);
    expect(query).not.toHaveBeenCalled();
  });
});
