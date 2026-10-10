import { afterEach, describe, expect, it, vi } from "vitest";

import type { PostgresPool } from "../src/common/database/postgres";
import type { StaffSessionContext } from "../src/modules/auth/staff-session-context";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  page: vi.fn(),
  history: vi.fn(),
}));
vi.mock("../src/modules/dashboard/live-history-read-authorization", () => ({
  authorizeLiveHistoryLocation: mocks.authorize,
}));
vi.mock("../src/modules/dashboard/overview-sessions-query", () => ({
  dashboardSessionsInTransaction: mocks.page,
}));
vi.mock("../src/modules/dashboard/operational-history-projection", () => ({
  getOperationalHistoryForSessions: mocks.history,
}));

import { listLiveDashboardSessions } from "../src/modules/dashboard/live-sessions-query";

const id = "11111111-1111-4111-8111-111111111111";
const scope = {
  organizationId: id,
  locationId: id,
  membershipId: "22222222-2222-4222-8222-222222222222",
};
const context = {
  userId: "33333333-3333-4333-8333-333333333333",
  staffAuthSessionId: "44444444-4444-4444-8444-444444444444",
  accessTokenHash: "opaque-test-verifier",
  createdAt: new Date("2026-10-09T09:00:00.000Z"),
} satisfies StaffSessionContext;
const entry = {
  sessionId: id,
  state: "PARKED",
  activeTask: null,
};

function fakePool() {
  const sql: string[] = [];
  const transaction = {
    query: vi.fn(async (statement: string) => {
      sql.push(statement);
      return { rows: [], rowCount: 0 };
    }),
    release: vi.fn(),
  };
  return {
    pool: {
      connect: vi.fn(async () => transaction),
    } as unknown as PostgresPool,
    sql,
    transaction,
  };
}

afterEach(() => {
  vi.resetAllMocks();
});

describe("DEC-102 Live sessions transaction boundary (no DB)", () => {
  it("locks viewer authority, selects bounded page, then reads scoped history in one transaction", async () => {
    const order: string[] = [];
    mocks.authorize.mockImplementation(async () => {
      order.push("authority");
      return scope;
    });
    mocks.page.mockImplementation(async () => {
      order.push("page");
      return { items: [entry], nextCursor: null };
    });
    mocks.history.mockImplementation(async () => {
      order.push("history");
      return new Map([
        [
          id,
          {
            checkedInBy: { firstName: "Nora", lastName: "Salem" },
            parkedBy: { firstName: "Fadi", lastName: "Salem" },
            parkingCompletionProof: "PROVEN",
          },
        ],
      ]);
    });
    const { pool, sql, transaction } = fakePool();
    const result = await listLiveDashboardSessions(pool, {
      authenticatedUserId: context.userId,
      staffSessionContext: context,
      locationId: id,
      limit: 50,
      filter: "PARKED",
    });
    expect(order).toEqual(["authority", "page", "history"]);
    expect(sql).toEqual(["BEGIN", "COMMIT"]);
    expect(transaction.release).toHaveBeenCalledOnce();
    expect(mocks.page).toHaveBeenCalledWith(
      transaction,
      scope,
      expect.objectContaining({ locationId: id, limit: 50, filter: "PARKED" }),
    );
    expect(mocks.history).toHaveBeenCalledWith(transaction, {
      organizationId: id,
      locationId: id,
      sessionIds: [id],
    });
    expect(result.items).toEqual([
      {
        ...entry,
        checkedInBy: { firstName: "Nora", lastName: "Salem" },
        parkedBy: { firstName: "Fadi", lastName: "Salem" },
        parkingCompletionProof: "PROVEN",
      },
    ]);
  });

  it("never reads history on revoked viewer authority", async () => {
    mocks.authorize.mockResolvedValue(null);
    const { pool, sql } = fakePool();
    await expect(
      listLiveDashboardSessions(pool, {
        authenticatedUserId: context.userId,
        staffSessionContext: context,
        locationId: id,
        limit: 50,
      }),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    expect(mocks.page).not.toHaveBeenCalled();
    expect(mocks.history).not.toHaveBeenCalled();
    expect(sql).toEqual(["BEGIN", "ROLLBACK"]);
  });

  it("never returns a partial history when any authorized session is omitted", async () => {
    mocks.authorize.mockResolvedValue(scope);
    mocks.page.mockResolvedValue({ items: [entry], nextCursor: null });
    mocks.history.mockResolvedValue(new Map());
    const { pool, sql } = fakePool();
    await expect(
      listLiveDashboardSessions(pool, {
        authenticatedUserId: context.userId,
        staffSessionContext: context,
        locationId: id,
        limit: 50,
      }),
    ).rejects.toThrow("projection is incomplete");
    expect(sql).toEqual(["BEGIN", "ROLLBACK"]);
  });
});
