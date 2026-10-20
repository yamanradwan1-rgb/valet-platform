import { constants, closeSync, fstatSync, lstatSync, openSync,
  readFileSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, parse, resolve, sep } from "node:path";

const gitSha = /^[a-f0-9]{40}$/;
const lease = /^issue300-r2-[a-z0-9-]{8,96}$/;
const dirName = "issue300-r2-w7-acceptance-v2-owned";
const normalize = (path: string) =>
  process.platform === "win32" ? path.toLowerCase() : path;

export function r2VersionedManifestName(candidate: string, leaseId: string):
  string | null {
  if (!gitSha.test(candidate) || !lease.test(leaseId)) return null;
  return `R2_OWNED_RESOURCE_MANIFEST.v1.${candidate}.${leaseId}.json`;
}

function ownedFolder(entrypoint: string): string {
  return resolve(dirname(resolve(entrypoint)), "../../../tmp", dirName);
}

/** Check each ancestor, including Windows junctions and aliases. */
function canonicalRegularFile(path: string, folder: string, max: number):
  Buffer | null {
  try {
    if (!isAbsolute(path) || resolve(path) !== path ||
        normalize(dirname(path)) !== normalize(folder) ||
        basename(dirname(path)) !== dirName ||
        !["tmp"].includes(basename(dirname(folder)))) return null;
    const absolute = resolve(path);
    const drive = parse(absolute).root;
    let ancestor = drive;
    for (const part of absolute.slice(drive.length).split(sep).filter(Boolean)) {
      ancestor = join(ancestor, part);
      const stat = lstatSync(ancestor);
      if (stat.isSymbolicLink()) return null;
      if (normalize(realpathSync.native(ancestor)) !== normalize(ancestor)) {
        const target = statSync(ancestor);
        if (process.platform !== "win32" ||
            !/~[0-9]+(?:\\|$)/i.test(ancestor) ||
            target.dev !== stat.dev || target.ino !== stat.ino) return null;
      }
    }
    const before = lstatSync(absolute);
    if (!before.isFile() || before.nlink !== 1 ||
        before.size < 1 || before.size > max) return null;
    const fd = openSync(absolute,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const opened = fstatSync(fd);
      if (!opened.isFile() || opened.dev !== before.dev ||
          opened.ino !== before.ino || opened.size !== before.size)
        return null;
      const bytes = readFileSync(fd);
      const after = fstatSync(fd);
      const leaf = lstatSync(absolute);
      if (bytes.length !== before.size || after.size !== before.size ||
          leaf.dev !== opened.dev || leaf.ino !== opened.ino ||
          leaf.size !== opened.size) return null;
      return bytes;
    } finally { closeSync(fd); }
  } catch { return null; }
}

export function r2ReadVersionedManifest(entrypoint: string, proof: {
  readonly candidateSha: string;
  readonly leaseId: string;
  readonly artifactVersion?: number;
  readonly resourceManifestFilename?: string;
}): Buffer | null {
  const name = r2VersionedManifestName(proof.candidateSha, proof.leaseId);
  if (proof.artifactVersion !== 1 || !name ||
      proof.resourceManifestFilename !== name) return null;
  const folder = ownedFolder(entrypoint);
  return canonicalRegularFile(join(folder, name), folder, 20_480);
}

export function r2ReadSignedCertificateFile(entrypoint: string,
  path: string, candidate: string, leaseId: string,
  sidecar = false): Buffer | null {
  if (!gitSha.test(candidate) || !lease.test(leaseId)) return null;
  const filename = `R2_SIGNED_HTTP_LOCAL_ATTESTATION_${candidate.slice(0, 12)}_` +
    `[0-9]{13}_${leaseId}\\.json`;
  const pattern = new RegExp(`^${filename}${sidecar ? "\\.sig" : ""}$`);
  if (!pattern.test(basename(path))) return null;
  const folder = ownedFolder(entrypoint);
  return canonicalRegularFile(path, folder, sidecar ? 256 : 8192);
}
