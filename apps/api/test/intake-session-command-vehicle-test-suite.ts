import { describe, expect, it } from "vitest";

import { createIntakeSessionCommandExecutor } from "../src/modules/valet-sessions/intake-session-command";
import type { IntakeSessionCommandTestHarness } from "./intake-session-command-test-harness";
import { differentCustomer } from "./returning-check-in-test-context";

export function registerIntakeSessionVehicleTests(
  harness: IntakeSessionCommandTestHarness,
): void {
  const {
    completeSession,
    confirmedRequest,
    createFixture,
    expectCommandError,
    readCounts,
    temporaryRequest,
  } = harness;

  describe("VAL-004E intake vehicle identity", () => {
    it("creates and later reuses one same-Organization confirmed Vehicle", async () => {
      const fixture = await createFixture();
      const execute = createIntakeSessionCommandExecutor(harness.runtimePool);
      const first = await execute(confirmedRequest(fixture));
      const vehicle = await harness.adminPool.query<{
        plate_country: string;
        plate_number_normalized: string;
        plate_number_raw: string;
      }>(
        `SELECT plate_country, plate_number_normalized, plate_number_raw
       FROM vehicles WHERE id = $1`,
        [first.vehicleId],
      );
      expect(vehicle.rows[0]).toEqual({
        plate_country: "JO",
        plate_number_normalized: "AB123",
        plate_number_raw: "ab-１２３",
      });
      await completeSession(fixture, first.valetSessionId);
      const second = await execute(confirmedRequest(fixture));
      expect(second.vehicleId).toBe(first.vehicleId);
      expect(second.valetSessionId).not.toBe(first.valetSessionId);
      expect((await readCounts(fixture.organizationId)).vehicles).toBe(1);
    });

    it("keeps identical confirmed plates and phone values independent across Organizations", async () => {
      const firstFixture = await createFixture();
      const secondFixture = await createFixture();
      const execute = createIntakeSessionCommandExecutor(harness.runtimePool);
      const customer = differentCustomer("+962791234567");
      const first = await execute({
        ...confirmedRequest(firstFixture),
        customer,
      });
      const second = await execute({
        ...confirmedRequest(secondFixture),
        customer,
      });
      expect(first.vehicleId).not.toBe(second.vehicleId);
      expect(first.customerId).not.toBe(second.customerId);
    });

    it("always creates distinct Vehicles for temporary descriptors", async () => {
      const fixture = await createFixture();
      const execute = createIntakeSessionCommandExecutor(harness.runtimePool);
      const identity = {
        mode: "TEMPORARY_DESCRIPTOR" as const,
        temporaryDescriptor: "Black sedan, plate unreadable",
      };
      const first = await execute(
        temporaryRequest(fixture, { vehicleIdentity: identity }),
      );
      const second = await execute(
        temporaryRequest(fixture, { vehicleIdentity: identity }),
      );
      expect(first.vehicleId).not.toBe(second.vehicleId);
      expect((await readCounts(fixture.organizationId)).vehicles).toBe(2);
    });

    it("does not let an OCR candidate become authoritative without human confirmation", async () => {
      const fixture = await createFixture();
      const before = await readCounts(fixture.organizationId);
      await expectCommandError(
        createIntakeSessionCommandExecutor(harness.runtimePool)(
          temporaryRequest(fixture, {
            vehicleIdentity: {
              confirmedByHuman: false,
              mode: "CONFIRMED_PLATE",
              plateCandidate: {
                plateCountry: "JO",
                plateNumberRaw: "AB123",
                source: "OCR",
              },
              plateCountry: "JO",
              plateNumberRaw: "AB123",
            },
          }),
        ),
        "VEHICLE_IDENTITY_CONFIRMATION_REQUIRED",
      );
      expect(await readCounts(fixture.organizationId)).toEqual(before);
    });
  });
}
