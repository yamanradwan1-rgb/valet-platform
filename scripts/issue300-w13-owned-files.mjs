import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash, createPublicKey, verify } from "node:crypto";
import {
  closeSync,
  constants,
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
  normalize,
  parse,
  resolve,
  sep,
} from "node:path";
import process from "node:process";

// This is the same public SPKI compiled into the API verifier. The Owner's
// private signing key is never read by this test runner.
const ownerPem = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEApth1azlOHaJPPtirnSl5TB3UcAV/GOuWQeUFRx7wy/c=
-----END PUBLIC KEY-----
`;
assert.equal(
  createHash("sha256").update(ownerPem).digest("hex"),
  "7d13ad66aaf979dc269e13ac33a4f557661a8080cee074ce3e64eec922824f22",
);
export const ownerPublicKey = createPublicKey(ownerPem);

const comparable = (path) =>
  process.platform === "win32"
    ? normalize(path).toLowerCase()
    : normalize(path);

function inspectCanonical(path, directory) {
  const absolute = resolve(path);
  const parsed = parse(absolute);
  let cursor = parsed.root;
  for (const component of absolute
    .slice(cursor.length)
    .split(sep)
    .filter(Boolean)) {
    cursor = join(cursor, component);
    const stat = lstatSync(cursor);
    assert(
      !stat.isSymbolicLink(),
      `${directory}: symlink/reparse point forbidden`,
    );
    // On Windows native realpath resolves junctions/mount-point reparse paths.
    // Checking *every* ancestor catches a redirected repo/tmp/owned directory.
    const resolved = realpathSync.native(cursor);
    if (comparable(resolved) !== comparable(cursor)) {
      // Windows expands legacy DOS 8.3 spellings (ADMINI~1 -> Administrator).
      // Such an alias has the *same file identity* when followed; a redirected
      // symlink/junction/reparse changes that identity and remains forbidden.
      const shortNameAlias =
        process.platform === "win32" && /~[0-9]+(?:\\|$)/i.test(cursor);
      const followed = statSync(cursor);
      assert(
        shortNameAlias &&
          followed.dev === stat.dev &&
          followed.ino === stat.ino,
        `${directory}: redirected reparse path forbidden`,
      );
    }
  }
  const result = lstatSync(absolute);
  assert(
    directory ? result.isDirectory() : result.isFile(),
    `Expected regular ${directory ? "directory" : "file"}`,
  );
  return result;
}

function canonicalFile(path, owned) {
  assert.equal(typeof path, "string", "Missing owned file path");
  assert(isAbsolute(path), "Owned file path must be absolute");
  assert(
    !path.split(/[\\/]/).some((part) => part === "." || part === ".."),
    "Owned file path contains traversal",
  );
  assert(!basename(path).includes(":"), "NTFS alternate data stream forbidden");
  const absolute = resolve(path);
  assert.equal(
    comparable(dirname(absolute)),
    comparable(owned),
    "Owned file must be a direct child of canonical W7 V2 directory",
  );
  inspectCanonical(owned, true);
  return { absolute, stat: inspectCanonical(absolute, false) };
}

function readOwnedBytes(path, owned, maxBytes) {
  const { absolute, stat } = canonicalFile(path, owned);
  assert(stat.size > 0 && stat.size <= maxBytes, "Owned input size invalid");
  assert.equal(stat.nlink, 1, "Hard-linked owned input forbidden");
  const fd = openSync(
    absolute,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
  );
  try {
    const opened = fstatSync(fd);
    assert(
      opened.isFile() &&
        opened.dev === stat.dev &&
        opened.ino === stat.ino &&
        opened.size === stat.size &&
        opened.nlink === 1,
      "Owned input changed between path validation and open",
    );
    const bytes = readFileSync(fd);
    const after = fstatSync(fd);
    assert(
      after.dev === opened.dev &&
        after.ino === opened.ino &&
        after.size === opened.size &&
        bytes.length === opened.size,
      "Owned input changed while being read",
    );
    const final = canonicalFile(path, owned).stat;
    assert(
      final.dev === opened.dev &&
        final.ino === opened.ino &&
        final.size === opened.size,
      "Owned input path changed while being read",
    );
    return bytes;
  } finally {
    closeSync(fd);
  }
}

export function verifyDetachedSignature(bytes, signatureText, publicKey) {
  const signature = signatureText.trim();
  assert.match(
    signature,
    /^[A-Za-z0-9+/]{86}==$/,
    "Invalid raw Owner Ed25519 certificate signature",
  );
  const decoded = Buffer.from(signature, "base64");
  assert.equal(decoded.length, 64, "Invalid Ed25519 signature length");
  assert.equal(
    decoded.toString("base64"),
    signature,
    "Noncanonical Owner signature encoding",
  );
  assert.equal(
    verify(null, bytes, publicKey, decoded),
    true,
    "Owner Ed25519 signature verification failed",
  );
}

export function createOwnedFileReader(directory, publicKey) {
  assert(isAbsolute(directory), "Owned directory must be absolute");
  const owned = resolve(directory);
  // Fail closed if any component of the declared trusted directory redirects.
  inspectCanonical(owned, true);
  const readBytes = (path, limit = 262_144) =>
    readOwnedBytes(path, owned, limit);
  const jsonResult = (bytes) => ({
    bytes,
    sha: createHash("sha256").update(bytes).digest("hex"),
    json: JSON.parse(bytes.toString("utf8")),
  });
  return Object.freeze({
    readJson: (path) => jsonResult(readBytes(path)),
    readCertificate(path) {
      const bytes = readBytes(path, 8192);
      const signatureText = readBytes(`${path}.sig`, 256).toString("utf8");
      // The raw detached .sig is Base64 text, not a JSON fixture signature.
      // Verify the exact certificate bytes *before* decoding or trusting JSON.
      verifyDetachedSignature(bytes, signatureText, publicKey);
      return jsonResult(bytes);
    },
  });
}
