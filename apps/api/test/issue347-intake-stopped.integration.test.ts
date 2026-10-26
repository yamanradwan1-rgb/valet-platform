import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import {
  createRuntimePostgresPool,
  type PostgresPool,
} from "../src/common/database/postgres";
import { createIntakeSessionCommandExecutor } from "../src/modules/valet-sessions/intake-session-command";
import { authorizeCheckInLocation } from "../src/modules/check-in-api/check-in-location-authorization";
import { ManagementAuditTestFixture } from "./management-audit-test-fixture";
import type { ManagementTestRole } from "./management-control-plane-test-fixture";

const fixture = new ManagementAuditTestFixture();
let runtime: PostgresPool;
beforeAll(async () => {
  await fixture.start();
  runtime = createRuntimePostgresPool(fixture.runtimeDatabaseUrl());
}, 120_000);
afterEach(() => fixture.resetLimits());
afterAll(async () => {
  await runtime?.end();
  await fixture.stop();
}, 60_000);

async function scenario(
  role: ManagementTestRole = "VALET_EMPLOYEE",
  grant = true,
) {
  const user = await fixture.createUser();
  const member = await fixture.createMembership(user.id, { role });
  const location = await fixture.addLocation(member.organizationId);
  if (grant)
    await fixture.grantLocationAccess(
      member.organizationId,
      member.membershipId,
      location.locationId,
    );
  const auth = await fixture.nativeLogin(user);
  const body = {
    intakeOperationId: `issue347:${randomUUID()}`,
    targetLocationId: location.locationId,
    customer: { intent: "DIFFERENT_CUSTOMER", phone: "+962790000001" },
    vehicleIdentity: {
      mode: "TEMPORARY_DESCRIPTOR",
      temporaryDescriptor: "Synthetic issue 347 vehicle",
    },
  };
  const post = (token = auth.accessToken, request = body) =>
    fixture.managementPost("/v1/staff/check-in/intakes", token, request);
  const setIntake = (accepting: boolean) =>
    fixture.query("UPDATE locations SET accepting_intake=$2 WHERE id=$1", [
      location.locationId,
      accepting,
    ]);
  await setIntake(false);
  return { auth, body, location, member, post, setIntake, user };
}

async function businessSnapshot(organizationId: string) {
  const tables = [
    "vehicles",
    "customers",
    "valet_sessions",
    "intake_operations",
    "tasks",
    "dispatch_events",
    "payments",
    "key_custody_events",
    "audit_events",
    "outbound_message_intents",
    "outbound_message_deliveries",
    "outbound_message_envelopes",
  ];
  const rows: Record<string, unknown> = {};
  for (const table of tables) {
    rows[table] = (
      await fixture.query(
        `SELECT to_jsonb(t) AS row FROM ${table} t WHERE organization_id=$1 ORDER BY to_jsonb(t)::text`,
        [organizationId],
      )
    ).rows;
  }
  return rows;
}

it.each(["VALET_EMPLOYEE", "VALET_SUPERVISOR"] as const)(
  "%s receives safe 409 only after authorization, with zero business writes or issuance",
  async (role) => {
    const s = await scenario(role);
    const before = await businessSnapshot(s.member.organizationId);
    const response = await s.post();
    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      code: "LOCATION_INTAKE_STOPPED",
      message: "New vehicle intake is unavailable at this location.",
      requestId: response.headers.get("x-request-id"),
    });
    expect(await businessSnapshot(s.member.organizationId)).toEqual(before);
    const initialGuestIssuance = vi.fn();
    const query = vi.spyOn(runtime, "connect");
    await expect(
      createIntakeSessionCommandExecutor(runtime, { initialGuestIssuance })({
        ...s.body,
        authenticatedUserId: s.user.id,
        vehicleIdentity: {
          mode: "TEMPORARY_DESCRIPTOR",
          temporaryDescriptor: "Synthetic rejected command",
        },
        customer: { intent: "DIFFERENT_CUSTOMER", phone: "+962790000001" },
      }),
    ).rejects.toMatchObject({ code: "LOCATION_INTAKE_STOPPED" });
    expect(query).toHaveBeenCalledTimes(1);
    query.mockRestore();
    expect(initialGuestIssuance).not.toHaveBeenCalled();
    expect(await businessSnapshot(s.member.organizationId)).toEqual(before);
  },
);

