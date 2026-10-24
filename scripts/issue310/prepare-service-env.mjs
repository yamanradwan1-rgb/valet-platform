import { generateKeyPairSync, randomBytes } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const privateDir = join(root, "tmp", "wa310-runtime");
const credentials = Object.fromEntries(readFileSync(join(privateDir, "compose.env"), "utf8")
  .trim().split("\n").map((row) => {
    const at = row.indexOf("=");
    return [row.slice(0, at), row.slice(at + 1).trim()];
  }));
const files = ["api.env", "sender.env", "transport-public.pem", "transport-private.pem"];
if (files.some((name) => existsSync(join(privateDir, name)))) {
  if (!files.every((name) => existsSync(join(privateDir, name)))) {
    throw new Error("Incomplete Issue310 service secrets; do not overwrite key material.");
  }
  const apiPath = join(privateDir, "api.env");
  if (!/^ANTI_ABUSE_HMAC_SECRET_B64URL=/m.test(readFileSync(apiPath, "utf8"))) {
    appendFileSync(apiPath,
      `ANTI_ABUSE_HMAC_SECRET_B64URL=${randomBytes(32).toString("base64url")}\n`,
      { encoding: "utf8", mode: 0o600 });
    console.log("Installed previously missing isolated API anti-abuse key; value withheld.");
  }
  console.log("Issue310 service secrets already exist; material preserved.");
  process.exit(0);
}
const keys = generateKeyPairSync("rsa", {
  modulusLength: 3072,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
const digest = randomBytes(32).toString("base64");
const shared = {
  GUEST_ACCESS_TRANSPORT_KEY_VERSION: "wa310-rsa-v1",
  OUTBOUND_RECIPIENT_HMAC_KEY_BASE64: digest,
  OUTBOUND_RECIPIENT_HMAC_KEY_VERSION: "v1",
  OUTBOUND_MESSAGING_MODE: "test",
  OUTBOUND_MESSAGING_SEND_ENABLED: "false",
  GUEST_ACCESS_AUTO_ISSUE_ENABLED: "false",
  OUTBOUND_META_SANDBOX_ACTIVATION_ENABLED: "false",
  OUTBOUND_META_TEST_DATABASE_NAME: "vaylet_wa310",
  VAYLET_ALLOW_DEMO_SEED: "false",
};
const url = (name) => `postgresql://wa310_${name}:${credentials[`WA310_${name.toUpperCase()}_PASSWORD`]}@postgres:5432/vaylet_wa310`;
const api = {
  ...shared,
  NODE_ENV: "test",
  PORT: "3001",
  DATABASE_URL: url("api"),
  ANTI_ABUSE_HMAC_SECRET_B64URL: randomBytes(32).toString("base64url"),
  CONDITION_PHOTO_STORAGE_ENABLED: "false",
};
const sender = {
  ...shared,
  NODE_ENV: "test",
  OUTBOUND_MESSAGING_WORKER_DATABASE_URL: url("sender"),
  META_WHATSAPP_GRAPH_VERSION: "v26.0",
  META_WHATSAPP_TEST_TOKEN_REVOKED: "true",
};
const saveEnv = (filename, entries) => writeFileSync(join(privateDir, filename),
  Object.entries(entries).map(([key, value]) => `${key}=${value}`).join("\n") + "\n",
  { encoding: "utf8", flag: "wx", mode: 0o600 });
writeFileSync(join(privateDir, "transport-public.pem"), keys.publicKey,
  { flag: "wx", mode: 0o600 });
writeFileSync(join(privateDir, "transport-private.pem"), keys.privateKey,
  { flag: "wx", mode: 0o600 });
saveEnv("api.env", api);
saveEnv("sender.env", sender);
console.log("Created separate Issue310 API/sender runtime files and 3072-bit transport keys; secrets withheld.");
