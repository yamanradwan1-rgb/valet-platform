import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createIntakeSessionCommandExecutor,
  type IntakeSessionCommandRequest,
} from "../src/modules/valet-sessions/intake-session-command";
import { createReturningVehicleRecognitionQuery } from "../src/modules/vehicles/returning-vehicle-recognition";
import {
  ReturningCheckInTestContext,
  type ReturningFixture,
} from "./returning-check-in-test-context";

const context = new ReturningCheckInTestContext();
const plate = (raw = "  AB-１２３  ") => ({
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
const recognize = (fixture: ReturningFixture, raw = "ab123") =>
  createReturningVehicleRecognitionQuery(context.runtime)({
    authenticatedUserId: fixture.userId,
    targetLocationId: fixture.locationId,
    vehicleIdentity: plate(raw),
  });
const failWith = async (operation: Promise<unknown>, code: string) => {
  await expect(operation).rejects.toMatchObject({ code });
};

async function complete(sessionId: string, fixture: ReturningFixture) {
  await context.admin.query(
    `UPDATE valet_sessions
     SET state = 'COMPLETED', completed_at = transaction_timestamp(),
         completed_by_membership_id = $2, updated_at = transaction_timestamp()
     WHERE id = $1`,
    [sessionId, fixture.membershipId],
  );
}

async function visit(
  fixture: ReturningFixture,
  phone: string,
  displayName = "Returning Guest",
) {
  const result = await createIntakeSessionCommandExecutor(context.runtime)(
    request(fixture, {
      customer: { displayName, intent: "DIFFERENT_CUSTOMER", phone },
    }),
  );
  await complete(result.valetSessionId, fixture);
  return result;
}

beforeAll(() => context.start(), 120_000);
afterAll(() => context.stop(), 60_000);

describe("DEC-069 returning Check-In", () => {
  it("recognizes only an authorized exact same-organization plate and is read-only", async () => {
    const fixture = await context.fixture();
    const created = await createIntakeSessionCommandExecutor(context.runtime)(
      request(fixture, {
        vehicleDetails: { color: " Black ", make: " Lexus ", model: " ES " },
      }),
    );
    await complete(created.valetSessionId, fixture);
    const countsBefore = await context.admin.query(
      `SELECT (SELECT count(*) FROM vehicles) AS vehicles,
              (SELECT count(*) FROM audit_events) AS audits`,
    );
    const exact = await recognize(fixture);
    expect(exact.vehicle).toMatchObject({
      color: "Black",
      make: "Lexus",
      model: "ES",
      vehicleId: created.vehicleId,
      returningCustomer: null,
    });
    expect(await recognize(fixture, "ab12")).toEqual({ vehicle: null });
    const secondLocation = await context.addLocation(fixture);
    expect(
      (
        await createReturningVehicleRecognitionQuery(context.runtime)({
          authenticatedUserId: fixture.userId,
          targetLocationId: secondLocation,
          vehicleIdentity: plate("AB 123"),
        })
      ).vehicle?.vehicleId,
    ).toBe(created.vehicleId);
    expect(
      (
        await context.admin.query(
          `SELECT (SELECT count(*) FROM vehicles) AS vehicles,
              (SELECT count(*) FROM audit_events) AS audits`,
        )
      ).rows,
    ).toEqual(countsBefore.rows);
  });

  it("does not disclose foreign vehicles or authorize missing access and management roles", async () => {
    const owner = await context.fixture();
    await createIntakeSessionCommandExecutor(context.runtime)(request(owner));
    const foreign = await context.fixture();
    expect(await recognize(foreign)).toEqual({ vehicle: null });
    const denied = await context.fixture({ locationAccess: false });
    await failWith(recognize(denied), "LOCATION_ACCESS_DENIED");
    for (const role of ["LOCATION_MANAGER", "ORG_ADMIN"] as const) {
      const manager = await context.fixture({ role });
      await failWith(recognize(manager), "AUTHORIZATION_DENIED");
    }
  });

  it("suggests one distinct completed customer across locations with minimum disclosure", async () => {
    const fixture = await context.fixture();
    const first = await visit(fixture, "+962791234567", "Amina");
    const secondLocation = await context.addLocation(fixture);
    const second = await createIntakeSessionCommandExecutor(context.runtime)(
      request(
        { ...fixture, locationId: secondLocation },
        { customer: { intent: "DIFFERENT_CUSTOMER", phone: "+962791234567" } },
      ),
    );
    await complete(second.valetSessionId, fixture);
    const result = await recognize(fixture);
    expect(result.vehicle?.returningCustomer).toEqual({
      customerId: first.customerId,
      displayName: "Amina",
      phoneSuffix: "4567",
    });
    expect(JSON.stringify(result)).not.toContain("+962791234567");
    expect(Object.keys(result.vehicle?.returningCustomer ?? {})).toEqual([
      "customerId",
      "displayName",
      "phoneSuffix",
    ]);
  });

  it("ignores non-completed history and suppresses ambiguous customer history", async () => {
    const fixture = await context.fixture();
    const first = await visit(fixture, "+962790000001", "One");
    const pending = await createIntakeSessionCommandExecutor(context.runtime)(
      request(fixture, {
        customer: { intent: "DIFFERENT_CUSTOMER", phone: "+962790000002" },
      }),
    );
    expect(
      (await recognize(fixture)).vehicle?.returningCustomer?.customerId,
    ).toBe(first.customerId);
    await complete(pending.valetSessionId, fixture);
    expect((await recognize(fixture)).vehicle?.returningCustomer).toBeNull();
  });

  it("revalidates saved intent and rejects arbitrary, cross-tenant, and stale ambiguity without effects", async () => {
    const fixture = await context.fixture();
    const history = await visit(fixture, "+962790000011");
    const execute = createIntakeSessionCommandExecutor(context.runtime);
    const valid = await execute(
      request(fixture, {
        customer: {
          customerId: history.customerId!,
          intent: "USE_SAVED_CUSTOMER",
        },
      }),
    );
    expect(valid.customerId).toBe(history.customerId);
    await complete(valid.valetSessionId, fixture);
    const arbitrary = randomUUID();
    await context.admin.query(
      `INSERT INTO customers (id, organization_id, phone_normalized, created_at, updated_at)
       VALUES ($1, $2, '+962790000099', transaction_timestamp(), transaction_timestamp())`,
      [arbitrary, fixture.organizationId],
    );
    const before = await context.admin.query(
      `SELECT count(*) AS sessions FROM valet_sessions WHERE organization_id = $1`,
      [fixture.organizationId],
    );
    await failWith(
      execute(
        request(fixture, {
          customer: { customerId: arbitrary, intent: "USE_SAVED_CUSTOMER" },
        }),
      ),
      "RETURNING_CUSTOMER_INTENT_INVALID",
    );
    await visit(fixture, "+962790000012", "Second");
    await failWith(
      execute(
        request(fixture, {
          customer: {
            customerId: history.customerId!,
            intent: "USE_SAVED_CUSTOMER",
          },
        }),
      ),
      "RETURNING_CUSTOMER_INTENT_INVALID",
    );
    const foreign = await context.fixture();
    const foreignCustomer = await visit(foreign, "+962790000013");
    await failWith(
      execute(
        request(fixture, {
          customer: {
            customerId: foreignCustomer.customerId!,
            intent: "USE_SAVED_CUSTOMER",
          },
        }),
      ),
      "RETURNING_CUSTOMER_INTENT_INVALID",
    );
    const after = await context.admin.query(
      `SELECT count(*) AS sessions FROM valet_sessions WHERE organization_id = $1`,
      [fixture.organizationId],
    );
    expect(Number(after.rows[0]?.sessions)).toBe(
      Number(before.rows[0]?.sessions) + 1,
    );
  });

  it("serializes saved-customer use against a concurrent history completion", async () => {
    const fixture = await context.fixture();
    const first = await visit(fixture, "+962790000041", "First");
    const pending = await createIntakeSessionCommandExecutor(context.runtime)(
      request(fixture, {
        customer: {
          intent: "DIFFERENT_CUSTOMER",
          phone: "+962790000042",
        },
      }),
    );
    const transition = await context.admin.connect();
    try {
      await transition.query("BEGIN");
      await transition.query(
        `UPDATE valet_sessions
         SET state = 'COMPLETED', completed_at = transaction_timestamp(),
             completed_by_membership_id = $2, updated_at = transaction_timestamp()
         WHERE id = $1`,
        [pending.valetSessionId, fixture.membershipId],
      );
      const intake = createIntakeSessionCommandExecutor(context.runtime)(
        request(fixture, {
          customer: {
            customerId: first.customerId!,
            intent: "USE_SAVED_CUSTOMER",
          },
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 50));
      await transition.query("COMMIT");
      await failWith(intake, "RETURNING_CUSTOMER_INTENT_INVALID");
    } finally {
      await transition.query("ROLLBACK").catch(() => undefined);
      transition.release();
    }
  });
});
