import { createHmac, randomUUID } from "node:crypto";

import type { AntiAbuseKey } from "./anti-abuse-key";

export interface S04Proof {
  readonly nonce: string;
  readonly expiresMs: number;
  readonly mac: string;
}

type S04GuestClass = "A" | "B" | "C" | "D";

function proofKey(): Buffer {
  const raw = process.env.ANTI_ABUSE_SQL_PROOF_SECRET_B64URL;
  if (!raw || !/^[A-Za-z0-9_-]{43}$/.test(raw)) {
    throw new Error("ANTI_ABUSE_SQL_PROOF_SECRET_B64URL must be 32 bytes.");
  }
  const key = Buffer.from(raw, "base64url");
  if (key.length !== 32 || key.toString("base64url") !== raw) {
    throw new Error("ANTI_ABUSE_SQL_PROOF_SECRET_B64URL must be 32 bytes.");
  }
  if (raw === process.env.ANTI_ABUSE_HMAC_SECRET_B64URL) {
    throw new Error("Anti-abuse counter proof and identity keys must differ.");
  }
  return key;
}

function signAction(action: string, argumentsText: string): S04Proof {
  const nonce = randomUUID();
  const expiresMs = Date.now() + 15000;
  const mac = createHmac("sha256", proofKey())
    .update(`s04-v1|${action}|${argumentsText}|${nonce}|${expiresMs}`, "utf8")
    .digest("hex");
  return { nonce, expiresMs, mac };
}

// No generic public sign(message) method. Each issued proof fixes an exact
// SQL command and its argument shape, including the one-time nonce.
export function signS04Counted(key: AntiAbuseKey): S04Proof {
  return signAction("COUNTED", `${key.scope}|${key.keyHash}`);
}

export function signS04Reservation(key: AntiAbuseKey): S04Proof {
  return signAction("PENDING", `${key.scope}|${key.keyHash}`);
}

export function signS04Finalize(
  id: string,
  key: AntiAbuseKey,
  state: "COUNTED" | "IGNORED",
): S04Proof {
  return signAction("FINALIZE", `${id}|${key.scope}|${key.keyHash}|${state}`);
}

export function signS04GuestClassified(
  key: AntiAbuseKey,
  group: AntiAbuseKey,
  requestClass: S04GuestClass,
  classLimit: number,
  aggregate: number,
  credential: number,
): S04Proof {
  return signAction(
    "GUEST",
    [
      key.keyHash, group.keyHash, requestClass, classLimit, aggregate, credential,
      group.lockHigh, group.lockLow, key.lockHigh, key.lockLow,
    ].join("|"),
  );
}
