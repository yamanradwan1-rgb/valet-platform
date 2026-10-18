import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHmac } from "node:crypto";

// RFC 4226/6238 TOTP for actual, isolated Staff MFA endpoints. No secret output.
export function generateCurrentTotp(secretBase32, timestampMs = Date.now()) {
  assert.match(secretBase32 ?? "", /^[A-Z2-7]{16,}$/);
  assert(Number.isFinite(timestampMs) && timestampMs >= 0);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let carry = 0;
  const bytes = [];
  for (const char of secretBase32) {
    carry = (carry << 5) | alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((carry >>> bits) & 255);
      carry &= (1 << bits) - 1;
    }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(timestampMs / 30_000)));
  const mac = createHmac("sha1", Buffer.from(bytes)).update(counter).digest();
  const offset = mac[mac.length - 1] & 15;
  const binary = mac.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 1_000_000).padStart(6, "0");
}