it("open intake succeeds, and a deliberate same-identity attempt after resume succeeds once", async () => {
  const s = await scenario();
  expect((await s.post()).body?.code).toBe("LOCATION_INTAKE_STOPPED");
  await s.setIntake(true);
  const accepted = await s.post();
  expect(accepted.status).toBe(201);
  expect(accepted.body?.state).toBe("CHECKING_IN");
  expect((await s.post()).body).toEqual(accepted.body);
  const rows = await fixture.query(
    "SELECT 1 FROM valet_sessions WHERE location_id=$1",
    [s.location.locationId],
  );
  expect(rows.rowCount).toBe(1);
});

it.each([
  ["ORG_ADMIN", true, "AUTHORIZATION_DENIED"],
  ["LOCATION_MANAGER", true, "AUTHORIZATION_DENIED"],
  ["VALET_EMPLOYEE", false, "LOCATION_ACCESS_DENIED"],
] as const)(
  "keeps %s grant=%s denial independent of paused intake",
  async (role, grant, code) => {
    const s = await scenario(role, grant);
    for (const accepting of [false, true]) {
      await s.setIntake(accepting);
      const response = await s.post();
      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        code,
        message: "The requested resource is not available.",
      });
    }
  },
);

it.each(["membership", "user", "organization", "location"] as const)(
  "revoked/inactive %s never discloses intake state",
  async (kind) => {
    const s = await scenario();
    const targets = {
      membership: [
        "organization_memberships",
        s.member.membershipId,
        "INACTIVE",
        "TENANT_ACCESS_DENIED",
      ],
      user: ["users", s.user.id, "DISABLED", "STAFF_AUTHENTICATION_REQUIRED"],
      organization: [
        "organizations",
        s.member.organizationId,
        "INACTIVE",
        "AUTHORIZATION_DENIED",
      ],
      location: [
        "locations",
        s.location.locationId,
        "INACTIVE",
        "AUTHORIZATION_DENIED",
      ],
    };
    const [table, id, status, code] = targets[kind];
    await fixture.query(`UPDATE ${table} SET status=$2 WHERE id=$1`, [
      id,
      status,
    ]);
    const response = await s.post();
    expect(response.status).toBe(kind === "user" ? 401 : 404);
    expect(response.body?.code).toBe(code);
  },
);

it("foreign and unknown locations have identical non-disclosing responses", async () => {
  const s = await scenario();
  const foreign = await scenario();
  const codes = [];
  for (const accepting of [false, true]) {
    await foreign.setIntake(accepting);
    const response = await s.post(s.auth.accessToken, {
      ...s.body,
      targetLocationId: foreign.location.locationId,
    });
    expect(response.status).toBe(404);
    codes.push(response.body?.code);
  }
  const unknown = await s.post(s.auth.accessToken, {
    ...s.body,
    targetLocationId: randomUUID(),
  });
  expect(unknown.status).toBe(404);
  expect(codes).toEqual([unknown.body?.code, unknown.body?.code]);
  expect(unknown.body?.code).toBe("TENANT_ACCESS_DENIED");
});

it.each(["revoked", "expired"])(
  "%s Staff session cannot disclose paused intake",
  async (kind) => {
    const s = await scenario();
    await fixture.query(
      kind === "revoked"
        ? "UPDATE staff_auth_sessions SET revoked_at=clock_timestamp() WHERE id=$1"
        : "UPDATE staff_auth_sessions SET created_at=clock_timestamp()-interval '2 hours', access_expires_at=clock_timestamp()-interval '1 minute', absolute_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
      [s.auth.sessionId],
    );
    const result = await s.post();
    expect(result.status).toBe(401);
    expect(result.body?.code).toBe("STAFF_AUTHENTICATION_REQUIRED");
  },
);

it("preserves the shared recognition/OCR helper denial contract", async () => {
  const s = await scenario();
  const tx = await runtime.connect();
  try {
    await tx.query("BEGIN");
    await expect(
      authorizeCheckInLocation(tx, s.user.id, s.location.locationId),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  } finally {
    await tx.query("ROLLBACK");
    tx.release();
  }
});
