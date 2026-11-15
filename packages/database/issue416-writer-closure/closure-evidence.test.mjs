import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createPublicKey, generateKeyPairSync, sign } from "node:crypto";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, URL } from "node:url";
import { requiredVariants, sha256 } from "./catalog.mjs";
import { analyze, evaluate } from "./check.mjs";
import { canonicalJson, validateSignedClosure } from "./signed-evidence.mjs";

const repo = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const analysis = analyze(repo);
const fingerprint = "a".repeat(64);
const mandatoryChecks = [
  "pg17AclRuntimePublicInherited",
  "pg17OverloadEnumeration",
  "pg17ProtectedColumnAndDefaultAcl",
  "pg17OwnerSearchPathAndRoleInheritance",
  "oldProvisionerRerunDenied",
  "protectedProvisionerTwice",
  "oldBinaryAndStaleSessionDenied",
  "nodePostgresProofParity",
  "sameBackendChallengeAndReceipt",
  "twoConnectionLockAndUnknownCommit",
  "l1AdmissionAndExternalOperator",
  "l2ControlledCutoverRollback",
];

function signingFixture() {
  // This synthetic fixture tests ONLY structural/signature validation.
  // The caller never treats it as an actual PostgreSQL security result.
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const pem = publicKey.export({ format: "pem", type: "spki" });
  const keySha256 = sha256(
    createPublicKey(pem).export({ format: "der", type: "spki" }),
  );
  const definitions = [];
  const rows = analysis.catalog.rows.map((row) => {
    const variants = requiredVariants(row.id).map((name) => {
      const result = { name, pg17EvidenceSha256: fingerprint };
      if (row.class === "AUTHENTICATED_WRITER") {
        const suffix = row.id.toLowerCase() + "_" + name.toLowerCase();
        result.prepareFunction = "vap1_prepare_" + suffix;
        result.executeFunction = "vap1_execute_" + suffix;
        definitions.push(
          { name: result.prepareFunction },
          { name: result.executeFunction },
        );
      }
      return result;
    });
    return {
      id: row.id,
      inventoryDigest: row.digest,
      class: row.class,
      state: "CLOSED",
      protocol: {
        AUTHENTICATED_WRITER: "PURPOSE_BOUND_VAP1",
        CONTROLLED_OPERATOR: "RESTRICTED_OPERATOR",
        READ_GUARD: "READ_ONLY_NO_SIGNER",
        BOUNDED_MAINTENANCE: "BOUNDED_WORKER",
        NONPRODUCTION_ONLY: "INACCESSIBLE_IN_PRODUCTION",
      }[row.class],
      pg17EvidenceSha256: fingerprint,
      reviewEvidenceSha256: fingerprint,
      ceremonyEvidenceSha256: fingerprint,
      lockAndReceiptEvidenceSha256: fingerprint,
      externalProductionWriterInventorySha256: fingerprint,
      shiftTaskNoInversionEvidenceSha256: fingerprint,
      variants,
    };
  });
  const fakeAnalysis = {
    ...analysis,
    sql: { ...analysis.sql, definitions },
  };
  const payload = {
    version: "ISSUE416_U2_WRITER_CLOSURE_V1",
    commit: analysis.commit,
    catalogDigest: analysis.catalog.digest,
    sourceGraphDigest: analysis.source.digest,
    migrationsDigest: analysis.sql.digest,
    legacyFunctionDigest: analysis.legacy.digest,
    runtime: {
      pgMajor: 17,
      audience: "VAYLET_PROTECTED",
      roleSnapshotComplete: true,
      overloadsComplete: true,
      noUnreviewedPrincipal: true,
      deploymentDigest: fingerprint,
      aclSnapshotDigest: fingerprint,
      migrationHistoryDigest: fingerprint,
      checks: Object.fromEntries(
        mandatoryChecks.map((name) => [
          name,
          { result: "PASS", evidenceSha256: fingerprint },
        ]),
      ),
    },
    rows,
  };
  const seal = () => ({
    payload,
    signature: sign(
      null,
      Buffer.from(canonicalJson(payload)),
      privateKey,
    ).toString("base64"),
  });
  return { fakeAnalysis, payload, pem, keySha256, seal };
}

