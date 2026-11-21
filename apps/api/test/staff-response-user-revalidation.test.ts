import {
  UnauthorizedException,
  type CallHandler,
  type ExecutionContext,
} from "@nestjs/common";
import { lastValueFrom, of } from "rxjs";
import { describe, expect, it, vi } from "vitest";

import type { PostgresPool } from "../src/common/database/postgres";
import { StaffResponseUserRevalidationInterceptor } from "../src/modules/auth/staff-response-user-revalidation.interceptor";

const bearer = `Bearer vsa1.${"A".repeat(43)}`;

function scenario(
  options: {
    readonly method?: string;
    readonly path?: string;
    readonly authorization?: string;
    readonly headersSent?: boolean;
  } = {},
) {
  const query = vi.fn().mockResolvedValue({
    rows: [
      {
        id: "10000000-0000-4000-8000-000000000001",
        user_id: "20000000-0000-4000-8000-000000000002",
        created_at: new Date("2026-11-16T12:00:00Z"),
      },
    ],
  });
  const pool = { query } as unknown as PostgresPool;
  const interceptor = new StaffResponseUserRevalidationInterceptor(pool);
  const request = {
    method: options.method ?? "GET",
    path: options.path ?? "/v1/staff/dashboard/organizations",
    headers: {
      authorization: options.authorization ?? bearer,
    },
  };
  const response = { headersSent: options.headersSent ?? false };
  const context = {
    getType: () => "http",
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
  const next: CallHandler = { handle: () => of({ privateData: true }) };
  return { interceptor, context, next, query };
}

describe("Staff emergency near-response revalidation", () => {
  it("permits an active user and looks up the bearer identity once", async () => {
    const test = scenario();
    await expect(
      lastValueFrom(test.interceptor.intercept(test.context, test.next)),
    ).resolves.toEqual({ privateData: true });
    expect(test.query).toHaveBeenCalledOnce();
    expect(test.query).toHaveBeenCalledWith(
      expect.stringContaining("staff_auth_lock_current_session"),
      [null, null, bearer.slice("Bearer ".length), null, "SHARED"],
    );
  });

  it("also checks case-insensitive Staff GET routes", async () => {
    const test = scenario({ path: "/V1/STAFF/dashboard/organizations" });
    test.query.mockResolvedValue({ rows: [] });
    await expect(
      lastValueFrom(test.interceptor.intercept(test.context, test.next)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(test.query).toHaveBeenCalledOnce();
  });

  it("suppresses the pending protected body after security disable", async () => {
    const test = scenario();
    test.query.mockResolvedValue({ rows: [] });
    await expect(
      lastValueFrom(test.interceptor.intercept(test.context, test.next)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(test.query).toHaveBeenCalledOnce();
  });

  it("fails closed if a refresh rotated the bearer before serialization", async () => {
    const test = scenario();
    test.query.mockResolvedValue({ rows: [] });
    await expect(
      lastValueFrom(test.interceptor.intercept(test.context, test.next)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("fails closed when the recheck cannot query PostgreSQL", async () => {
    const test = scenario();
    test.query.mockRejectedValue(new Error("unavailable"));
    await expect(
      lastValueFrom(test.interceptor.intercept(test.context, test.next)),
    ).rejects.toThrow("unavailable");
  });

  it("does not change writes, non-staff routes, bad credentials or started streams", async () => {
    for (const options of [
      { method: "POST" },
      { path: "/v1/guest/sessions" },
      { headersSent: true },
      { authorization: "bad" },
    ]) {
      const test = scenario(options);
      await expect(
        lastValueFrom(test.interceptor.intercept(test.context, test.next)),
      ).resolves.toEqual({ privateData: true });
      expect(test.query).not.toHaveBeenCalled();
    }
  });
});
