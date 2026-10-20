// Source-level W13 authentic Staff login + MFA protocol tests.
// The request function below is a deterministic mock: these cases do NOT
// authenticate with PostgreSQL/HTTP or establish Owner-signed acceptance.
import assert from "node:assert/strict";
import { test } from "node:test";
import { loginActualMfa } from "./issue300-w13-signed-http.mjs";
import { generateCurrentTotp } from "./issue300-w13-totp.mjs";

const secret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
const account = Object.freeze({
  email: "task-only@example.test", password: "not-a-real-account-password",
});
const token = "vsa1." + "A".repeat(43);
const sessionId = "c0000000-0000-4000-8000-000000000018";
const factorId = "d0000000-0000-4000-8000-000000000018";

function ordinaryReplies({ stepUpStatus = 200, beginStatus = 200,
  confirmStatus = 200, loginStatus = 200 } = {}) {
  const calls = [];
  const request = async (path, bearer, body) => {
    calls.push({ path, bearer, body });
    if (path === "/v1/staff/auth/login") {
      assert.equal(bearer, null);
      assert.deepEqual(body, account);
      return { status: loginStatus, json: { accessToken: token }, sessionId };
    }
    assert.equal(bearer, token, "MFA must use the newly issued Staff token");
    if (path === "/v1/staff/auth/mfa/step-up") {
      assert.match(body.code, /^\d{6}$/);
      assert.equal(body.code, generateCurrentTotp(secret));
      return { status: stepUpStatus, json: { state: "ASSURED" } };
    }
    if (path === "/v1/staff/auth/mfa/enrollment/begin") {
      assert.deepEqual(body, {});
      return { status: beginStatus, json: {
        factorId, provisioning: { secretBase32: secret },
      } };
    }
    if (path === "/v1/staff/auth/mfa/enrollment/confirm") {
      assert.equal(body.factorId, factorId);
      assert.match(body.code, /^\d{6}$/);
      assert.equal(body.code, generateCurrentTotp(secret));
      return { status: confirmStatus, json: { recoveryCodes: [] } };
    }
    assert.fail("Unexpected or unsafe Staff API call: " + path);
  };
  return { request, calls };
}

test("ordinary existing-factor login must use real current TOTP step-up request", async () => {
  const { request, calls } = ordinaryReplies();
  assert.deepEqual(await loginActualMfa(request, {
    ...account, mfaSecretBase32: secret,
  }), { token, sessionId });
  assert.deepEqual(calls.map(x => x.path), [
    "/v1/staff/auth/login", "/v1/staff/auth/mfa/step-up",
  ]);
});

test("fresh first-factor enrollment requires genuine begin and current TOTP confirm", async () => {
  const { request, calls } = ordinaryReplies();
  assert.deepEqual(await loginActualMfa(request, {
    ...account, freshEnrollment: true,
  }), { token, sessionId });
  assert.deepEqual(calls.map(x => x.path), [
    "/v1/staff/auth/login", "/v1/staff/auth/mfa/enrollment/begin",
    "/v1/staff/auth/mfa/enrollment/confirm",
  ]);
});

test("unapproved enrollment is rejected before MFA factor creation", async () => {
  const { request, calls } = ordinaryReplies();
  await assert.rejects(loginActualMfa(request, account),
    /MFA enrollment is allowed for isolated fresh accounts only/);
  assert.deepEqual(calls.map(x => x.path), ["/v1/staff/auth/login"]);
});

for (const [mode, statuses, accountPatch, failure] of [
  ["bad-login", { loginStatus: 401 }, { mfaSecretBase32: secret },
    /Actual Argon2 Staff login failed/],
  ["failed-step-up", { stepUpStatus: 401 }, { mfaSecretBase32: secret },
    /Current Staff session MFA step-up failed/],
  ["failed-enrollment", { beginStatus: 503 }, { freshEnrollment: true },
    /Real MFA enrollment failed/],
  ["failed-confirmation", { confirmStatus: 400 }, { freshEnrollment: true },
    /Actual TOTP enrollment confirmation failed/],
]) {
  test(mode + " must not produce Staff assurance success", async () => {
    const { request } = ordinaryReplies(statuses);
    await assert.rejects(loginActualMfa(request, { ...account, ...accountPatch }),
      failure);
  });
}
