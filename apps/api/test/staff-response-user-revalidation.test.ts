import {
  UnauthorizedException,
  type CallHandler,
  type ExecutionContext,
} from "@nestjs/common";
import { lastValueFrom, of } from "rxjs";
import { describe, expect, it, vi } from "vitest";

import type { PostgresPool } from "../src/common/database/postgres";
import { staffCredentialHash } from "../src/modules/auth/staff-auth-credential";
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
  const query = vi.fn().mockResolvedValue({ rows: [{ status: "ACTIVE" }] });
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
      expect.stringContaining("FROM staff_auth_sessions"),
      [staffCredentialHash("access", bearer.slice("Bearer ".length))],
    );
  });

  it("also checks case-insensitive Staff GET routes", async () => {
    const test = scenario({ path: "/V1/STAFF/dashboard/organizations" });
    test.query.mockResolvedValue({ rows: [{ status: "DISABLED" }] });
    await expect(
      lastValueFrom(test.interceptor.intercept(test.context, test.next)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(test.query).toHaveBeenCalledOnce();
  });

  it("suppresses the pending protected body after security disable", async () => {
    const test = scenario();
    test.query.mockResolvedValue({ rows: [{ status: "DISABLED" }] });
    await expect(
      lastValueFrom(test.interceptor.intercept(test.context, test.next)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(test.query).toHaveBeenCalledOnce();
  });

  it("allows an already-authorized response if a refresh rotated its token", async () => {
    const test = scenario();
    test.query.mockResolvedValue({ rows: [] });
    await expect(
      lastValueFrom(test.interceptor.intercept(test.context, test.next)),
    ).resolves.toEqual({ privateData: true });
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