test("synthetic signed JSON is well-formed, yet source-only verdict always BLOCKED", () => {
  const fixture = signingFixture();
  const envelope = fixture.seal();
  assert.deepEqual(
    validateSignedClosure(
      envelope,
      fixture.pem,
      fixture.keySha256,
      fixture.fakeAnalysis,
    ),
    [],
  );
  const report = evaluate(
    fixture.fakeAnalysis,
    envelope,
    fixture.pem,
    fixture.keySha256,
  );
  assert.equal(report.verdict, "BLOCKED");
  assert.ok(
    report.reasons.some(
      (reason) =>
        reason.code ===
        "ACTUAL_PG17_ACL_AND_CUTOVER_NOT_VERIFIED_BY_SOURCE_DIAGNOSTIC",
    ),
  );
  assert.ok(
    report.reasons.some(
      (reason) =>
        reason.code === "UNRETIRED_LEGACY_PROVISIONER_EXECUTE_DECLARATION",
    ),
  );
});

test("payload tampering invalidates signature; self-issued key with wrong pin is rejected", () => {
  const fixture = signingFixture();
  const envelope = fixture.seal();
  envelope.payload.rows[0].state = "OPEN";
  assert.ok(
    validateSignedClosure(
      envelope,
      fixture.pem,
      fixture.keySha256,
      fixture.fakeAnalysis,
    ).some((reason) => reason.code === "INVALID_EVIDENCE_SIGNATURE"),
  );
  const newKey = generateKeyPairSync("ed25519").publicKey;
  const forgedPem = newKey.export({ type: "spki", format: "pem" });
  assert.ok(
    validateSignedClosure(
      fixture.seal(),
      forgedPem,
      fixture.keySha256,
      fixture.fakeAnalysis,
    ).some((reason) => reason.code === "UNTRUSTED_EVIDENCE_SIGNER"),
  );
});

test("signed omissions, stale content, and missing required PG checks fail closed", () => {
  const alterations = [
    [
      ({ rows }) =>
        rows.splice(
          rows.findIndex((row) => row.id === "X01"),
          1,
        ),
      "INCOMPLETE_SIGNED_WRITER_MANIFEST",
    ],
    [
      ({ rows }) => {
        rows.find((row) => row.id === "M09").variants.pop();
      },
      "INCOMPLETE_PURPOSE_VARIANTS",
    ],
    [
      ({ rows }) => {
        rows.find(
          (row) => row.id === "P02",
        ).externalProductionWriterInventorySha256 = "";
      },
      "MISSING_EVIDENCE_DIGEST",
    ],
    [
      ({ rows }) => {
        rows.find(
          (row) => row.id === "X01",
        ).shiftTaskNoInversionEvidenceSha256 = "";
      },
      "MISSING_EVIDENCE_DIGEST",
    ],
    [
      ({ rows }) => {
        rows.find((row) => row.id === "A10").variants[0].prepareFunction =
          "vap1_prepare_arbitrary";
      },
      "EXCLUDED_VARIANT_CLAIMS_VAP1",
    ],
    [
      (payload) => {
        payload.runtime.checks.pg17OverloadEnumeration.result = "SKIP";
      },
      "UNPROVEN_REQUIRED_CUTOVER_CHECK",
    ],
    [
      (payload) => {
        payload.commit = "0".repeat(40);
      },
      "STALE_EVIDENCE_BINDING",
    ],
  ];
  for (const [change, expected] of alterations) {
    const fixture = signingFixture();
    change(fixture.payload);
    const problems = validateSignedClosure(
      fixture.seal(),
      fixture.pem,
      fixture.keySha256,
      fixture.fakeAnalysis,
    );
    assert.ok(
      problems.some((reason) => reason.code === expected),
      expected,
    );
  }
});

test("missing independent trust anchor never passes synthetic source attestations", () => {
  const fixture = signingFixture();
  const reasons = validateSignedClosure(
    fixture.seal(),
    "",
    "",
    fixture.fakeAnalysis,
  );
  assert.equal(reasons[0].code, "INDEPENDENT_TRUST_ANCHOR_REQUIRED");
  assert.equal(evaluate(fixture.fakeAnalysis).verdict, "BLOCKED");
});
