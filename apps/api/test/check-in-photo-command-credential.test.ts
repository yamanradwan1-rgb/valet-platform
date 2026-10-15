import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { PostgresPool } from "../src/common/database/postgres";
import { createCompleteCheckInConditionCommandExecutor } from "../src/modules/valet-sessions/check-in-condition-command";
import { createCompleteCheckInCommandExecutor } from "../src/modules/valet-sessions/complete-check-in-command";
import type { StaffSessionContext } from "../src/modules/auth/staff-session-context";

const request = {
  authenticatedUserId: "11111111-1111-4111-8111-111111111111",
  valetSessionId: "22222222-2222-4222-8222-222222222222",
};
const credential: StaffSessionContext = {
  userId: request.authenticatedUserId,
  staffAuthSessionId: "33333333-3333-4333-8333-333333333333",
  accessTokenHash: "for-test-only-hash",
  createdAt: new Date("2026-10-15T00:00:00.000Z"),
};

function revokedAfterPreflightPool() {
  const commands: string[] = [];
  const query = vi.fn(async (sql: string) => {
    commands.push(sql);
    // The exact StaffAuthSession row was deleted/revoked while S3 was pending.
    return { rows: [] };
  });
  const release = vi.fn();
  const pool = {
    connect: vi.fn(async () => ({ query, release })),
  } as unknown as PostgresPool;
  return { commands, pool, release };
}

describe("P3 exact staff bearer required for trusted evidence", () => {
  it("refuses bypass through a direct marker executor without credential", async () => {
    const preflight = vi.fn(async () => ({
      requestNonce: "server-created-nonce-0123456789",
      receipt: undefined,
    }));
    const pool = { connect: vi.fn() } as unknown as PostgresPool;
    await expect(createCompleteCheckInConditionCommandExecutor(pool, {
      photoPreflight: preflight,
    })(request)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(preflight).not.toHaveBeenCalled();
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it("refuses bypass through a direct final executor without credential", async () => {
    const preflight = vi.fn(async () => ({
      requestNonce: "server-created-nonce-0123456789",
      receipt: undefined,
    }));
    const pool = { connect: vi.fn() } as unknown as PostgresPool;
    await expect(createCompleteCheckInCommandExecutor(pool, {
      photoPreflight: preflight,
    })({ ...request, expectedVersion: 1 })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(preflight).not.toHaveBeenCalled();
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it.each(["condition", "final"] as const)(
    "revoked token after delayed %s byte preflight never reaches a mutation or audit",
    async (command) => {
      let releaseProof!: (value: { requestNonce: string; receipt: undefined }) => void;
      const delayed = new Promise<{ requestNonce: string; receipt: undefined }>((resolve) => {
        releaseProof = resolve;
      });
      const preflight = vi.fn(() => delayed);
      const h = revokedAfterPreflightPool();
      const pending = command === "condition"
        ? createCompleteCheckInConditionCommandExecutor(h.pool, {
          photoPreflight: preflight,
        })(request, credential)
        : createCompleteCheckInCommandExecutor(h.pool, {
          photoPreflight: preflight,
        })({ ...request, expectedVersion: 1 }, credential);

      expect(preflight).toHaveBeenCalledTimes(1);
      expect(h.commands).toEqual([]);
      releaseProof({ requestNonce: "server-nonce-0123456789", receipt: undefined });
      await expect(pending).rejects.toBeInstanceOf(UnauthorizedException);
      expect(h.commands[0]).toBe("BEGIN");
      expect(h.commands.some((sql) => sql.includes("FROM staff_auth_sessions"))).toBe(true);
      expect(h.commands).toContain("ROLLBACK");
      expect(h.commands.some((sql) => /\b(UPDATE|INSERT)\s+(valet_sessions|audit_events)\b/i.test(sql)))
        .toBe(false);
      expect(h.release).toHaveBeenCalledOnce();
    },
  );
});
