import "reflect-metadata";

import { Module, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { ApiOperationRunner } from "../src/common/http/api-operation-runner";
import { Issue416PasswordResetRedeemController } from "../src/modules/auth/issue416-password-reset-redeem.controller";
import { Issue416PasswordResetRedeemService } from "../src/modules/auth/issue416-password-reset-redeem.service";
import { Issue416PasswordResetIngress } from "../src/modules/auth/issue416-password-reset-redeem-ingress";
import { issue416ResetRedeemPreParser } from "../src/modules/auth/issue416-password-reset-redeem-preparser";
import { Issue416R03PrivateAttemptAdmission } from "../src/modules/auth/issue416-r03-private-attempt-admission";
import { generateStaffPasswordResetToken } from "../src/modules/auth/staff-password-reset-credential";
import { StaffAuthOriginPolicy } from "../src/modules/auth/staff-auth.origin";
import { Issue416PasswordResetManagementController } from "../src/modules/management/issue416-password-reset.controller";
import { Issue416PasswordResetService } from "../src/modules/management/issue416-password-reset.service";

const org = randomUUID();
const member = randomUUID();
const token = generateStaffPasswordResetToken();
const adminPath = `/v1/staff/management/organizations/${org}/staff/${member}/password-resets`;
const publicPath = "/v1/staff/auth/password-resets/redeem";
const origin = "https://reset.example";
const operationId = randomUUID();
const authHeaders = { authorization: "Bearer synthetic", origin };
const validIssue = { operationId, expectedGeneration: 0 };
const validRedeem = { resetToken: token, newPassword: "Strong-Password-2026!" };

const sql = { query: vi.fn() };
const sessions = { resolve: vi.fn() };
const addresses = { resolve: vi.fn(() => "198.51.100.23") };
const forgedProtected = { status: vi.fn(), issue: vi.fn() };
const forgedRedeem = { redeem: vi.fn() };
const origins = { allows: (value: string | undefined) => value === origin };
const r03 = new Issue416R03PrivateAttemptAdmission();
const clientAttempts = vi.spyOn(r03, "countClientBeforeBodyParser");
const credentialAttempts = vi.spyOn(r03, "countCanonicalCredential");
const ingress = new Issue416PasswordResetIngress(r03);
const protectedService = new Issue416PasswordResetService(
  sql as never,
  sessions as never,
  addresses as never,
  forgedProtected as never,
);
const publicService = new Issue416PasswordResetRedeemService(
  ingress,
  origins as never,
  r03,
  forgedRedeem as never,
);
const runner = new ApiOperationRunner(
  { now: () => Date.now() } as never,
  { observe: async () => undefined } as never,
);

@Module({
  controllers: [
    Issue416PasswordResetManagementController,
    Issue416PasswordResetRedeemController,
  ],
  providers: [
    { provide: ApiOperationRunner, useValue: runner },
    { provide: StaffAuthOriginPolicy, useValue: origins },
    { provide: Issue416PasswordResetService, useValue: protectedService },
    { provide: Issue416PasswordResetRedeemService, useValue: publicService },
  ],
})
class DormantResetHttpFixture {}

let app: INestApplication;
let baseUrl: string;

beforeAll(async () => {
  // TEST-ONLY mount, deliberately not part of AuthModule or ManagementModule.
  app = await NestFactory.create(DormantResetHttpFixture, { logger: false });
  // Exact method-specific Express route, before Nest's JSON parser. app.use
  // would match /redeem/child too, wasting the 30-IP quota on wrong paths.
  const expressApp = app.getHttpAdapter().getInstance() as {
    post(
      route: string,
      middleware: ReturnType<typeof issue416ResetRedeemPreParser>,
    ): void;
  };
  expressApp.post(publicPath, issue416ResetRedeemPreParser(ingress));
  await app.listen(0, "127.0.0.1");
  baseUrl = await app.getUrl();
}, 20_000);

afterAll(async () => {
  await app?.close();
});

beforeEach(() => {
  clientAttempts.mockClear();
  credentialAttempts.mockClear();
  sql.query.mockClear();
  sessions.resolve.mockClear();
  forgedProtected.status.mockClear();
  forgedProtected.issue.mockClear();
  forgedRedeem.redeem.mockClear();
});

async function post(path: string, body: string, headers = authHeaders) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body,
  });
}

function noPrivilegedSql() {
  expect(sql.query).not.toHaveBeenCalled();
  expect(sessions.resolve).not.toHaveBeenCalled();
  expect(forgedProtected.issue).not.toHaveBeenCalled();
  expect(forgedProtected.status).not.toHaveBeenCalled();
  expect(forgedRedeem.redeem).not.toHaveBeenCalled();
}

