/**
 * U1 operator INPUT-FORMAT precheck only — not custody, activation, or a signer.
 * This module deliberately never reads process.env, a database or a secret
 * manager, never exports a key, and never computes a MAC. Successful validation
 * does NOT establish independently secured key injection, a committed live SQL
 * key epoch or a protected PostgreSQL verifier.
 *
 * Restrict the offline boundary to one unambiguous serialization: exact
 * JSON.stringify([{ keyId, audience, keyB64url }, ...]) output. Refusing
 * alternate JSON encodings (including duplicate object keys) prevents an
 * operator/auditor from approving different interpretations of key material.
 * The separate deployment process must still independently attest U1 custody.
 */
export class Vap1OfflineKeyringInvalid extends Error {
  constructor() {
    super("VAP1 offline keyring format is invalid.");
    this.name = "Vap1OfflineKeyringInvalid";
  }
}

const KEY_ID = /^[A-Za-z][A-Za-z0-9._:-]{0,63}$/;
const AUDIENCE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/;
const ROOT = /^[A-Za-z0-9_-]{43}$/;
const ENTRY_KEYS = ["keyId", "audience", "keyB64url"] as const;

function exact(pattern: RegExp, value: unknown): value is string {
  return typeof value === "string" && pattern.exec(value)?.[0] === value;
}

function assertOfflineEnvelope(
  serialized: unknown,
  expectedAudience: unknown,
): void {
  if (
    typeof serialized !== "string" ||
    serialized.length > 1024 ||
    !exact(AUDIENCE, expectedAudience)
  ) {
    throw new Vap1OfflineKeyringInvalid();
  }
  const entries: unknown = JSON.parse(serialized);
  if (
    !Array.isArray(entries) ||
    entries.length < 1 ||
    entries.length > 2 ||
    JSON.stringify(entries) !== serialized
  ) {
    throw new Vap1OfflineKeyringInvalid();
  }
  const seen = new Set<string>();
  const seenRoots = new Set<string>();
  for (const value of entries as unknown[]) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new Vap1OfflineKeyringInvalid();
    }
    const entry = value as Record<string, unknown>;
    const fields = Object.keys(entry);
    if (
      fields.length !== ENTRY_KEYS.length ||
      fields.some((name, index) => name !== ENTRY_KEYS[index]) ||
      !exact(KEY_ID, entry.keyId) ||
      entry.audience !== expectedAudience ||
      !exact(ROOT, entry.keyB64url) ||
      seen.has(entry.keyId) ||
      seenRoots.has(entry.keyB64url)
    ) {
      throw new Vap1OfflineKeyringInvalid();
    }
    seen.add(entry.keyId);
    seenRoots.add(entry.keyB64url);
    // Check byte length and canonical, unpadded base64url; release immediately.
    const bytes = Buffer.from(entry.keyB64url, "base64url");
    try {
      if (
        bytes.length !== 32 ||
        bytes.toString("base64url") !== entry.keyB64url ||
        // A known-zero test vector is not an independently generated 256-bit
        // secret. This is only a weak-value denial, NOT an entropy attestation.
        bytes.every((value) => value === 0)
      ) {
        throw new Vap1OfflineKeyringInvalid();
      }
    } finally {
      bytes.fill(0);
    }
  }
}

/** Return only undefined; never return a key or a "ready to sign" token. */
export function validateVap1OfflineKeyringFormat(
  serialized: unknown,
  independentlySelectedAudience: unknown,
): void {
  try {
    assertOfflineEnvelope(serialized, independentlySelectedAudience);
  } catch {
    throw new Vap1OfflineKeyringInvalid();
  }
}
