import { describe, expect, it } from "vitest";

import { ownedTargetMembershipsAreSafe } from "./owned-target-memberships";

const pgMonitor = {
  parent: "pg_monitor",
  grantor_superuser: true,
  inherit_option: true,
  set_option: false,
  admin_option: false,
};

const creatorAdmin = {
  parent: "valet_w66_migrator",
  grantor_superuser: true,
  inherit_option: false,
  set_option: false,
  admin_option: true,
};

describe("Option C owned-target PostgreSQL 17 memberships", () => {
  it("accepts the baseline and the exact optional creator ADMIN edge", () => {
    expect(ownedTargetMembershipsAreSafe([pgMonitor], ["pg_monitor"])).toBe(
      true,
    );
    expect(
      ownedTargetMembershipsAreSafe(
        [pgMonitor, creatorAdmin],
        ["pg_monitor"],
        ["valet_w66_migrator"],
      ),
    ).toBe(true);
  });

  it("rejects executable, inherited, untrusted, duplicate, or missing baseline memberships", () => {
    for (const memberships of [
      [{ ...creatorAdmin, set_option: true }, pgMonitor],
      [{ ...creatorAdmin, inherit_option: true }, pgMonitor],
      [{ ...creatorAdmin, grantor_superuser: false }, pgMonitor],
      [{ ...creatorAdmin, parent: "rogue_role" }, pgMonitor],
      [pgMonitor, pgMonitor],
      [creatorAdmin],
    ]) {
      expect(
        ownedTargetMembershipsAreSafe(
          memberships,
          ["pg_monitor"],
          ["valet_w66_migrator"],
        ),
      ).toBe(false);
    }
  });
});
