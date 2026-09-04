import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

const failureMessage =
  "Physical POC configuration invalid:\n" +
  "ANTI_ABUSE_HMAC_SECRET_B64URL must be configured in root .env.";

function isCanonicalAntiAbuseSecret(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) {
    return false;
  }

  const decoded = Buffer.from(value, "base64url");
  if (decoded.length !== 32) {
    return false;
  }

  return value.length === 43 && decoded.toString("base64url") === value;
}

function validateRootEnvironment(envPath) {
  try {
    const parsed = parseEnv(readFileSync(envPath, "utf8"));
    return isCanonicalAntiAbuseSecret(parsed.ANTI_ABUSE_HMAC_SECRET_B64URL);
  } catch {
    return false;
  }
}

const envPath = process.argv[2];
if (!envPath || !validateRootEnvironment(envPath)) {
  console.error(failureMessage);
  process.exitCode = 1;
}
