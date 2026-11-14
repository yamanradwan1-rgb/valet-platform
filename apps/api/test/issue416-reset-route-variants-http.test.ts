import "reflect-metadata";

import { Module, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
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

const path = "/v1/staff/auth/password-resets/redeem";
const origin = "https://reset.example";
const r03 = new Issue416R03PrivateAttemptAdmission();
const clientAttempts = vi.spyOn(r03, "countClientBeforeBodyParser");
const credentialAttempts = vi.spyOn(r03, "countCanonicalCredential");
const ingress = new Issue416PasswordResetIngress(r03);
const origins = { allows: (value: string | undefined) => value === origin };
const service = new Issue416PasswordResetRedeemService(
  ingress,
  origins as never,
  r03,
);
const runner = new ApiOperationRunner(
  { now: () => Date.now() } as never,
  { observe: async () => undefined } as never,
);

@Module({
  controllers: [Issue416PasswordResetRedeemController],
  providers: [
    { provide: ApiOperationRunner, useValue: runner },
    { provide: Issue416PasswordResetRedeemService, useValue: service },
  ],
})
class RouteVariantsOnlyFixture {}

let app: INestApplication;
let baseUrl: string;

beforeAll(async () => {
  // Test-only: this middleware MUST run before the Nest JSON body parser.
  app = await NestFactory.create(RouteVariantsOnlyFixture, { logger: false });
  // Express .use(path) matches descendants too; .post(path) has the same
  // exact, case-insensitive/optional-trailing-slash dispatch as Nest's POST.
  const expressApp = app.getHttpAdapter().getInstance() as {
    post(
      route: string,
      middleware: ReturnType<typeof issue416ResetRedeemPreParser>,
    ): void;
  };
  expressApp.post(path, issue416ResetRedeemPreParser(ingress));
  await app.listen(0, "127.0.0.1");
  baseUrl = await app.getUrl();
}, 20_000);

afterAll(async () => {
  await app?.close();
});

beforeEach(() => {
  clientAttempts.mockClear();
  credentialAttempts.mockClear();
});

function request(urlPath: string, body: string, method = "POST") {
  return fetch(baseUrl + urlPath, {
    method,
    headers: { origin, "content-type": "application/json" },
    ...(method === "POST" ? { body } : {}),
  });
}

describe("Issue416 TEST-ONLY exact pre-parser route versus actual Nest dispatch", () => {
  it.each([
    path,
    path + "/",
    "/V1/STAFF/AUTH/PASSWORD-RESETS/REDEEM",
    "/v1/staff/auth/password-resets/ReDeEm",
    // fetch normalizes this dot-segment URL into the accepted /redeem/ path.
    path + "/%2e",
  ])(
    "fails closed before malformed JSON parser on every Nest path: %s",
    async (variant) => {
      const response = await request(variant, '{"resetToken":');
      expect(response.status).toBe(503);
      expect(clientAttempts).toHaveBeenCalledTimes(1);
      expect(credentialAttempts).not.toHaveBeenCalled();
    },
  );

  it.each([path, path + "/", "/V1/STAFF/AUTH/PASSWORD-RESETS/REDEEM"])(
    "denies invalid bearer before unverified IP accounting: %s",
    async (variant) => {
      const response = await request(
        variant,
        JSON.stringify({
          resetToken: "vspr1.invalid",
          newPassword: "Str0ng-New-Password!",
        }),
      );
      expect(response.status).toBe(503);
      const body = (await response.json()) as { code: string };
      expect(body.code).toBe("STAFF_PASSWORD_RESET_UNAVAILABLE");
      expect(JSON.stringify(body)).not.toContain("Str0ng-New-Password!");
      expect(clientAttempts).toHaveBeenCalledTimes(1);
      expect(credentialAttempts).not.toHaveBeenCalled();
    },
  );

  it.each([
    path + "/child",
    path + "//",
    path + "/%2Fchild",
    path + "-extra",
    "/v1/staff/auth/password-resets/redeeming",
  ])(
    "never spends public quota for a path Nest does not dispatch: %s",
    async (variant) => {
      const response = await request(
        variant,
        JSON.stringify({ resetToken: "vspr1.invalid" }),
      );
      expect(response.status).toBe(404);
      expect(clientAttempts).not.toHaveBeenCalled();
      const malformed = await request(variant, '{"resetToken":');
      // Nest's global JSON parser may reject a malformed body even on a 404.
      expect([400, 404]).toContain(malformed.status);
      expect(clientAttempts).not.toHaveBeenCalled();
    },
  );

  it("does not spend POST quota on GET or sibling paths", async () => {
    const response = await request(path, "", "GET");
    expect(response.status).toBe(404);
    expect(clientAttempts).not.toHaveBeenCalled();
  });

  it("denies correct path with query before JSON validation", async () => {
    const response = await request(path + "?ignored=true", '{"resetToken":');
    expect(response.status).toBe(503);
    expect(clientAttempts).toHaveBeenCalledTimes(1);
  });
});
