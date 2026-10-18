import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash, createPublicKey, verify } from "node:crypto";
import {
  constants,
  closeSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  parse,
  resolve,
  sep,
} from "node:path";
import process from "node:process";

// Pinned Owner SPKI shared with W13 and the V2 API; never loaded from env/JSON.
const ownerPem = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEApth1azlOHaJPPtirnSl5TB3UcAV/GOuWQeUFRx7wy/c=
-----END PUBLIC KEY-----
`;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
assert.equal(
  hash(ownerPem),
  "7d13ad66aaf979dc269e13ac33a4f557661a8080cee074ce3e64eec922824f22",
);
const ownerKey = createPublicKey(ownerPem);
const hex = /^[a-f0-9]{64}$/;
const canonical = (path) =>
  process.platform === "win32"
    ? path.toLowerCase().replaceAll("/", "\\")
    : path;

function guardedPath(path, directory) {
  assert(
    isAbsolute(path) &&
      !path.split(/[\\/]/).some((s) => s === ".." || s === "."),
    "Owner evidence path must be absolute and traversal-free",
  );
  assert(!basename(path).includes(":"), "NTFS alternate stream is forbidden");
  const full = resolve(path);
  const root = parse(full).root;
  let current = root;
  for (const segment of full.slice(root.length).split(sep).filter(Boolean)) {
    current = join(current, segment);
    const link = lstatSync(current);
    assert(!link.isSymbolicLink(), "Owner evidence symlink/junction forbidden");
    const real = realpathSync.native(current);
    if (canonical(real) !== canonical(current)) {
      const alias =
        process.platform === "win32" && /~[0-9]+(?:\\|$)/i.test(current);
      const target = statSync(current);
      assert(
        alias && target.dev === link.dev && target.ino === link.ino,
        "Owner evidence redirected reparse forbidden",
      );
    }
  }
  const info = lstatSync(full);
  assert(
    directory ? info.isDirectory() : info.isFile(),
    "Owner evidence must be a regular file/directory",
  );
  return { full, info };
}

export function safeOwnedFile(path, ownedDirectory, max = 262_144) {
  const directory = guardedPath(ownedDirectory, true).full;
  const file = guardedPath(path, false);
  assert.equal(
    canonical(dirname(file.full)),
    canonical(directory),
    "Owner evidence must be immediate child of canonical owned directory",
  );
  assert(
    file.info.size > 0 && file.info.size <= max && file.info.nlink === 1,
    "Owner evidence size/link invalid",
  );
  const fd = openSync(
    file.full,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
  );
  try {
    const opened = fstatSync(fd);
    assert(
      opened.isFile() &&
        opened.dev === file.info.dev &&
        opened.ino === file.info.ino &&
        opened.size === file.info.size &&
        opened.nlink === 1,
      "Owner evidence changed before read",
    );
    const bytes = readFileSync(fd);
    const after = fstatSync(fd);
    const pathAfter = guardedPath(path, false).info;
    assert(
      bytes.length === opened.size &&
        after.size === opened.size &&
        pathAfter.dev === opened.dev &&
        pathAfter.ino === opened.ino &&
        pathAfter.size === opened.size,
      "Owner evidence changed while being read",
    );
    return bytes;
  } finally {
    closeSync(fd);
  }
}

export function assertSignature(bytes, signatureText, key = ownerKey) {
  const raw = signatureText.trim();
  assert.match(
    raw,
    /^[A-Za-z0-9+/]{86}==$/,
    "Owner signature must be raw canonical Base64",
  );
  const signature = Buffer.from(raw, "base64");
  assert.equal(signature.length, 64);
  assert.equal(signature.toString("base64"), raw);
  assert(
    verify(null, bytes, key, signature),
    "Prime Owner Ed25519 manifest signature invalid",
  );
}

function rejectSecretMaterial(value) {
  const sensitive =
    /(?:password|secret|token|bearer|cookie|private.?key|credential|database_url|migration_url)/i;
  const visit = (item) => {
    if (Array.isArray(item)) return item.forEach(visit);
    if (item && typeof item === "object") {
      for (const [key, child] of Object.entries(item)) {
        assert(
          !sensitive.test(key),
          "Owner manifest contains credential field",
        );
        visit(child);
      }
    } else if (typeof item === "string") {
      assert(
        !/-----BEGIN (?:[A-Z ]*PRIVATE KEY)-----|(?:postgres(?:ql)?:\/\/)[^\s]+@/i.test(
          item,
        ),
        "Owner manifest embeds credential material",
      );
    }
  };
  visit(value);
}

export function assertProducerCommitments(m) {
  assert.equal(m.provenance, "PRIME_OWNER_SIGNED_W8_RESOURCE_V1");
  assert.match(m.candidateSha ?? "", /^[a-f0-9]{40}$/);
  assert.match(m.leaseId ?? "", /^issue300-r2-w8-[a-z0-9-]{12,}$/);
  assert([100_000, 1_000_000].includes(m.targetTier));
  assert.match(m.sourceFixtureHash ?? "", hex);
  assert.match(m.sourceOracleSha256 ?? "", hex);
  for (const key of [
    "oracleIssuerKeySha256",
    "guestBootIssuerKeySha256",
    "coldTrialIssuerKeySha256",
    "runtimeIssuerKeySha256",
  ]) {
    assert.match(m[key] ?? "", hex, `${key} missing from Owner manifest`);
  }
  assert.equal(
    new Set([
      m.oracleIssuerKeySha256,
      m.guestBootIssuerKeySha256,
      m.coldTrialIssuerKeySha256,
      m.runtimeIssuerKeySha256,
    ]).size,
    4,
    "Oracle/guest/runtime/cold require independent Owner-pinned issuers",
  );
  assert.notEqual(
    m.oracleIssuerKeySha256,
    m.runtimeIssuerKeySha256,
    "Oracle and independent runtime observer must use distinct signing keys",
  );
  assert.match(m.resource?.containerId ?? "", hex);
  assert.match(m.resource?.apiBundleSha256 ?? "", hex);
  assert.match(
    m.resource?.database ?? "",
    /^issue300_r2_w7_acceptance_[a-z0-9_]+$/,
  );
  assert.match(
    m.resource?.container ?? "",
    /^issue300-r2-w7-acceptance-[a-z0-9-]+$/,
  );
  assert(Number.isInteger(m.resource?.dbPort));
  assert(Number.isInteger(m.resource?.apiPort));
  assert(Number.isInteger(m.resource?.dashboardPort));
  assert(
    Number.isSafeInteger(m.resource?.apiPid) && m.resource.apiPid > 0,
    "Owner must pin live API PID before signing workload",
  );
  assert(
    Number.isFinite(Date.parse(m.resource?.apiProcessStartedAt)),
    "Owner must pin API process start timestamp",
  );
  assert.equal(m.resource?.dbHost, "127.0.0.1");
  assert.equal(m.resource?.apiHost, "127.0.0.1");
  assert.match(m.resource?.vmUuid ?? "", /^[a-f0-9-]{36}$/);
  for (const name of ["organizationId", "locationId", "slotId"])
    assert.match(
      m.scope?.[name] ?? "",
      /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/,
    );
  rejectSecretMaterial(m);
  return m;
}

export function readSignedW8Manifest(path, ownedDirectory) {
  const bytes = safeOwnedFile(path, ownedDirectory, 32_768);
  const sidecar = safeOwnedFile(`${path}.sig`, ownedDirectory, 256);
  assertSignature(bytes, sidecar.toString("utf8"));
  // Neither a local SHA nor any environment-supplied signer is a trust anchor.
  const manifest = JSON.parse(bytes.toString("utf8"));
  assertProducerCommitments(manifest);
  Object.defineProperty(manifest, "ownerManifestSha256", {
    value: hash(bytes),
    enumerable: false,
    configurable: false,
  });
  const deepFreeze = (value) => {
    if (value && typeof value === "object") {
      for (const child of Object.values(value)) deepFreeze(child);
      Object.freeze(value);
    }
    return value;
  };
  return deepFreeze(manifest);
}

export function verifyProducerKeyFile(
  keyPath,
  expectedFingerprint,
  ownedDirectory,
) {
  assert.match(expectedFingerprint ?? "", hex);
  const key = createPublicKey(safeOwnedFile(keyPath, ownedDirectory, 8192));
  assert.equal(key.asymmetricKeyType, "ed25519");
  assert.equal(
    hash(key.export({ type: "spki", format: "der" })),
    expectedFingerprint,
    "Producer key is not signed into Prime Owner manifest",
  );
  return key;
}
