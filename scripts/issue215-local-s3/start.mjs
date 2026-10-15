import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  bucket, compose, docker, envFile, folder, mcImage,
  ownedContainers, project, runtimeFile,
} from "./docker-tools.mjs";

const secret = (bytes) => randomBytes(bytes).toString("hex");
if (existsSync(envFile) || existsSync(runtimeFile) || ownedContainers().length > 0)
  throw new Error("Issue #215 S3 fixture already exists; inspect it or use stop.mjs first.");

const rootUser = `issue215root${secret(5)}`;
const rootPassword = secret(28);
const appUser = `issue215app${secret(5)}`;
const appPassword = secret(28);
const env = [
  `ISSUE215_S3_ROOT_USER=${rootUser}`,
  `ISSUE215_S3_ROOT_PASSWORD=${rootPassword}`,
  `ISSUE215_S3_KMS_SECRET_KEY=issue215-test:${randomBytes(32).toString("base64")}`,
].join("\n") + "\n";
writeFileSync(envFile, env, { flag: "wx", mode: 0o600 });

function mc(...args) {
  return docker([
    "run", "--rm", "--network", `${project}_default`,
    "-e", `MC_HOST_issue215=http://${rootUser}:${rootPassword}@minio:9000`,
    "-v", `${join(folder, "app-policy.json")}:/issue215-policy.json:ro`,
    mcImage, ...args,
  ]);
}

async function start() {
  compose(["up", "-d"]);
  if (ownedContainers().length !== 1)
    throw new Error("MinIO ownership cannot be proved after startup.");
  const mapped = compose(["port", "minio", "9000"]);
  const match = /^127\.0\.0\.1:(\d+)$/.exec(mapped);
  if (!match) throw new Error(`Unexpected non-loopback MinIO port: ${mapped}`);
  const endpoint = `http://127.0.0.1:${match[1]}`;

  let healthy = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(`${endpoint}/minio/health/live`, {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.status === 200) { healthy = true; break; }
    } catch { /* Startup may not yet be listening. */ }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  if (!healthy) throw new Error("Isolated MinIO did not become healthy.");

  mc("mb", `issue215/${bucket}`);
  mc("version", "enable", `issue215/${bucket}`);
  mc("anonymous", "set", "none", `issue215/${bucket}`);
  mc("admin", "user", "add", "issue215", appUser, appPassword);
  mc("admin", "policy", "create", "issue215", "issue215-photoapp", "/issue215-policy.json");
  mc("admin", "policy", "attach", "issue215", "issue215-photoapp", "--user", appUser);

  writeFileSync(runtimeFile, JSON.stringify({
    endpoint, bucket, region: "us-east-1",
    accessKeyId: appUser, secretAccessKey: appPassword,
    containerProject: project, versioning: true, temporary: true,
  }, null, 2), { flag: "wx", mode: 0o600 });
  console.log(`READY: disposable MinIO at ${endpoint}, bucket=${bucket}, versioning enabled.`);
  console.log("Run: node scripts/issue215-local-s3/run.mjs");
  console.log("Stop: node scripts/issue215-local-s3/stop.mjs");
}
await start();
