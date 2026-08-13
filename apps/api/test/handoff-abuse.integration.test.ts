import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { HandoffTestContext } from "./handoff-test-context";

const context = new HandoffTestContext("abuse");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

function differentPickupCode(pickupCode: string): string {
  return pickupCode === "0000" ? "0001" : "0000";
}

describe("VAL-006F handoff anti-abuse", () => {
  it("counts a method-mismatched submission against the active proof", async () => {
    const fixture = await context.createHandoffFixture();
    await context.initiate(fixture);
    await context.issue(fixture, "PICKUP_CODE");
    await expect(
      context.verify(fixture, "DYNAMIC_QR", `vhq1.${"A".repeat(43)}`),
    ).rejects.toMatchObject({ code: "HANDOFF_VERIFICATION_FAILED" });
    expect(
      (await context.handoffEffects(fixture)).verifications[0]?.attempt_count,
    ).toBe(1);
  });

  it("enforces durable issuance and failed-proof limits across rotations", async () => {
    const fixture = await context.createHandoffFixture();
    await context.initiate(fixture);
    let invalidCode = "";
    for (let issuance = 0; issuance < 5; issuance += 1) {
      const material = await context.issue(
        fixture,
        "PICKUP_CODE",
        issuance > 0,
      );
      if (material.method !== "PICKUP_CODE")
        throw new Error("Unexpected method.");
      invalidCode = differentPickupCode(material.pickupCode);
      for (let attempt = 0; attempt < 2; attempt += 1) {
        await expect(
          context.verify(fixture, "PICKUP_CODE", invalidCode),
        ).rejects.toMatchObject({ code: "HANDOFF_VERIFICATION_FAILED" });
      }
    }
    await expect(
      context.verify(fixture, "PICKUP_CODE", invalidCode),
    ).rejects.toMatchObject({
      code: "HANDOFF_VERIFICATION_RATE_LIMITED",
      retryAfter: expect.any(Number),
    });
    await expect(
      context.issue(fixture, "PICKUP_CODE", true),
    ).rejects.toMatchObject({
      code: "HANDOFF_VERIFICATION_RATE_LIMITED",
      retryAfter: expect.any(Number),
    });
  });
});
