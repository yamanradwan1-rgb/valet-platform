import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { compose, docker, envFile, ownedContainers, runtimeFile } from "./docker-tools.mjs";

if (!existsSync(envFile)) {
  if (ownedContainers().length) throw new Error("Owned container exists without task runtime env.");
  console.log("No running Issue #215 S3 fixture.");
  process.exit(0);
}
// Refuse to touch a container unless its exact project, service, and owner labels match.
const ids = ownedContainers();
if (ids.length > 1) throw new Error("Unexpected additional fixture container; refusing teardown.");
if (!existsSync(runtimeFile)) throw new Error("Missing MinIO runtime identity; refusing teardown.");
const runtime = JSON.parse(readFileSync(runtimeFile, "utf8"));
const pinned = ids[0] && JSON.parse(docker(["inspect", ids[0]]))[0];
const expectedImage = docker([
  "image", "inspect",
  "cgr.dev/chainguard/minio@sha256:2136d593beacf4461187035eca949fe49abd589d5079735025c711ca58fee0c8",
  "--format", "{{.Id}}",
]);
if (!pinned || runtime.containerId !== pinned.Id ||
    !/^[a-f0-9]{32}$/.test(runtime.runId ?? "") ||
    pinned.Config?.Labels?.["vaylet.run"] !== runtime.runId ||
    !/^sha256:[a-f0-9]{64}$/.test(expectedImage) ||
    pinned.Image !== expectedImage ||
    (runtime.imageId !== undefined && runtime.imageId !== expectedImage))
  throw new Error("MinIO exact owned runtime attestation failed; refusing teardown.");
compose(["down", "-v"]);
if (ownedContainers().length !== 0)
  throw new Error("Disposable MinIO was not fully removed.");
for (const path of [runtimeFile, envFile])
  if (existsSync(path)) unlinkSync(path);
console.log("Issue #215 MinIO container and in-memory object data removed.");
