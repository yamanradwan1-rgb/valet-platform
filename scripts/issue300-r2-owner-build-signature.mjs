import assert from "node:assert/strict";
import { verify } from "node:crypto";

// Exact Owner Ed25519 SPKI already pinned in the U005 runtime proof gate.
// This module has no access to the Owner's private key.
export const ownerBuildPublicKey = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEApth1azlOHaJPPtirnSl5TB3UcAV/GOuWQeUFRx7wy/c=
-----END PUBLIC KEY-----`;

export function verifyBuildOwnerSignature(bytes, encoded, key = ownerBuildPublicKey) {
  assert(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= 8192,
    "BUILD_OWNER_BYTES_INVALID");
  assert(typeof encoded === "string" && /^[A-Za-z0-9+/]{86}==$/.test(encoded),
    "BUILD_OWNER_SIGNATURE_MISSING_OR_MALFORMED");
  const signature = Buffer.from(encoded, "base64");
  assert.equal(signature.length, 64, "BUILD_OWNER_SIGNATURE_WRONG_SIZE");
  assert(verify(null, bytes, key, signature),
    "BUILD_OWNER_SIGNATURE_UNTRUSTED");
  return true;
}
