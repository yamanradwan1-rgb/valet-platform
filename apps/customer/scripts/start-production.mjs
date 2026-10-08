import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  assertArtifactMatchesDeployment,
  readCustomerArtifactApiOrigin,
} from "./artifact-origin.mjs";

process.env.HOSTNAME ||= "127.0.0.1";
process.env.PORT ||= "3002";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const standaloneAppRoot = resolve(appRoot, ".next/standalone/apps/customer");
const artifactOrigin = readCustomerArtifactApiOrigin(standaloneAppRoot);
assertArtifactMatchesDeployment(artifactOrigin, process.env.API_ORIGIN);
process.env.VAYLET_CUSTOMER_ARTIFACT_API_ORIGIN = artifactOrigin;

await import(pathToFileURL(resolve(standaloneAppRoot, "server.js")).href);
