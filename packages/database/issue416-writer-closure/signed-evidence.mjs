import { Buffer } from "node:buffer";
import { createPublicKey, verify } from "node:crypto";
import { requiredVariants, sha256 } from "./catalog.mjs";

const digest = (value) =>
  typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
const requiredChecks = [
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

export function canonicalJson(value) {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  )
    return JSON.stringify(value);
  if (Array.isArray(value))
    return "[" + value.map(canonicalJson).join(",") + "]";
  if (!value || typeof value !== "object")
    throw new Error("NONCANONICAL_ATTESTATION_VALUE");
  const keys = Object.keys(value).sort();
  return (
    "{" +
    keys
      .map((key) => JSON.stringify(key) + ":" + canonicalJson(value[key]))
      .join(",") +
    "}"
  );
}

function assertDigest(value, name, problems) {
  if (!digest(value))
    problems.push({ code: "MISSING_EVIDENCE_DIGEST", subject: name });
}

export function validateSignedClosure(
  envelope,
  trustedPem,
  pinnedKeySha256,
  analysis,
) {
  const problems = [];
  if (!trustedPem || !digest(pinnedKeySha256)) {
    return [{ code: "INDEPENDENT_TRUST_ANCHOR_REQUIRED" }];
  }
  let key;
  try {
    key = createPublicKey(trustedPem);
    if (
      key.asymmetricKeyType !== "ed25519" ||
      sha256(key.export({ type: "spki", format: "der" })) !== pinnedKeySha256
    ) {
      return [{ code: "UNTRUSTED_EVIDENCE_SIGNER" }];
    }
    if (
      !envelope ||
      Object.keys(envelope).sort().join(",") !== "payload,signature" ||
      typeof envelope.signature !== "string" ||
      !/^(?:[a-zA-Z0-9+/]{4}){21}[a-zA-Z0-9+/]{2}==$/.test(envelope.signature)
    ) {
      return [{ code: "INVALID_EVIDENCE_ENVELOPE" }];
    }
    const signature = Buffer.from(envelope.signature, "base64");
    if (
      signature.length !== 64 ||
      !verify(
        null,
        Buffer.from(canonicalJson(envelope.payload)),
        key,
        signature,
      )
    ) {
      return [{ code: "INVALID_EVIDENCE_SIGNATURE" }];
    }
  } catch {
    return [{ code: "INVALID_EVIDENCE_SIGNATURE_OR_KEY" }];
  }

  const payload = envelope.payload;
  if (payload.version !== "ISSUE416_U2_WRITER_CLOSURE_V1") {
    problems.push({ code: "UNKNOWN_EVIDENCE_VERSION" });
  }
  for (const [name, actual] of Object.entries({
    commit: analysis.commit,
    catalogDigest: analysis.catalog.digest,
    sourceGraphDigest: analysis.source.digest,
    migrationsDigest: analysis.sql.digest,
    legacyFunctionDigest: analysis.legacy.digest,
  })) {
    if (payload[name] !== actual)
      problems.push({ code: "STALE_EVIDENCE_BINDING", subject: name });
  }

  const runtime = payload.runtime;
  if (
    !runtime ||
    runtime.pgMajor !== 17 ||
    runtime.audience !== "VAYLET_PROTECTED" ||
    runtime.roleSnapshotComplete !== true ||
    runtime.overloadsComplete !== true ||
    runtime.noUnreviewedPrincipal !== true
  ) {
    problems.push({ code: "INCOMPLETE_RUNTIME_ATTESTATION" });
  }
  assertDigest(runtime?.deploymentDigest, "runtime.deploymentDigest", problems);
  assertDigest(
    runtime?.aclSnapshotDigest,
    "runtime.aclSnapshotDigest",
    problems,
  );
  assertDigest(
    runtime?.migrationHistoryDigest,
    "runtime.migrationHistoryDigest",
    problems,
  );

  const checks = runtime?.checks;
  for (const check of requiredChecks) {
    if (checks?.[check]?.result !== "PASS") {
      problems.push({ code: "UNPROVEN_REQUIRED_CUTOVER_CHECK", check });
    }
    assertDigest(
      checks?.[check]?.evidenceSha256,
      "runtime.checks." + check,
      problems,
    );
  }
  const items = payload.rows;
  if (!Array.isArray(items) || items.length !== analysis.catalog.rows.length) {
    problems.push({ code: "INCOMPLETE_SIGNED_WRITER_MANIFEST" });
    return problems;
  }
  const seen = new Set();
  for (const actual of analysis.catalog.rows) {
    const row = items.find((item) => item?.id === actual.id);
    if (
      !row ||
      seen.has(actual.id) ||
      items.filter((item) => item?.id === actual.id).length !== 1
    ) {
      problems.push({
        code: "MISSING_OR_DUPLICATE_SIGNED_WRITER",
        id: actual.id,
      });
      continue;
    }
    seen.add(actual.id);
    if (row.class !== actual.class || row.inventoryDigest !== actual.digest) {
      problems.push({ code: "MISBOUND_SIGNED_WRITER", id: actual.id });
    }
    assertDigest(row.pg17EvidenceSha256, actual.id + ".pg17Evidence", problems);
    assertDigest(
      row.reviewEvidenceSha256,
      actual.id + ".reviewEvidence",
      problems,
    );
    const protocol = {
      AUTHENTICATED_WRITER: "PURPOSE_BOUND_VAP1",
      CONTROLLED_OPERATOR: "RESTRICTED_OPERATOR",
      READ_GUARD: "READ_ONLY_NO_SIGNER",
      BOUNDED_MAINTENANCE: "BOUNDED_WORKER",
      NONPRODUCTION_ONLY: "INACCESSIBLE_IN_PRODUCTION",
    }[actual.class];
    if (row.state !== "CLOSED" || row.protocol !== protocol) {
      problems.push({ code: "WRITER_NOT_CLOSED", id: actual.id });
    }
    const required = requiredVariants(actual.id);
    if (
      !Array.isArray(row.variants) ||
      row.variants.length !== required.length ||
      required.some(
        (name) =>
          row.variants.filter((variant) => variant?.name === name).length !== 1,
      )
    ) {
      problems.push({ code: "INCOMPLETE_PURPOSE_VARIANTS", id: actual.id });
      continue;
    }
    for (const variant of row.variants) {
      assertDigest(
        variant.pg17EvidenceSha256,
        actual.id + "." + variant.name,
        problems,
      );
      if (actual.class === "AUTHENTICATED_WRITER") {
        if (
          !analysis.sql.definitions.some(
            ({ name }) => name === variant.prepareFunction,
          ) ||
          !analysis.sql.definitions.some(
            ({ name }) => name === variant.executeFunction,
          ) ||
          !/^vap1_prepare_[a-z0-9_]+$/.test(variant.prepareFunction ?? "") ||
          variant.executeFunction !==
            variant.prepareFunction?.replace("vap1_prepare_", "vap1_execute_")
        ) {
          problems.push({
            code: "SIGNED_VARIANT_WITHOUT_SQL_PAIR",
            id: actual.id,
            variant: variant.name,
          });
        }
      } else if (variant.prepareFunction || variant.executeFunction) {
        problems.push({
          code: "EXCLUDED_VARIANT_CLAIMS_VAP1",
          id: actual.id,
          variant: variant.name,
        });
      }
    }
    if (actual.class === "AUTHENTICATED_WRITER") {
      assertDigest(
        row.ceremonyEvidenceSha256,
        actual.id + ".ceremony",
        problems,
      );
      assertDigest(
        row.lockAndReceiptEvidenceSha256,
        actual.id + ".lockAndReceipt",
        problems,
      );
    }
    if (actual.id === "P02") {
      assertDigest(
        row.externalProductionWriterInventorySha256,
        "P02.externalProductionWriterInventory",
        problems,
      );
    }
    if (actual.id === "X01") {
      assertDigest(
        row.shiftTaskNoInversionEvidenceSha256,
        "X01.shiftTaskNoInversion",
        problems,
      );
    }
  }
  return problems;
}
