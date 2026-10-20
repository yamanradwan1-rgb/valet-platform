import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { test } from "node:test";
import { assertConsistentPinText, verifySourceOwnerPins,
  mandatoryOwnerPinSources } from "./issue300-r2-trusted-root-consistency.mjs";

test("exact tracked Owner root pins and ignored V3 test source agree", () => {
  const result = verifySourceOwnerPins(undefined, { requireV3: true });
  assert.equal(result.sourceCount, mandatoryOwnerPinSources.length + 1);
  assert.match(result.spkiSha256, /^[a-f0-9]{64}$/);
});

test("arbitrary second signer pin cannot silently split trust roots", () => {
  const { publicKey } = generateKeyPairSync("ed25519");
  const synthetic = publicKey.export({ format: "der", type: "spki" }).toString("base64");
  const trusted = "MCowBQYDK2VwAyEApth1azlOHaJPPtirnSl5TB3UcAV/GOuWQeUFRx7wy/c=";
  assert.throws(() => assertConsistentPinText([
    { name: "runtime", text: trusted },
    { name: "issuer", text: synthetic },
  ]), /OWNER_PIN_IDENTITY_MISMATCH/);
});

test("missing/duplicated pins and malformed SPKI fail closed", () => {
  for (const text of ["", "not-a-public-key", "ABC", "MCowBQYDK2VwAyEA".padEnd(60, "!")])
    assert.throws(() => assertConsistentPinText([
      { name: "runtime", text }, { name: "issuer", text },
    ]), /OWNER_PIN_MISSING_OR_DUPLICATE/);
  const pinned = "MCowBQYDK2VwAyEApth1azlOHaJPPtirnSl5TB3UcAV/GOuWQeUFRx7wy/c=";
  assert.throws(() => assertConsistentPinText([
    { name: "runtime", text: pinned + "\n" + pinned },
    { name: "issuer", text: pinned },
  ]), /OWNER_PIN_MISSING_OR_DUPLICATE/);
});
