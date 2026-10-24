import { createHmac } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

const root = process.env.WA310_PRIVATE_RUNTIME_DIR;
const operation = process.argv[2];
if (!root || basename(resolve(root)) !== "wa310-runtime" ||
    basename(dirname(resolve(root))) !== "tmp" ||
    !["--record-owner-approved-consent", "--prepare-disabled-policies",
      "--activate-verified-policy"].includes(operation)) {
  throw new Error("Expected Issue310 runtime and a specific authenticated onboarding mode.");
}

const operator = JSON.parse(readFileSync(resolve(root, "operator-private.json"), "utf8"));
const organizationId = "5072955f-f323-448f-8d7d-bd0d3e6bd0b4";
if (operator.organization !== organizationId ||
    !operator.admin?.email || !operator.admin?.password) {
  throw new Error("Issue310 Company Admin inventory is unavailable.");
}

const base = "http://127.0.0.1:33110";
const origin = "http://127.0.0.1:33113";
let accessToken;
async function api(method, path, body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      origin,
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    throw new Error(`Authenticated Issue310 API ${method} ${path} failed with HTTP ${response.status}.`);
  }
  return response.json();
}

function totp(secret) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let accumulator = 0;
  let bits = 0;
  const decoded = [];
  for (const char of secret) {
    const digit = alphabet.indexOf(char);
    if (digit < 0) throw new Error("Invalid protected MFA seed format.");
    accumulator = (accumulator << 5) | digit;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      decoded.push((accumulator >>> bits) & 255);
    }
  }
  const time = Buffer.alloc(8);
  time.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const hmac = createHmac("sha1", Buffer.from(decoded)).update(time).digest();
  const offset = hmac[hmac.length - 1] & 15;
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

const login = await api("POST", "/v1/staff/auth/login", operator.admin);
if (!/^vsa1\.[A-Za-z0-9_-]{43}$/.test(login.accessToken ?? "")) {
  throw new Error("Issue310 Company Admin login did not return a valid scoped access token.");
}
accessToken = login.accessToken;
console.log("Company Admin login: PASS (token hidden)");

const mfaFile = resolve(root, "admin-mfa-operator-private.json");
let mfa;
if (!existsSync(mfaFile)) {
  const started = await api("POST", "/v1/staff/auth/mfa/enrollment/begin", {});
  if (!started.factorId || !/^[A-Z2-7]{32}$/.test(started.provisioning?.secretBase32 ?? "")) {
    throw new Error("MFA self-enrollment returned invalid provisioning material.");
  }
  mfa = { factorId: started.factorId, secretBase32: started.provisioning.secretBase32 };
  writeFileSync(mfaFile, JSON.stringify(mfa), { flag: "wx", mode: 0o600 });
  const confirmed = await api("POST", "/v1/staff/auth/mfa/enrollment/confirm", {
    factorId: mfa.factorId,
    code: totp(mfa.secretBase32),
  });
  if (!Array.isArray(confirmed.recoveryCodes) || confirmed.recoveryCodes.length !== 10) {
    throw new Error("MFA enrollment lacks recovery material.");
  }
  writeFileSync(mfaFile, JSON.stringify({ ...mfa, recoveryCodes: confirmed.recoveryCodes }),
    { mode: 0o600 });
  console.log("Company Admin MFA enrollment and assurance: PASS (material private)");
} else {
  mfa = JSON.parse(readFileSync(mfaFile, "utf8"));
  const result = await api("POST", "/v1/staff/auth/mfa/step-up", {
    code: totp(mfa.secretBase32),
  });
  if (result.state !== "ASSURED") throw new Error("MFA step-up was not confirmed.");
  console.log("Company Admin MFA step-up: PASS");
}

const prefix = `/v1/staff/management/organizations/${organizationId}`;
if (operation !== "--record-owner-approved-consent") {
  const company = await api("GET", `${prefix}/whatsapp-settings`);
  const locationId = "ac34adc7-1d76-42cb-af29-fef22feaa909";
  if (company.organizationId !== organizationId || company.globalSendEnabled !== false) {
    throw new Error("The isolated company policy does not have a safe disabled send state.");
  }
  const locationPath = `${prefix}/locations/${locationId}/whatsapp-settings`;
  const location = await api("GET", locationPath);
  if (location.locationId !== locationId || location.globalSendEnabled !== false) {
    throw new Error("The requested Location is outside the disabled Issue310 scope.");
  }
  const activate = operation === "--activate-verified-policy";
  const version = "meta_guest_access_20261024";
  const verified = company.connections.find((binding) =>
    binding.wabaId === "3491682417667249" && binding.phoneNumberId === "1426684017189271"
      && binding.status === "VERIFIED");
  if (activate && (!verified || !company.approvedTemplateVersions.includes(version))) {
    throw new Error("The test binding and approved catalog must be verified before enabling policies.");
  }
  const desiredCompany = {
    enabled: activate,
    language: "en",
    templateCatalogVersion: version,
    providerBindingId: activate ? verified.id : null,
  };
  const desiredLocation = {
    enabled: activate,
    language: null,
    templateCatalogVersion: null,
    providerBindingId: null,
  };
  for (const [path, previous, desired] of [
    [`${prefix}/whatsapp-settings`, company.policy, desiredCompany],
    [locationPath, location.policy, desiredLocation],
  ]) {
    if (!previous || !Number.isInteger(previous.revision)) {
      throw new Error("The authenticated policy response lacks an expected revision.");
    }
    if (Object.entries(desired).every(([key, value]) => previous[key] === value)) {
      console.log("Exact test policy already matches requested state.");
      continue;
    }
    if (!activate && previous.revision !== 0) {
      throw new Error("Refusing to overwrite a preexisting, non-default policy revision.");
    }
    await api("PUT", path, {
      ...desired,
      revision: previous.revision,
      expectedRevision: previous.revision,
    });
    console.log(`Authenticated test policy: ${activate ? "ENABLED" : "DISABLED"}`);
  }
  process.exit(0);
}

const binding = await api("POST", `${prefix}/whatsapp-sandbox-binding-request`, {
  requestPendingSandboxBinding: true,
});
if (binding.status !== "PENDING_META_VERIFICATION") {
  throw new Error("Provider onboarding unexpectedly bypassed independent Meta verification.");
}
console.log(`Meta binding request: ${binding.status}; ID ${binding.bindingId}`);

const consent = await api("POST", `${prefix}/whatsapp-test-recipient-consent`, {
  action: "GRANT",
  evidenceReference: "wa310-opt-in-owner-explicit-20261024",
  expectedRevision: 0,
  explicitOwnerConfirmation: true,
});
if (consent.status !== "GRANTED" || consent.revision !== 1) {
  throw new Error("The authenticated consent change was not committed.");
}
console.log(`Audited VAYLET recipient consent: ${consent.status}; revision ${consent.revision}`);
