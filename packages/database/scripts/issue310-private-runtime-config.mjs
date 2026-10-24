import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

const root = process.env.WA310_PRIVATE_RUNTIME_DIR;
const handoffFile = process.env.WA310_META_HANDOFF_PATH;
if (!root || basename(resolve(root)) !== "wa310-runtime" ||
    basename(dirname(resolve(root))) !== "tmp" || !handoffFile) {
  throw new Error("Provide the existing Issue310 private runtime and Meta handoff paths.");
}

const operator = JSON.parse(readFileSync(resolve(root, "operator-private.json"), "utf8"));
const organizationId = "5072955f-f323-448f-8d7d-bd0d3e6bd0b4";
const locationId = "ac34adc7-1d76-42cb-af29-fef22feaa909";
if (operator.organization !== organizationId || operator.location !== locationId) {
  throw new Error("Issue310 operator scope does not match the approved test tenant.");
}

const evidence = readFileSync(resolve(handoffFile), "utf8");
const matchingLines = evidence.split(/\r?\n/)
  .filter((line) => line.includes("testRecipientAllowlist"));
const recipients = [...new Set(matchingLines.flatMap((line) =>
  [...line.matchAll(/\+[1-9][0-9]{7,14}/g)].map((match) => match[0])))];
if (recipients.length !== 1) {
  throw new Error("The approved Meta handoff must identify exactly one test recipient.");
}

const origin = "https://vaylet-wa310-customer.taild797f4.ts.net";
const catalogVersion = "meta_guest_access_20261024";
const approvedTemplates = JSON.stringify(["ar", "en"].map((locale) => ({
  organizationId,
  wabaId: "3491682417667249",
  catalogVersion,
  locale,
})));

function configure(filename, entries) {
  const path = resolve(root, filename);
  const current = readFileSync(path, "utf8");
  const rows = current.trimEnd().split(/\r?\n/);
  const seen = new Set();
  for (const row of rows) {
    const separator = row.indexOf("=");
    if (separator < 1) throw new Error("Unexpected private Issue310 environment format.");
    const key = row.slice(0, separator);
    if (seen.has(key)) throw new Error("Duplicate private Issue310 environment key.");
    seen.add(key);
    if (key in entries && row.slice(separator + 1) !== entries[key]) {
      throw new Error(`Existing ${filename} has a conflicting ${key}; inspect it privately.`);
    }
  }
  const additions = Object.entries(entries)
    .filter(([key]) => !seen.has(key))
    .map(([key, value]) => `${key}=${value}`);
  if (additions.length > 0) {
    writeFileSync(path, `${rows.join("\r\n")}\r\n${additions.join("\r\n")}\r\n`,
      { encoding: "utf8" });
  }
  console.log(`${filename}: ${additions.length} Issue310-only settings added (values hidden).`);
}

configure("api.env", {
  OUTBOUND_META_TEST_ORGANIZATION_ID: organizationId,
  OUTBOUND_META_TEST_RECIPIENT_E164: recipients[0],
  OUTBOUND_APPROVED_META_TEMPLATES_JSON: approvedTemplates,
  GUEST_AUTH_ALLOWED_ORIGINS: origin,
  STAFF_AUTH_ALLOWED_ORIGINS: "http://localhost:33113,http://127.0.0.1:33113",
});
configure("sender.env", {
  OUTBOUND_META_TEST_ORGANIZATION_ID: organizationId,
  OUTBOUND_META_TEST_LOCATION_ID: locationId,
  OUTBOUND_META_TEST_RECIPIENT_E164: recipients[0],
  OUTBOUND_APPROVED_META_TEMPLATES_JSON: approvedTemplates,
  META_WHATSAPP_TEST_CONFIG_ALIAS: "wa310-meta-sandbox",
  GUEST_ACCESS_MESSAGE_ORIGIN: origin,
});

function ensureMfaSecret(key) {
  const path = resolve(root, "api.env");
  const current = readFileSync(path, "utf8");
  const found = current.split(/\r?\n/).filter((row) => row.startsWith(`${key}=`));
  if (found.length > 1 ||
      (found.length === 1 && !/^[A-Za-z0-9_-]{43}$/.test(found[0].slice(key.length + 1)))) {
    throw new Error(`The private ${key} must be a canonical 32-byte secret.`);
  }
  if (found.length === 0) {
    writeFileSync(path, `${current.trimEnd()}\r\n${key}=${randomBytes(32).toString("base64url")}\r\n`,
      "utf8");
    console.log(`${key}: generated inside private API-only runtime.`);
  }
}
ensureMfaSecret("MFA_TOTP_ENCRYPTION_KEY_B64URL");
ensureMfaSecret("MFA_RECOVERY_HMAC_SECRET_B64URL");
console.log(`Catalog: ${catalogVersion}; sender remains disabled.`);
