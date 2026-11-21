import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { OptionCT5Fixture, staffDirectoryPath } from "./probe-fixture";

const fixture = new OptionCT5Fixture();

beforeAll(() => fixture.start(), 180_000);
afterAll(() => fixture.stop(), 120_000);

describe("Option C disabled reset surfaces on real mounted application", () => {
  it("does not register public redemption or protected management issuance", async () => {
    const admin = await fixture.admin(true);
    const target = await fixture.employee(admin.membership.organizationId);
    const publicRedeem = await fixture.request(
      "/v1/staff/auth/password-resets/redeem",
      { body: { resetToken: "synthetic-disabled", password: "not-used" } },
    );
    const managementIssue = await fixture.managementPost(
      `${staffDirectoryPath(admin.membership.organizationId)}/${target.membershipId}/password-resets`,
      admin.auth.accessToken,
      { operationId: "synthetic-disabled" },
    );
    expect(publicRedeem.status).toBe(404);
    expect(managementIssue.status).toBe(404);
  });
});
