import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createIntakeSessionCommandExecutor,
  type IntakeSessionCommandRequest,
} from "../src/modules/valet-sessions/intake-session-command";
import { createVehicleDetailsCommandExecutor } from "../src/modules/vehicles/vehicle-details-command";
import {
  ReturningCheckInTestContext,
  type ReturningFixture,
} from "./returning-check-in-test-context";

const context = new ReturningCheckInTestContext();
const plate = (raw = "AB123") => ({
  confirmedByHuman: true as const,
  mode: "CONFIRMED_PLATE" as const,
  plateCountry: "jo",
  plateNumberRaw: raw,
});
const request = (
  fixture: ReturningFixture,
  overrides: Partial<IntakeSessionCommandRequest> = {},
): IntakeSessionCommandRequest => ({
  authenticatedUserId: fixture.userId,
  intakeOperationId: `returning:${randomUUID()}`,
  targetLocationId: fixture.locationId,
  vehicleIdentity: plate(),
  ...overrides,
});
const failWith = async (operation: Promise<unknown>, code: string) => {
  await expect(operation).rejects.toMatchObject({ code });
};
async function complete(sessionId: string, fixture: ReturningFixture) {
  await context.admin.query(
    `UPDATE valet_sessions SET state = 'COMPLETED', completed_at = transaction_timestamp(),
       completed_by_membership_id = $2, updated_at = transaction_timestamp() WHERE id = $1`,
    [sessionId, fixture.membershipId],
  );
}

beforeAll(() => context.start(), 120_000);
afterAll(() => context.stop(), 60_000);

