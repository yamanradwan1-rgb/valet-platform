import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { inspectOwnedDocker, preflightBeforeCompose } from "./docker-target.mjs";
import { attestPostgresRoles } from "./postgres-target.mjs";
import { assertTargetEnvironment, sanitizedChildEnvironment } from "./target-contract.mjs";

const execFileAsync = promisify(execFile);
const childModule = new URL("./child-preflight.mjs", import.meta.url);

export async function preflightIssue416Target(env = process.env) {
  const urls = assertTargetEnvironment(env);
  const dockerBefore = await inspectOwnedDocker();
  const postgres = await attestPostgresRoles(urls);
  const dockerAfter = await inspectOwnedDocker();
  if (dockerBefore.containerId !== dockerAfter.containerId ||
      dockerBefore.imageId !== dockerAfter.imageId) {
    throw new Error("Issue416 PG17 changed Docker identity during attestation.");
  }
  return Object.freeze({ ...postgres, ...dockerAfter });
}

export async function preflightSanitizedChild(env = process.env) {
  const parent = await preflightIssue416Target(env);
  const { stdout } = await execFileAsync(process.execPath, [
    fileURLToPath(childModule),
  ], {
    env: sanitizedChildEnvironment(env),
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    timeout: 15000,
    windowsHide: true,
    encoding: "utf8",
    maxBuffer: 32 * 1024,
  });
  let child;
  try {
    child = JSON.parse(stdout);
  } catch {
    throw new Error("Issue416 PG17 sanitized child attestation was unreadable.");
  }
  if (parent.containerId !== child.containerId ||
      parent.imageId !== child.imageId ||
      parent.serverStarted !== child.serverStarted ||
      parent.volume !== child.volume) {
    throw new Error("Issue416 PG17 sanitized child target changed before tests.");
  }
  return parent;
}

// Entry gate used before *any* Docker Compose startup. Only reads Docker and
// probes the dedicated loopback port; it never stops or creates a container.
export async function prepareIssue416Compose(env = process.env) {
  assertTargetEnvironment(env);
  await preflightBeforeCompose();
}

if (process.argv[1] &&
    fileURLToPath(import.meta.url).toLowerCase() === process.argv[1].toLowerCase()) {
  try {
    if (process.argv.length !== 3 ||
        !["--prepare", "--inspect"].includes(process.argv[2])) {
      throw new Error("Use --prepare before creating fixture, --inspect after startup.");
    }
    if (process.argv[2] === "--prepare") {
      await prepareIssue416Compose();
      console.log("Issue416 pre-start PASS: dedicated name, volume and port unused.");
    } else {
      await preflightSanitizedChild();
      console.log("Issue416 running PG17 target PASS: parent and child attested.");
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
