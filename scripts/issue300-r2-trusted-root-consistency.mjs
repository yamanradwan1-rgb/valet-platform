// Pure source-only consistency guard; never creates, loads, or signs with an
// Owner private key. A consistent pin is NOT proof of Owner authorization.
import assert from "node:assert/strict";
import { createHash, createPublicKey } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const spkiPattern = /MCowBQYDK2VwAyEA[A-Za-z0-9+/]{43}=/g;

export const mandatoryOwnerPinSources = Object.freeze([
  "apps/api/src/modules/management/audit-investigation/audit-investigation-u05-proof-attestation.ts",
  "scripts/issue300-r2-browser-live-preflight.mjs",
  "scripts/issue300-r2-browser-target-issuer.mjs",
  "scripts/issue300-r2-owner-build-issuer.mjs",
  "scripts/issue300-r2-owner-build-signature.mjs",
  "scripts/issue300-w13-owned-files.mjs",
  "scripts/issue300-w8-owner-root.mjs",
  "scripts/issue300-r2-browser-live-preflight.test.mjs",
]);
export const v3IgnoredPinSource =
  "tmp/issue300-r2-w6-v3-owned/v3-acceptance.mjs";

export function assertConsistentPinText(sources) {
  assert(Array.isArray(sources) && sources.length >= 2,
    "OWNER_PIN_SOURCES_REQUIRED");
  const pins = sources.map(({ name, text }) => {
    assert(typeof name === "string" && typeof text === "string");
    const found = text.match(spkiPattern) ?? [];
    assert.equal(found.length, 1, `OWNER_PIN_MISSING_OR_DUPLICATE:${name}`);
    const encoded = found[0];
    const der = Buffer.from(encoded, "base64");
    assert.equal(der.toString("base64"), encoded,
      `OWNER_PIN_INVALID_BASE64:${name}`);
    const publicKey = createPublicKey({ key: der, format: "der", type: "spki" });
    assert.equal(publicKey.asymmetricKeyType, "ed25519", "OWNER_PIN_NOT_ED25519");
    return { encoded, der };
  });
  assert(pins.every(({ encoded }) => encoded === pins[0].encoded),
    "OWNER_PIN_IDENTITY_MISMATCH");
  return Object.freeze({
    sourceCount: sources.length,
    spkiSha256: createHash("sha256").update(pins[0].der).digest("hex"),
  });
}

export function verifySourceOwnerPins(root = repoRoot, { requireV3 = false } = {}) {
  const sources = mandatoryOwnerPinSources.map(name => ({
    name, text: readFileSync(join(root, name), "utf8"),
  }));
  const v3File = join(root, v3IgnoredPinSource);
  assert(!requireV3 || existsSync(v3File), "OWNER_PIN_V3_SOURCE_MISSING");
  if (existsSync(v3File))
    sources.push({ name: v3IgnoredPinSource, text: readFileSync(v3File, "utf8") });
  return assertConsistentPinText(sources);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.deepEqual(process.argv.slice(2), ["--verify"], "OWNER_PIN_EXACT_MODE");
  const result = verifySourceOwnerPins(repoRoot, { requireV3: true });
  console.log(`OWNER_PIN_SOURCE_CONSISTENT count=${result.sourceCount} sha256=${result.spkiSha256}`);
}
