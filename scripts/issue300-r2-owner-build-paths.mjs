import assert from "node:assert/strict";
import {
  constants,
  closeSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";

export const buildOwnerDirectories = Object.freeze({
  issuer: "tmp/issue300-r2-v2-prime-owned",
  build: "tmp/issue300-r2-w17-build-owned",
});
const samePath = (a, b) =>
  process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;

export function ownedLocation(projectRoot, name) {
  assert(Object.values(buildOwnerDirectories).includes(name));
  const base = realpathSync.native(projectRoot);
  let folder = base;
  for (const part of name.split("/")) {
    folder = join(folder, part);
    const info = lstatSync(folder);
    assert(
      info.isDirectory() &&
        !info.isSymbolicLink() &&
        samePath(realpathSync.native(folder), folder),
      "BUILD_OWNER_DIRECTORY_REPARSE_DENIED",
    );
  }
  return folder;
}

export function loadExact(path, folder, maxSize) {
  assert.equal(dirname(path), folder, "BUILD_OWNER_PATH_OUTSIDE_SCOPE");
  const stat = lstatSync(path);
  assert(
    stat.isFile() &&
      !stat.isSymbolicLink() &&
      stat.nlink === 1 &&
      stat.size > 0 &&
      stat.size <= maxSize &&
      samePath(realpathSync.native(path), path),
    "BUILD_OWNER_FILE_UNSAFE",
  );
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = fstatSync(fd);
    assert(
      opened.isFile() &&
        opened.nlink === 1 &&
        opened.dev === stat.dev &&
        opened.ino === stat.ino &&
        opened.size === stat.size,
      "BUILD_OWNER_FILE_SWAPPED",
    );
    const bytes = readFileSync(fd);
    const final = lstatSync(path);
    assert(
      bytes.length === opened.size &&
        final.dev === opened.dev &&
        final.ino === opened.ino &&
        final.size === opened.size &&
        fstatSync(fd).size === opened.size,
      "BUILD_OWNER_FILE_CHANGED",
    );
    return bytes;
  } finally {
    closeSync(fd);
  }
}
