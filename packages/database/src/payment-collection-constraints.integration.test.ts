import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PaymentCollectionDatabaseContext } from "./payment-collection-database-context.js";

const context = new PaymentCollectionDatabaseContext();

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

describe("PaymentCollectionOperation database invariants", () => {
  it.each([
    ["PREPARED", null, null],
    ["OUTCOME_UNKNOWN", new Date(), null],
    ["REFERENCE_ATTACHED", new Date(), null],
    ["REJECTED", new Date(), new Date()],
    ["RESOLVED", new Date(), new Date()],
  ])(
    "accepts valid %s state data",
    async (state, dispatchGuardedAt, resolvedAt) => {
      const fixture = await context.createPayment();
      await expect(
        context.insertOperation(fixture, {
          dispatchGuardedAt,
          providerReference:
            state === "REFERENCE_ATTACHED" || state === "RESOLVED"
              ? randomUUID()
              : null,
          resolvedAt,
          state,
        }),
      ).resolves.toBeDefined();
    },
  );

  it.each([
    { amount: "0" },
    { amount: "-1" },
    { currency: "jod" },
    { currency: "JODD" },
    { provider: "   " },
    { dispatchGuardedAt: new Date(), state: "PREPARED" },
    { state: "OUTCOME_UNKNOWN" },
    { dispatchGuardedAt: new Date(), state: "REFERENCE_ATTACHED" },
    {
      dispatchGuardedAt: new Date(),
      providerReference: randomUUID(),
      state: "REJECTED",
    },
    {
      dispatchGuardedAt: new Date(),
      resolvedAt: new Date(),
      state: "RESOLVED",
    },
  ])("rejects invalid row-local data %#", async (input) => {
    const fixture = await context.createPayment();
    await expect(context.insertOperation(fixture, input)).rejects.toMatchObject(
      {
        code: "23514",
      },
    );
  });

  it("scopes submission keys and provider references by Organization", async () => {
    const first = await context.createPayment();
    const second = await context.createPayment();
    const key = randomUUID();
    const reference = randomUUID();
    await context.insertOperation(first, {
      dispatchGuardedAt: new Date(),
      providerReference: reference,
      state: "REFERENCE_ATTACHED",
      submissionKey: key,
    });
    await expect(
      context.insertOperation(second, {
        dispatchGuardedAt: new Date(),
        providerReference: reference,
        state: "REFERENCE_ATTACHED",
        submissionKey: key,
      }),
    ).resolves.toBeDefined();
  });

  it("rejects duplicate scoped submission keys and provider references", async () => {
    const fixture = await context.createPayment();
    const other = await context.createPayment(fixture.organizationId);
    const key = randomUUID();
    await context.insertOperation(fixture, { submissionKey: key });
    await expect(
      context.insertOperation(other, { submissionKey: key }),
    ).rejects.toMatchObject({ code: "23505" });

    const reference = randomUUID();
    await context.client.query(
      `UPDATE payment_collection_operations
       SET state = 'REJECTED', dispatch_guarded_at = transaction_timestamp(),
           resolved_at = transaction_timestamp(), updated_at = transaction_timestamp()
       WHERE organization_id = $1 AND submission_idempotency_key = $2`,
      [fixture.organizationId, key],
    );
    await context.insertOperation(fixture, {
      dispatchGuardedAt: new Date(),
      providerReference: reference,
      state: "REFERENCE_ATTACHED",
    });
    await expect(
      context.insertOperation(other, {
        dispatchGuardedAt: new Date(),
        providerReference: reference,
        state: "REFERENCE_ATTACHED",
      }),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("allows null references but only one unresolved operation per Payment", async () => {
    const fixture = await context.createPayment();
    await context.insertOperation(fixture);
    await expect(context.insertOperation(fixture)).rejects.toMatchObject({
      code: "23505",
    });
    await context.client.query(
      `UPDATE payment_collection_operations
       SET state = 'REJECTED', dispatch_guarded_at = transaction_timestamp(),
           resolved_at = transaction_timestamp(), updated_at = transaction_timestamp()
       WHERE payment_id = $1`,
      [fixture.paymentId],
    );
    await context.insertOperation(fixture);
    await context.client.query(
      `UPDATE payment_collection_operations
       SET state = 'RESOLVED', provider_reference = $2,
           dispatch_guarded_at = transaction_timestamp(),
           resolved_at = transaction_timestamp(), updated_at = transaction_timestamp()
       WHERE payment_id = $1 AND state = 'PREPARED'`,
      [fixture.paymentId, randomUUID()],
    );
    await expect(context.insertOperation(fixture)).resolves.toBeDefined();
  });

  it("rejects a Payment from another Organization", async () => {
    const first = await context.createPayment();
    const second = await context.createPayment();
    await expect(
      context.insertOperation({ ...first, paymentId: second.paymentId }),
    ).rejects.toMatchObject({ code: "23503" });
  });
});