describe("DEC-069 returning Check-In mutations", () => {
  it("resolves phones exactly, preserves names, rejects duplicates, and converges concurrently", async () => {
    const fixture = await context.fixture();
    const execute = createIntakeSessionCommandExecutor(context.runtime);
    const first = await execute(
      request(fixture, {
        customer: {
          displayName: "Original",
          intent: "DIFFERENT_CUSTOMER",
          phone: "+962790000021",
        },
      }),
    );
    await complete(first.valetSessionId, fixture);
    const reused = await execute(
      request(fixture, {
        customer: {
          displayName: "Replacement",
          intent: "DIFFERENT_CUSTOMER",
          phone: "+962790000021",
        },
      }),
    );
    expect(reused.customerId).toBe(first.customerId);
    expect(
      (
        await context.admin.query(
          `SELECT display_name FROM customers WHERE id = $1`,
          [first.customerId],
        )
      ).rows[0]?.display_name,
    ).toBe("Original");
    await complete(reused.valetSessionId, fixture);
    await context.admin.query(
      `INSERT INTO customers (id, organization_id, phone_normalized, created_at, updated_at)
       VALUES ($1, $2, '+962790000021', transaction_timestamp(), transaction_timestamp())`,
      [randomUUID(), fixture.organizationId],
    );
    await failWith(
      execute(
        request(fixture, {
          customer: {
            intent: "DIFFERENT_CUSTOMER",
            phone: "+962790000021",
          },
        }),
      ),
      "CUSTOMER_PHONE_AMBIGUOUS",
    );
    const concurrentFixture = await context.fixture();
    const [a, b] = await Promise.all([
      execute(
        request(concurrentFixture, {
          customer: {
            intent: "DIFFERENT_CUSTOMER",
            phone: "+962790000022",
          },
        }),
      ),
      execute(
        request(concurrentFixture, {
          customer: {
            intent: "DIFFERENT_CUSTOMER",
            phone: "+962790000022",
          },
          vehicleIdentity: plate("CD456"),
        }),
      ),
    ]);
    expect(a.customerId).toBe(b.customerId);
  });

  it("persists new details, preserves known details, and fingerprints material intent", async () => {
    const fixture = await context.fixture();
    const execute = createIntakeSessionCommandExecutor(context.runtime);
    const operation = `returning:${randomUUID()}`;
    const details = {
      color: " Blue ",
      make: " Ｔｏｙｏｔａ ",
      model: " Camry ",
    };
    const original = await execute(
      request(fixture, {
        intakeOperationId: operation,
        vehicleDetails: details,
      }),
    );
    expect(original).toMatchObject({
      color: "Blue",
      make: "Toyota",
      model: "Camry",
    });
    expect(
      await execute(
        request(fixture, {
          intakeOperationId: operation,
          vehicleDetails: details,
        }),
      ),
    ).toEqual(original);
    await failWith(
      execute(
        request(fixture, {
          intakeOperationId: operation,
          vehicleDetails: { color: "Red", make: "Toyota", model: "Camry" },
        }),
      ),
      "IDEMPOTENCY_CONFLICT",
    );
    await failWith(
      execute(
        request(fixture, {
          intakeOperationId: operation,
          customer: { intent: "DIFFERENT_CUSTOMER", phone: "+962790000031" },
          vehicleDetails: { color: "Blue", make: "Toyota", model: "Camry" },
        }),
      ),
      "IDEMPOTENCY_CONFLICT",
    );
    await complete(original.valetSessionId, fixture);
    const known = await execute(
      request(fixture, {
        vehicleDetails: { color: "Red", make: null, model: null },
      }),
    );
    expect(known).toMatchObject({
      color: "Blue",
      make: "Toyota",
      model: "Camry",
    });
    const temporary = await execute(
      request(fixture, {
        vehicleIdentity: {
          mode: "TEMPORARY_DESCRIPTOR",
          temporaryDescriptor: "No plate",
        },
        vehicleDetails: { color: "White", make: null, model: null },
      }),
    );
    expect(temporary.color).toBe("White");
  });

  it("corrects only CHECKING_IN details with optimistic, no-op, and safe atomic audit behavior", async () => {
    const fixture = await context.fixture();
    const intake = await createIntakeSessionCommandExecutor(context.runtime)(
      request(fixture, {
        vehicleDetails: { color: "Black", make: "Lexus", model: "ES" },
      }),
    );
    const correct = createVehicleDetailsCommandExecutor(context.runtime);
    const noChange = await correct({
      authenticatedUserId: fixture.userId,
      color: "Black",
      expectedVehicleUpdatedAt: intake.vehicleUpdatedAt,
      make: "Lexus",
      model: "ES",
      valetSessionId: intake.valetSessionId,
    });
    expect(noChange.mutationKind).toBe("NO_CHANGE");
    const changed = await correct({
      authenticatedUserId: fixture.userId,
      color: "Pearl",
      expectedVehicleUpdatedAt: intake.vehicleUpdatedAt,
      make: "Lexus",
      model: "ES 350",
      valetSessionId: intake.valetSessionId,
    });
    expect(changed).toMatchObject({
      color: "Pearl",
      model: "ES 350",
      mutationKind: "UPDATED",
    });
    await failWith(
      correct({
        authenticatedUserId: fixture.userId,
        color: "Red",
        expectedVehicleUpdatedAt: intake.vehicleUpdatedAt,
        make: "Lexus",
        model: "ES",
        valetSessionId: intake.valetSessionId,
      }),
      "VEHICLE_DETAILS_VERSION_CONFLICT",
    );
    const otherLocation = await context.fixture({
      organizationId: fixture.organizationId,
    });
    await failWith(
      correct({
        authenticatedUserId: otherLocation.userId,
        color: "Red",
        expectedVehicleUpdatedAt: changed.vehicleUpdatedAt,
        make: "Lexus",
        model: "ES 350",
        valetSessionId: intake.valetSessionId,
      }),
      "LOCATION_ACCESS_DENIED",
    );
    const audits = await context.admin.query(
      `SELECT metadata_json FROM audit_events WHERE entity_id = $1
       AND event_type = 'VEHICLE_DETAILS_CORRECTED'`,
      [intake.vehicleId],
    );
    expect(audits.rows).toEqual([
      {
        metadata_json: {
          colorChanged: true,
          makeChanged: false,
          modelChanged: true,
        },
      },
    ]);
    expect(JSON.stringify(audits.rows)).not.toMatch(
      /Pearl|Lexus|ES 350|AB123/u,
    );
    await complete(intake.valetSessionId, fixture);
    await failWith(
      correct({
        authenticatedUserId: fixture.userId,
        color: "Blue",
        expectedVehicleUpdatedAt: changed.vehicleUpdatedAt,
        make: "Lexus",
        model: "ES 350",
        valetSessionId: intake.valetSessionId,
      }),
      "VEHICLE_DETAILS_SESSION_NOT_MUTABLE",
    );
  });
});
