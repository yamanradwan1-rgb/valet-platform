import {
  constants, closeSync, fstatSync, lstatSync, openSync, readFileSync,
} from "node:fs";

const MAX_MIGRATION_SOURCE_BYTES = 16 * 1024 * 1024;

/**
 * Read and validate the same open regular-file descriptor. Path-based lstat
 * before readFileSync(path) lets the target change between those two syscalls.
 * O_NOFOLLOW is atomic on supported POSIX hosts; Windows additionally relies
 * on post-open descriptor/path identity checks and immutable source digests.
 */
export function readTrustedMigrationBytes(path) {
  let descriptor;
  try {
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.size > BigInt(MAX_MIGRATION_SOURCE_BYTES)) {
      throw new Error("untrusted file descriptor");
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    const atPath = lstatSync(path, { bigint: true });
    if (
      !after.isFile() || !atPath.isFile() || atPath.isSymbolicLink() ||
      before.dev !== after.dev || before.ino !== after.ino ||
      before.size !== after.size || before.mtimeNs !== after.mtimeNs ||
      atPath.dev !== after.dev || atPath.ino !== after.ino ||
      BigInt(bytes.length) !== after.size
    ) {
      throw new Error("source changed during validation");
    }
    return bytes;
  } catch {
    throw new Error("W30_PG17_MIGRATION_SOURCE_FILE_UNTRUSTED");
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}
