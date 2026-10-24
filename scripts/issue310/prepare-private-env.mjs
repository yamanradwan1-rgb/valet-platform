import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const privateDir = join(projectRoot, "tmp", "wa310-runtime");
const target = join(privateDir, "compose.env");
if (existsSync(target)) {
  console.log("Issue310 isolated credentials already exist; no values overwritten.");
  process.exit(0);
}

mkdirSync(privateDir, { recursive: true, mode: 0o700 });
const secret = () => randomBytes(36).toString("base64url");
const entries = {
  WA310_BOOTSTRAP_PASSWORD: secret(),
  WA310_MIGRATION_PASSWORD: secret(),
  WA310_API_PASSWORD: secret(),
  WA310_SENDER_PASSWORD: secret(),
  WA310_WEBHOOK_PASSWORD: secret(),
  WA310_MINIO_USER: `wa310${randomBytes(9).toString("hex")}`,
  WA310_MINIO_PASSWORD: secret(),
};
writeFileSync(target,
  Object.entries(entries).map(([name, value]) => `${name}=${value}`).join("\n") + "\n",
  { encoding: "utf8", flag: "wx", mode: 0o600 });
console.log("Created dedicated Issue310 private Compose credentials (values withheld).");
