import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createStaffValetSessionHarness,
  type StaffValetSessionHarness,
} from "./staff-valet-session-harness";

const protocolHeaders = {
  "Valet-Incident-Submission-Protocol": "actor-bound-intent-v1",
};

function recoveryId() {
  const value = randomUUID();
  return `${value.slice(0, 14)}8${value.slice(15)}`;
}

describe("DEC-077 recovery authorization", () => {
  let harness: StaffValetSessionHarness;

  beforeAll(async () => {
    harness = createStaffValetSessionHarness();
    await harness.start();
  }, 120_000);

  afterAll(async () => harness.close(), 60_000);

  async function reserved(
    role: "VALET_EMPLOYEE" | "VALET_SUPERVISOR" = "VALET_EMPLOYEE",
  ) {
    const authenticated = await harness.fixtureWithToken({ role });
    const { sessionId } = await harness.createSession(authenticated.fixture);
    const incidentId = recoveryId();
    const path = `/v1/staff/valet-sessions/${sessionId}/incidents/${incidentId}`;
    const result = await harness.request("POST", `${path}/recovery-intent`, {
      body: {},
      headers: protocolHeaders,
      token: authenticated.token,
    });
    expect(result.status).toBe(200);
    return { ...authenticated, incidentId, path, sessionId };
  }

  async function tokenFor(userId: string) {
    const token = `token-${randomUUID()}`;
    harness.principals.set(`Bearer ${token}`, userId);
    return token;
  }

  async function expectRecoveryMutationsDenied(path: string, token?: string) {
    const authentication = token === undefined ? {} : { token };
    const read = await harness.request(
      "GET",
      `${path}/recovery`,
      authentication,
    );
    const retire = await harness.request(
      "POST",
      `${path}/recovery-intent/retire`,
      { body: {}, headers: protocolHeaders, ...authentication },
    );
    const reserve = await harness.request("POST", `${path}/recovery-intent`, {
      body: {},
      headers: protocolHeaders,
      ...authentication,
    });
    const expected = token === undefined ? 401 : 404;
    expect([read.status, retire.status, reserve.status]).toEqual([
      expected,
      expected,
      expected,
    ]);
  }

  it.each(["VALET_EMPLOYEE", "VALET_SUPERVISOR"] as const)(
    "allows the exact original active %s without an active-Shift read check",
    async (role) => {
      const setup = await reserved(role);
      await harness.context.adminPool.query(
        `UPDATE shifts SET status='ENDED', ended_at=clock_timestamp()
         WHERE membership_id=$1 AND status='ACTIVE'`,
        [setup.fixture.membershipId],
      );
      const result = await harness.request("GET", `${setup.path}/recovery`, {
        token: setup.token,
      });
      expect(result).toMatchObject({
        body: { outcome: "RESERVED" },
        status: 200,
      });
    },
  );

  it.each([
    "VALET_EMPLOYEE",
    "VALET_SUPERVISOR",
    "LOCATION_MANAGER",
    "ORG_ADMIN",
  ] as const)("denies a different %s non-disclosingly", async (role) => {
    const setup = await reserved();
    const other = await harness.addMember(setup.fixture, role, true);
    await expectRecoveryMutationsDenied(
      setup.path,
      await tokenFor(other.userId),
    );
  });

  it.each([
    ["inactive User", "UPDATE users SET status='DISABLED' WHERE id=$1"],
    [
      "inactive membership",
      "UPDATE organization_memberships SET status='INACTIVE' WHERE id=$1",
    ],
    [
      "revoked Location access",
      "DELETE FROM membership_location_access WHERE membership_id=$1",
    ],
    [
      "inactive Organization",
      "UPDATE organizations SET status='INACTIVE' WHERE id=$1",
    ],
    [
      "inactive Location",
      "UPDATE locations SET status='INACTIVE', accepting_intake=FALSE WHERE id=$1",
    ],
  ] as const)("denies %s", async (label, statement) => {
    void label;
    const setup = await reserved();
    const parameter = statement.includes("users")
      ? setup.fixture.userId
      : statement.includes("organizations ")
        ? setup.fixture.organizationId
        : statement.includes("locations ")
          ? setup.fixture.locationId
          : setup.fixture.membershipId;
    await harness.context.adminPool.query(statement, [parameter]);
    await expectRecoveryMutationsDenied(setup.path, setup.token);
  });

  it("denies anonymous and cross-tenant callers without revealing state", async () => {
    const setup = await reserved();
    await expectRecoveryMutationsDenied(setup.path);
    const foreign = await harness.fixtureWithToken();
    await expectRecoveryMutationsDenied(setup.path, foreign.token);
  });

  it("does not fall through to another membership owned by the same User", async () => {
    const setup = await reserved();
    await harness.context.adminPool.query(
      `UPDATE organization_memberships SET status='INACTIVE' WHERE id=$1`,
      [setup.fixture.membershipId],
    );
    await harness.context.createFixture({}, setup.fixture.userId);
    await expectRecoveryMutationsDenied(setup.path, setup.token);
  });
});
