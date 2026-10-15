// Recovery is permitted only for this launcher's own partial startup with
// run-labelled MinIO and a missing manifest. Never touch a foreign container.
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { compose, docker, envFile, ownedContainers, runtimeFile } from "./docker-tools.mjs";

if (!existsSync(envFile) || existsSync(runtimeFile))
  throw new Error("Recovery requires task env plus an absent runtime manifest.");
const contents = readFileSync(envFile, "utf8");
const match = /^ISSUE215_S3_RUN_ID=([a-f0-9]{32})$/m.exec(contents);
if (!match) throw new Error("Stale fixture has no verified task run ID.");
const ids = ownedContainers();
if (ids.length !== 1)
  throw new Error("Stale recovery requires exactly one task-labelled container.");
const entry = JSON.parse(docker(["inspect", ids[0]]))[0];
const ports = entry?.NetworkSettings?.Ports?.["9000/tcp"];
if (!entry?.Id?.startsWith(ids[0]) ||
    entry?.Name !== "/issue215-s3-worker4-minio-1" ||
    entry?.State?.Status !== "running" ||
    entry?.Config?.Labels?.["vaylet.run"] !== match[1] ||
    entry?.Config?.Labels?.["vaylet.owner"] !== "issue215-s3-worker4" ||
    entry?.Config?.Labels?.["vaylet.issue"] !== "215" ||
    entry?.Config?.Labels?.["vaylet.task"] !== "282" ||
    entry?.Config?.Labels?.["com.docker.compose.project"] !== "issue215-s3-worker4" ||
    entry?.Config?.Labels?.["com.docker.compose.service"] !== "minio" ||
    entry?.Config?.Image !==
      "cgr.dev/chainguard/minio@sha256:2136d593beacf4461187035eca949fe49abd589d5079735025c711ca58fee0c8" ||
    entry?.Image !==
      "sha256:2136d593beacf4461187035eca949fe49abd589d5079735025c711ca58fee0c8" ||
    !Array.isArray(ports) || ports.length !== 1 ||
    ports[0]?.HostIp !== "127.0.0.1" ||
    !/^[0-9]{2,5}$/.test(ports[0]?.HostPort ?? "") ||
    !entry?.HostConfig?.Tmpfs?.["/data"]?.includes("size=134217728") ||
    !Array.isArray(entry?.Mounts) || entry.Mounts.length !== 0)
  throw new Error("Stale MinIO launch is not provably owned; refusing recovery.");
compose(["down", "-v"]);
if (ownedContainers().length !== 0)
  throw new Error("Owned MinIO remains after recovery; preserving task env.");
unlinkSync(envFile);
process.stdout.write("Recovered exactly one task-owned partial MinIO launch.\n");
