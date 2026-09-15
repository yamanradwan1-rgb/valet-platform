import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createIntakeSessionCommandExecutor } from "../src/modules/valet-sessions/intake-session-command";
import {
  type IntakeFixtureOptions,
  useIntakeSessionCommandTestHarness,
} from "./intake-session-command-test-harness";
import { registerIntakeSessionResilienceTests } from "./intake-session-command-resilience-test-suite";
import { registerIntakeSessionVehicleTests } from "./intake-session-command-vehicle-test-suite";
import { differentCustomer } from "./returning-check-in-test-context";

const harness = useIntakeSessionCommandTestHarness();
const { createFixture, expectCommandError, readCounts, temporaryRequest } =
  harness;

describe("VAL-004E intake session creation", () => {
  it("creates only a CHECKING_IN version-1 session with disabled guest access and one safe audit", async () => {
    const fixture = await createFixture();
    const result = await createIntakeSessionCommandExecutor(
      harness.runtimePool,
    )(temporaryRequest(fixture));
    expect(result).toMatchObject({
      customerId: null,
      locationId: fixture.locationId,
      organizationId: fixture.organizationId,
      state: "CHECKING_IN",
      version: 1,
    });

    const session = await harness.adminPool.query<{
      check_in_condition_completed_at: Date | null;
      checking_in_completed_at: Date | null;
      completed_at: Date | null;
      current_assignee_membership_id: string | null;
      customer_access_expires_at: Date;
      customer_access_revoked_at: Date;
      customer_access_token_hash: string;
      checked_in_by_membership_id: string;
      created_at: Date;
      key_slot_id: string | null;
      parked_at: Date | null;
      parking_spot_id: string | null;
      retrieval_requested_at: Date | null;
      updated_at: Date;
    }>(
      `SELECT customer_access_token_hash, customer_access_expires_at,
              customer_access_revoked_at, parking_spot_id, key_slot_id,
              checked_in_by_membership_id, current_assignee_membership_id,
              check_in_condition_completed_at,
              checking_in_completed_at, parked_at, retrieval_requested_at,
              completed_at, created_at, updated_at
       FROM valet_sessions WHERE id = $1`,
      [result.valetSessionId],
    );
    expect(session.rows[0]).toMatchObject({
      check_in_condition_completed_at: null,
      checking_in_completed_at: null,
      completed_at: null,
      current_assignee_membership_id: null,
      checked_in_by_membership_id: fixture.membershipId,
      key_slot_id: null,
      parked_at: null,
      parking_spot_id: null,
      retrieval_requested_at: null,
    });
    expect(session.rows[0]?.created_at).toEqual(result.createdAt);
    expect(session.rows[0]?.updated_at).toEqual(result.createdAt);
    expect(session.rows[0]?.customer_access_token_hash).toMatch(
      /^disabled:intake:[a-f0-9]{64}$/,
    );
    expect(session.rows[0]?.customer_access_expires_at).toEqual(
      result.createdAt,
    );
    expect(session.rows[0]?.customer_access_revoked_at).toEqual(
      result.createdAt,
    );
    expect(Object.keys(result)).not.toContain("customerAccessToken");

    const audit = await harness.adminPool.query<{
      event_type: string;
      metadata_json: Record<string, unknown>;
    }>(
      `SELECT event_type, metadata_json
       FROM audit_events WHERE valet_session_id = $1`,
      [result.valetSessionId],
    );
    expect(audit.rows).toEqual([
      {
        event_type: "VALET_SESSION_CREATED",
        metadata_json: {
          customerPresent: false,
          identityMode: "TEMPORARY_DESCRIPTOR",
          intakeContractVersion: "V2",
        },
      },
    ]);
    expect(JSON.stringify(audit.rows)).not.toContain("disabled:intake:");
    expect(await readCounts(fixture.organizationId)).toEqual({
      audits: 1,
      customers: 0,
      intakeOperations: 1,
      sessions: 1,
      vehicles: 1,
    });
  });

  it("authorizes a supervisor without requiring an active Shift", async () => {
    const fixture = await createFixture({ role: "VALET_SUPERVISOR" });
    const result = await createIntakeSessionCommandExecutor(
      harness.runtimePool,
    )(temporaryRequest(fixture));
    const session = await harness.adminPool.query<{
      checked_in_by_membership_id: string;
    }>(
      `SELECT checked_in_by_membership_id::text
       FROM valet_sessions WHERE id = $1`,
      [result.valetSessionId],
    );
    expect(session.rows[0]?.checked_in_by_membership_id).toBe(
      fixture.membershipId,
    );
    const shifts = await harness.adminPool.query<{ count: number }>(
      `SELECT count(*)::integer AS count FROM shifts
       WHERE organization_id = $1`,
      [fixture.organizationId],
    );
    expect(shifts.rows[0]?.count).toBe(0);
  });

  it.each(["ORG_ADMIN", "LOCATION_MANAGER"] as const)(
    "rejects the non-operational %s role",
    async (role) => {
      const fixture = await createFixture({ role });
      await expectCommandError(
        createIntakeSessionCommandExecutor(harness.runtimePool)(
          temporaryRequest(fixture),
        ),
        "AUTHORIZATION_DENIED",
      );
      expect(await readCounts(fixture.organizationId)).toEqual({
        audits: 0,
        customers: 0,
        intakeOperations: 0,
        sessions: 0,
        vehicles: 0,
      });
    },
  );

  it.each([
    [
      { userStatus: "DISABLED" } as IntakeFixtureOptions,
      "AUTHORIZATION_DENIED",
    ],
    [
      { membershipStatus: "INACTIVE" } as IntakeFixtureOptions,
      "TENANT_ACCESS_DENIED",
    ],
    [
      { locationAccess: false } as IntakeFixtureOptions,
      "LOCATION_ACCESS_DENIED",
    ],
  ])("rejects inactive or unscoped staff", async (options, code) => {
    const fixture = await createFixture(options);
    await expectCommandError(
      createIntakeSessionCommandExecutor(harness.runtimePool)(
        temporaryRequest(fixture),
      ),
      code,
    );
    expect(await readCounts(fixture.organizationId)).toMatchObject({
      audits: 0,
      intakeOperations: 0,
      sessions: 0,
      vehicles: 0,
    });
  });

  it("does not disclose whether a target Location belongs to another tenant", async () => {
    const actor = await createFixture();
    const foreign = await createFixture();
    const execute = createIntakeSessionCommandExecutor(harness.runtimePool);
    const foreignError = await expectCommandError(
      execute(
        temporaryRequest(actor, { targetLocationId: foreign.locationId }),
      ),
      "TENANT_ACCESS_DENIED",
    );
    const missingError = await expectCommandError(
      execute(temporaryRequest(actor, { targetLocationId: randomUUID() })),
      "TENANT_ACCESS_DENIED",
    );
    expect(foreignError.message).toBe(missingError.message);
  });

  it("persists a canonical Jordan mobile and reuses one exact match", async () => {
    const fixture = await createFixture();
    const execute = createIntakeSessionCommandExecutor(harness.runtimePool);
    const customer = differentCustomer("+962791234567", "  Ｊｏｒｄａｎ  ");
    const first = await execute(temporaryRequest(fixture, { customer }));
    const second = await execute(temporaryRequest(fixture, { customer }));
    expect(first.customerId).not.toBeNull();
    expect(second.customerId).toBe(first.customerId);
    const customers = await harness.adminPool.query<{
      display_name: string | null;
      phone_normalized: string;
    }>(
      `SELECT phone_normalized, display_name
       FROM customers WHERE organization_id = $1 ORDER BY created_at`,
      [fixture.organizationId],
    );
    expect(customers.rows).toEqual([
      { display_name: "Jordan", phone_normalized: "+962791234567" },
    ]);
  });

  it("rejects invalid customer contact before any mutation", async () => {
    const fixture = await createFixture();
    const before = await readCounts(fixture.organizationId);
    for (const phone of ["+96277896356", "+962123456789", "+96279000000"]) {
      await expectCommandError(
        createIntakeSessionCommandExecutor(harness.runtimePool)(
          temporaryRequest(fixture, { customer: differentCustomer(phone) }),
        ),
        "INTAKE_INPUT_INVALID",
      );
    }
    expect(await readCounts(fixture.organizationId)).toEqual(before);
  });
});

registerIntakeSessionVehicleTests(harness);
registerIntakeSessionResilienceTests(harness);
