import {
  constants, closeSync, fstatSync, lstatSync, openSync, readSync,
} from "node:fs";
import { Buffer } from "node:buffer";

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
    // Read exactly the attested size from this descriptor. readFileSync(fd)
    // would continue until EOF if another process grew the file after fstat,
    // permitting unbounded memory consumption on an untrusted source tree.
    const bytes = Buffer.alloc(Number(before.size));
    for (let offset = 0; offset < bytes.length;) {
      const count = readSync(descriptor, bytes, offset, bytes.length - offset, offset);
      if (count === 0) throw new Error("source truncated during read");
      offset += count;
    }
    if (readSync(descriptor, Buffer.alloc(1), 0, 1, bytes.length) !== 0) {
      throw new Error("source grew during read");
    }
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
