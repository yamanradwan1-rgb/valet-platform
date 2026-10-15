import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const project = "issue215-s3-worker4";
export const bucket = "issue215-s3-worker4";
export const folder = dirname(fileURLToPath(import.meta.url));
export const composeFile = join(folder, "compose.yaml");
export const envFile = join(folder, ".runtime.env");
export const runtimeFile = join(folder, ".runtime.json");
export const mcImage =
  "cgr.dev/chainguard/minio-client@sha256:d8a93c5d335509ff353774eefec8f82fa2a2a975e800139702232d8be3dbe6b9";

export function docker(args, environment = process.env) {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    env: environment,
    maxBuffer: 512 * 1024,
  });
  if (result.error || result.status !== 0)
    throw new Error(`docker ${args[0]} failed: ${result.error?.message ?? result.stderr?.trim()}`);
  return result.stdout.trim();
}

export function compose(args) {
  return docker(["compose", "-p", project, "--env-file", envFile, "-f", composeFile, ...args]);
}

export function ownedContainers() {
  const ids = docker(["ps", "-aq", "--filter", `label=com.docker.compose.project=${project}`])
    .split(/\s+/).filter(Boolean);
  for (const id of ids) {
    const labels = JSON.parse(docker(["inspect", "-f", "{{json .Config.Labels}}", id]));
    if (labels["com.docker.compose.service"] !== "minio" ||
        labels["vaylet.issue"] !== "215" ||
        labels["vaylet.task"] !== "282" ||
        labels["vaylet.owner"] !== project)
      throw new Error(`Unexpected container under ${project}; refusing to modify it.`);
  }
  return ids;
}
