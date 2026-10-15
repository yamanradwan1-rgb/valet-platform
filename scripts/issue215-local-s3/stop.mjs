import { existsSync, unlinkSync } from "node:fs";
import { compose, envFile, ownedContainers, runtimeFile } from "./docker-tools.mjs";

if (!existsSync(envFile)) {
  if (ownedContainers().length) throw new Error("Owned container exists without task runtime env.");
  console.log("No running Issue #215 S3 fixture.");
  process.exit(0);
}
// Refuse to touch a container unless its exact project, service, and owner labels match.
const ids = ownedContainers();
if (ids.length > 1) throw new Error("Unexpected additional fixture container; refusing teardown.");
compose(["down", "-v"]);
if (ownedContainers().length !== 0)
  throw new Error("Disposable MinIO was not fully removed.");
for (const path of [runtimeFile, envFile])
  if (existsSync(path)) unlinkSync(path);
console.log("Issue #215 MinIO container and in-memory object data removed.");
