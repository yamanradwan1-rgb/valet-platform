import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { inPostgresTransaction } from "../src/common/database/postgres-transaction";
import { AntiAbuseKeyDeriver } from "../src/modules/anti-abuse/anti-abuse-key";
import {
  countClassifiedGuest,
  guestClassMeasurements,
} from "../src/modules/anti-abuse/classified-guest-counter";
import { ShiftTestContext } from "./shift-test-context";

describe("T3 committed, rolled back and ambiguous classified metrics", () => {
  const context = new ShiftTestContext("t3_committed_metrics");
  const previousSecret = process.env.ANTI_ABUSE_HMAC_SECRET_B64URL;
  beforeAll(async () => {
    process.env.ANTI_ABUSE_HMAC_SECRET_B64URL = Buffer.alloc(32, 9).toString(
      "base64url",
    );
    await context.setup();
  }, 120_000);
  afterAll(async () => {
    await context.teardown();
    if (previousSecret === undefined)
      delete process.env.ANTI_ABUSE_HMAC_SECRET_B64URL;
    else process.env.ANTI_ABUSE_HMAC_SECRET_B64URL = previousSecret;
  }, 60_000);
  const key = () =>
    new AntiAbuseKeyDeriver().derive(
      "v1:guest-token",
      randomBytes(32).toString("base64url"),
    );

  it("publishes allowed only after COMMIT and rolls back a later callback failure", async () => {
    const before = { ...guestClassMeasurements.C };
    await expect(
      inPostgresTransaction(context.runtimePool, async (transaction) => {
        await countClassifiedGuest(transaction, key(), "C", 32, 864);
        expect(guestClassMeasurements.C.allowed).toBe(before.allowed);
        throw new Error("failure after accounting");
      }),
    ).rejects.toThrow("failure after accounting");
    expect(guestClassMeasurements.C.allowed).toBe(before.allowed);
    expect(guestClassMeasurements.C.rolledBack).toBe(before.rolledBack + 1);
    await inPostgresTransaction(context.runtimePool, (transaction) =>
      countClassifiedGuest(transaction, key(), "C", 32, 864),
    );
    expect(guestClassMeasurements.C.allowed).toBe(before.allowed + 1);
  });

  it("separates committed rejection from a rejected transaction that rolls back", async () => {
    const limited = key();
    await inPostgresTransaction(context.runtimePool, (transaction) =>
      countClassifiedGuest(transaction, limited, "D", 1, 864),
    );
    const before = { ...guestClassMeasurements.D };
    await inPostgresTransaction(context.runtimePool, (transaction) =>
      countClassifiedGuest(transaction, limited, "D", 1, 864),
    );
    expect(guestClassMeasurements.D.blocked).toBe(before.blocked + 1);
    await expect(
      inPostgresTransaction(context.runtimePool, async (transaction) => {
        const decision = await countClassifiedGuest(
          transaction,
          limited,
          "D",
          1,
          864,
        );
        expect(decision.retryAfter).toBeGreaterThan(0);
        throw new Error("rejected before commit");
      }),
    ).rejects.toThrow();
    expect(guestClassMeasurements.D.blocked).toBe(before.blocked + 1);
    expect(guestClassMeasurements.D.rolledBack).toBe(before.rolledBack + 1);
  });

  it("reports lost COMMIT acknowledgement unavailable without claiming admission", async () => {
    const before = { ...guestClassMeasurements.B };
    await expect(
      inPostgresTransaction(context.runtimePool, async (transaction) => {
        const query = transaction.query.bind(transaction);
        transaction.query = (async (...args: unknown[]) => {
          const result = await Reflect.apply(query, transaction, args);
          if (args[0] === "COMMIT")
            throw new Error("Connection terminated unexpectedly");
          return result;
        }) as typeof transaction.query;
        await countClassifiedGuest(transaction, key(), "B", 32, 864);
      }),
    ).rejects.toThrow();
    expect(guestClassMeasurements.B.allowed).toBe(before.allowed);
    expect(guestClassMeasurements.B.unavailable).toBe(before.unavailable + 1);
  });
});
