import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/modules/management/issue416-password-reset-authority", () => ({
  preflightPasswordResetTarget: vi.fn(),
}));

import { generateStaffCredential } from "../src/modules/auth/staff-auth-credential";
import type { StaffSessionContext } from "../src/modules/auth/staff-session-context";
import { preflightPasswordResetTarget } from "../src/modules/management/issue416-password-reset-authority";
import { resolveIssue416ResetCaller } from "../src/modules/management/issue416-password-reset-caller";

const bearer = generateStaffCredential("vsa1.");
const authorization = `Bearer ${bearer}`;
const context = Object.defineProperty(
  {
    createdAt: new Date(),
    staffAuthSessionId: randomUUID(),
    userId: randomUUID(),
  },
  "rawAccessToken",
  {
    configurable: false,
    enumerable: false,
    value: bearer,
    writable: false,
  },
) as StaffSessionContext;
const organizationId = randomUUID();
const membershipId = randomUUID();
const targetUserId = randomUUID();

function setup(contextResult: StaffSessionContext = context) {
  const transaction = {
    query: vi.fn().mockResolvedValue({ rowCount: 0, rows: [] }),
    release: vi.fn(),
  };
  const pool = { connect: vi.fn().mockResolvedValue(transaction) };
  const sessions = { resolve: vi.fn().mockResolvedValue(contextResult) };
  return { transaction, pool, sessions };
}

beforeEach(() => {
  vi.mocked(preflightPasswordResetTarget)
    .mockReset()
    .mockResolvedValue(targetUserId);
});

describe("Issue416 genuine bearer-bound management preflight", () => {
  it("denies absent or synthetic bearer before session and DB access", async () => {
    const { sessions, pool } = setup();
    await expect(
      resolveIssue416ResetCaller(
        pool as never,
        sessions as never,
        undefined,
        organizationId,
        membershipId,
      ),
    ).rejects.toMatchObject({ status: 401 });
    expect(sessions.resolve).not.toHaveBeenCalled();
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it("denies a forged context bearer despite the resolver claiming an active session", async () => {
    const { sessions, pool } = setup({
      ...context,
      rawAccessToken: generateStaffCredential("vsa1."),
    });
    await expect(
      resolveIssue416ResetCaller(
        pool as never,
        sessions as never,
        authorization,
        organizationId,
        membershipId,
      ),
    ).rejects.toMatchObject({ status: 401 });
    expect(pool.connect).not.toHaveBeenCalled();
    expect(preflightPasswordResetTarget).not.toHaveBeenCalled();
  });

  it("rechecks Company Admin, five-minute MFA and target inside a transaction", async () => {
    const { pool, sessions, transaction } = setup();
    const actual = await resolveIssue416ResetCaller(
      pool as never,
      sessions as never,
      authorization,
      organizationId,
      membershipId,
    );
    expect(actual).toEqual({
      authorization,
      context,
      organizationId,
      membershipId,
      targetUserId,
    });
    expect(preflightPasswordResetTarget).toHaveBeenCalledWith(
      transaction,
      context,
      organizationId,
      membershipId,
    );
    expect(
      transaction.query.mock.calls.map(([statement]) => statement),
    ).toEqual(["BEGIN", "COMMIT"]);
    expect(transaction.release).toHaveBeenCalledTimes(1);
  });

  it("rolls back on denied target without creating reset authority", async () => {
    const { pool, sessions, transaction } = setup();
    vi.mocked(preflightPasswordResetTarget).mockRejectedValueOnce(
      Object.assign(new Error("not visible"), { code: "AUTHORIZATION_DENIED" }),
    );
    await expect(
      resolveIssue416ResetCaller(
        pool as never,
        sessions as never,
        authorization,
        organizationId,
        membershipId,
      ),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    expect(
      transaction.query.mock.calls.map(([statement]) => statement),
    ).toEqual(["BEGIN", "ROLLBACK"]);
  });
});