describe("Issue416 TEST-ONLY mounted HTTP (SQL proof intentionally absent)", () => {
  it("is absent from production registration and pre-parser startup", () => {
    const root = resolve(process.cwd(), "src");
    expect(
      readFileSync(resolve(root, "modules/auth/auth.module.ts"), "utf8"),
    ).not.toContain("Issue416PasswordResetRedeemController");
    expect(
      readFileSync(
        resolve(root, "modules/management/management.module.ts"),
        "utf8",
      ),
    ).not.toContain("Issue416PasswordResetManagementController");
    expect(readFileSync(resolve(root, "main.ts"), "utf8")).not.toContain(
      "issue416ResetRedeemPreParser",
    );
  });

  it("does not spend public POST quota on a GET to the same route", async () => {
    const response = await fetch(`${baseUrl}${publicPath}`);
    expect(response.status).toBe(404);
    expect(clientAttempts).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated status read with 401 before service", async () => {
    const response = await fetch(`${baseUrl}${adminPath}/status`);
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    noPrivilegedSql();
  });

  it("blocks even a purported valid admin status with an injected fake writer", async () => {
    const response = await fetch(`${baseUrl}${adminPath}/status`, {
      headers: { authorization: "Bearer synthetic" },
    });
    expect(response.status).toBe(503);
    expect(((await response.json()) as { code: string }).code).toBe(
      "STAFF_PASSWORD_RESET_UNAVAILABLE",
    );
    noPrivilegedSql();
  });

  it("rejects foreign origin or invalid issue body without privilege", async () => {
    const blocked = await post(adminPath, JSON.stringify(validIssue), {
      ...authHeaders,
      origin: "https://evil.example",
    });
    expect(blocked.status).toBe(403);
    const malformed = await post(
      adminPath,
      JSON.stringify({ ...validIssue, extra: true }),
    );
    expect(malformed.status).toBe(400);
    noPrivilegedSql();
  });

  it("cannot issue a link even with valid schema and forged SQL boundary", async () => {
    const response = await post(adminPath, JSON.stringify(validIssue));
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).not.toContain("vspr1.");
    expect(body).not.toContain("resetLink");
    expect(response.headers.get("cache-control")).toBe("no-store");
    noPrivilegedSql();
  });

  it("fails closed before parsing malformed JSON when private R03 binder is unavailable", async () => {
    const response = await post(publicPath, '{"resetToken":');
    expect(response.status).toBe(503);
    expect(((await response.json()) as { code: string }).code).toBe(
      "STAFF_PASSWORD_RESET_UNAVAILABLE",
    );
    expect(clientAttempts).toHaveBeenCalledTimes(1);
    expect(credentialAttempts).not.toHaveBeenCalled();
    noPrivilegedSql();
  });

  it("rejects foreign Origin at pre-parser while trusted SQL is unavailable", async () => {
    const response = await post(publicPath, JSON.stringify(validRedeem), {
      ...authHeaders,
      origin: "https://evil.example",
    });
    expect(response.status).toBe(503);
    expect(clientAttempts).toHaveBeenCalledTimes(1);
    noPrivilegedSql();
  });

  it("never trusts forged redeem writer nor exposes token/password", async () => {
    const response = await post(publicPath, JSON.stringify(validRedeem));
    expect(response.status).toBe(503);
    expect(clientAttempts).toHaveBeenCalledTimes(1);
    expect(credentialAttempts).not.toHaveBeenCalled();
    const body = await response.text();
    expect(body).not.toContain(token);
    expect(body).not.toContain(validRedeem.newPassword);
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    noPrivilegedSql();
  });

  it("never claims a 429 count from mutable legacy anti-abuse tables", async () => {
    const response = await post(publicPath, '{"not":"valid json"');
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(((await response.json()) as { code: string }).code).toBe(
      "STAFF_PASSWORD_RESET_UNAVAILABLE",
    );
    expect(clientAttempts).toHaveBeenCalledTimes(1);
    noPrivilegedSql();
  });

  it("fails closed before consuming any credential without key custody", async () => {
    const response = await post(publicPath, JSON.stringify(validRedeem));
    expect(response.status).toBe(503);
    expect(((await response.json()) as { code: string }).code).toBe(
      "STAFF_PASSWORD_RESET_UNAVAILABLE",
    );
    expect(credentialAttempts).not.toHaveBeenCalled();
    expect(addresses.resolve).not.toHaveBeenCalled();
    noPrivilegedSql();
  });
});
