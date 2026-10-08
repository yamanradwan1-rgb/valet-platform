import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PaymentApiTestContext } from "./payment-api-test-context";
const context = new PaymentApiTestContext("t3_source_exhaustion");
beforeAll(() => context.setupApi(), 120_000);
afterAll(() => context.teardownApi(), 60_000);
async function paymentFixture() {
  const fixture = await context.createPaymentFixture({
    organizationFee: "10.000",
  });
  await context.initialize(fixture);
  return fixture;
}
describe("T3 Guest downstream rate error preservation", () => {
  it("preserves 429 and Retry-After when authenticated foreign-target source failures reach 60", async () => {
    const owned = await paymentFixture();
    const foreign = await paymentFixture();
    const token = await context.guestToken(owned);
    const before = await context.payment(foreign.sessionId);
    for (let index = 0; index < 60; index += 1) {
      const result = await context.request(
        "GET",
        "/v1/guest/valet-sessions/" + foreign.sessionId + "/payment",
        {
          authorization: "Bearer " + token,
        },
      );
      expect(result.status).toBe(401);
    }
    const blocked = await context.request(
      "GET",
      "/v1/guest/valet-sessions/" + foreign.sessionId + "/payment",
      {
        authorization: "Bearer " + token,
      },
    );
    expect(blocked).toMatchObject({
      status: 429,
      body: { code: "GUEST_ACCESS_RATE_LIMITED" },
    });
    expect(blocked.headers.get("retry-after")).toMatch(/^[1-9][0-9]*$/);
    expect(await context.payment(foreign.sessionId)).toEqual(before);
  });
});
