import { randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it, vi } from "vitest";

import type {
  PostgresPool,
  PostgresTransaction,
} from "../src/common/database/postgres";
import { hashStaffPassword } from "../src/modules/auth/staff-password-hashing";
import {
  denyUntilVap1StaffLoginAdmission,
  Vap1StaffLoginAdmissionUnavailable,
} from "../src/modules/auth/vap1/vap1-staff-login-preflight";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const PASSWORD = "Correct genuine passphrase #416";
const EMAIL = "employee@example.invalid";

let actualArgon2Phc: string;
beforeAll(async () => {
  actualArgon2Phc = await hashStaffPassword(PASSWORD);
});

function mockDatabase(
  options: {
    readonly lookupHash?: string | null;
    readonly lookupStatus?: "ACTIVE" | "PENDING" | "DISABLED";
    readonly lockedHash?: string | null;
    readonly lockedStatus?: "ACTIVE" | "PENDING" | "DISABLED";
    readonly missingUser?: boolean;
    readonly failLookup?: boolean;
  } = {},
) {
  const lookupQuery = vi.fn(async (sql: string, args?: unknown[]) => {
    if (
      sql !== "SELECT id, password_hash, status FROM users WHERE email = $1" ||
      args?.[0] !== EMAIL
    ) {
      throw new Error("Unexpected lookup query");
    }
    if (options.failLookup) throw new Error("database failure: secret context");
    return {
      rows: options.missingUser
        ? []
        : [
            {
              id: USER_ID,
              status: options.lookupStatus ?? "ACTIVE",
              password_hash:
                options.lookupHash === undefined
                  ? actualArgon2Phc
                  : options.lookupHash,
            },
          ],
    };
  });
  const lockedQuery = vi.fn(async (sql: string, args?: unknown[]) => {
    if (sql.includes("pg_advisory_xact_lock")) return { rows: [] };
    if (sql.includes("FOR UPDATE")) {
      if (args?.[0] !== USER_ID) throw new Error("Unexpected locked User");
      return {
        rows: [
          {
            status: options.lockedStatus ?? "ACTIVE",
            password_hash:
              options.lockedHash === undefined
                ? actualArgon2Phc
                : options.lockedHash,
          },
        ],
      };
    }
    throw new Error("preflight attempted an unauthorized SQL command");
  });
  const lookupPool = { query: lookupQuery } as unknown as Pick<
    PostgresPool,
    "query"
  >;
  const transaction = { query: lockedQuery } as unknown as PostgresTransaction;
  return { lookupPool, transaction, lookupQuery, lockedQuery };
}

function request(
  db: ReturnType<typeof mockDatabase>,
  overrides: Record<string, unknown> = {},
) {
  return {
    lookupPool: db.lookupPool,
    transaction: db.transaction,
    email: EMAIL,
    submittedPassword: PASSWORD,
    operationId: randomUUID(),
    audience: "test-audience",
    ...overrides,
  };
}

async function denied(
  input: Parameters<typeof denyUntilVap1StaffLoginAdmission>[0],
) {
  await expect(denyUntilVap1StaffLoginAdmission(input)).rejects.toEqual(
    new Vap1StaffLoginAdmissionUnavailable(),
  );
}

describe("Issue416 authentic A01 preflight stays dormant without protected writer", () => {
  it("verifies real submitted Argon2 password and exact locked User PHC, yet never issues authority", async () => {
    const db = mockDatabase();
    await denied(request(db));
    expect(db.lookupQuery).toHaveBeenCalledExactlyOnceWith(
      "SELECT id, password_hash, status FROM users WHERE email = $1",
      [EMAIL],
    );
    expect(db.lockedQuery).toHaveBeenCalledTimes(2);
    expect(db.lockedQuery.mock.calls[0]?.[0]).toContain(
      "pg_advisory_xact_lock",
    );
    expect(db.lockedQuery.mock.calls[1]).toEqual([
      "SELECT password_hash, status FROM users WHERE id = $1 FOR UPDATE",
      [USER_ID],
    ]);
    // Raw password never becomes a SQL argument or a recorded authority claim.
    expect(JSON.stringify(db.lookupQuery.mock.calls)).not.toContain(PASSWORD);
    expect(JSON.stringify(db.lockedQuery.mock.calls)).not.toContain(PASSWORD);
  });

  it("rejects a forged PHC/UserID/context without the original submitted password", async () => {
    const db = mockDatabase();
    await denied(
      request(db, {
        submittedPassword: undefined,
        userId: USER_ID,
        passwordHash: actualArgon2Phc,
        passwordVerified: true,
        sessionId: randomUUID(),
        isAdmin: true,
      }),
    );
    expect(db.lockedQuery).not.toHaveBeenCalled();
  });

  it("rejects a wrong submitted password, even with a genuine stored PHC", async () => {
    const db = mockDatabase();
    await denied(request(db, { submittedPassword: "wrong password" }));
    expect(db.lockedQuery).not.toHaveBeenCalled();
  });

  it("rejects a password rotation raced between Argon2 and locked User check", async () => {
    const db = mockDatabase({ lockedHash: "different current Argon2 PHC" });
    await denied(request(db));
    expect(db.lockedQuery).toHaveBeenCalledTimes(2);
  });

  it("refuses a disabled User even when the password matches", async () => {
    const db = mockDatabase({ lookupStatus: "DISABLED" });
    await denied(request(db));
    expect(db.lockedQuery).not.toHaveBeenCalled();
  });

  it("refuses an invalid account/operation/audience before any SQL", async () => {
    for (const override of [
      { operationId: "not-a-uuid" },
      { audience: "tenant\nforged" },
      { audience: "tenant\n" },
      { operationId: `${randomUUID()}\n` },
      { email: undefined },
    ]) {
      const db = mockDatabase();
      await denied(request(db, override));
      expect(db.lookupQuery).not.toHaveBeenCalled();
      expect(db.lockedQuery).not.toHaveBeenCalled();
    }
  });

  it("makes missing User and infrastructure failures indistinguishable to callers", async () => {
    for (const options of [{ missingUser: true }, { failLookup: true }]) {
      const db = mockDatabase(options);
      await denied(request(db));
      expect(db.lockedQuery).not.toHaveBeenCalled();
    }
  });

  it("rejects a locked User disabled after a successful real password comparison", async () => {
    const db = mockDatabase({ lockedStatus: "DISABLED" });
    await denied(request(db));
    expect(db.lockedQuery).toHaveBeenCalledTimes(2);
  });

  it("rejects even a valid submitted password if the trusted database returns no PHC", async () => {
    const db = mockDatabase({ lookupHash: null });
    await denied(request(db));
    expect(db.lockedQuery).not.toHaveBeenCalled();
  });
});
