import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface RealStorageIdentity {
  readonly endpoint: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly containerId?: string;
  readonly runId?: string;
  readonly imageId?: string;
}

const project = "issue215-s3-worker4";
const errorMessage = "Issue 215 recovery requires the live task-owned MinIO fixture.";
const expectedId = "3aabca66b44715267505e7222e0e55602675c8a2518c0bd64755737c730752ea";
const expectedImage =
  "cgr.dev/chainguard/minio@sha256:2136d593beacf4461187035eca949fe49abd589d5079735025c711ca58fee0c8";

export function pinnedRecoveryMinioImageId(): string {
  try {
    const observed = execFileSync("docker", [
      "image", "inspect", expectedImage, "--format", "{{.Id}}",
    ], { encoding: "utf8", timeout: 5_000, windowsHide: true, stdio: "pipe" }).trim();
    if (!/^sha256:[a-f0-9]{64}$/.test(observed)) throw new Error(errorMessage);
    return observed;
  } catch {
    throw new Error(errorMessage);
  }
}

export function assertRecoveryMinioRuntime(
  environment: NodeJS.ProcessEnv,
  fixture: Record<string, unknown>,
): RealStorageIdentity {
  const { endpoint, bucket, accessKeyId, secretAccessKey } = fixture;
  const fresh = fixture.containerId !== undefined || fixture.runId !== undefined;
  if (fresh && (typeof fixture.containerId !== "string" ||
      !/^[a-f0-9]{64}$/.test(fixture.containerId) ||
      typeof fixture.runId !== "string" ||
      !/^[a-f0-9]{32}$/.test(fixture.runId)))
    throw new Error(errorMessage);
  if (environment.ISSUE215_REAL_S3_ENABLED !== "true" ||
      fixture.containerProject !== project || fixture.versioning !== true ||
      fixture.temporary !== true || fixture.region !== "us-east-1" ||
      typeof endpoint !== "string" ||
      !/^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(endpoint) ||
      bucket !== project ||
      typeof accessKeyId !== "string" ||
      !/^issue215app[a-f0-9]{10}$/.test(accessKeyId) ||
      typeof secretAccessKey !== "string" ||
      !/^[a-f0-9]{56}$/.test(secretAccessKey) ||
      environment.ISSUE215_S3_ENDPOINT !== endpoint ||
      environment.ISSUE215_S3_BUCKET !== bucket ||
      environment.ISSUE215_S3_ACCESS_KEY_ID !== accessKeyId ||
      environment.ISSUE215_S3_SECRET_ACCESS_KEY !== secretAccessKey)
    throw new Error(errorMessage);
  return {
    endpoint, bucket, accessKeyId, secretAccessKey,
    ...(fresh ? { containerId: fixture.containerId as string,
      runId: fixture.runId as string } : {}),
  };
}

export function assertRecoveryMinioDocker(
  containers: unknown,
  runtime: RealStorageIdentity,
): void {
  if (!Array.isArray(containers) || containers.length !== 1)
    throw new Error(errorMessage);
  const container = containers[0];
  const labels = container?.Config?.Labels;
  const ports = container?.NetworkSettings?.Ports?.["9000/tcp"];
  const hostPort = new URL(runtime.endpoint).port;
  const bound = runtime;
  if (bound.imageId !== undefined &&
      !/^sha256:[a-f0-9]{64}$/.test(bound.imageId))
    throw new Error(errorMessage);
  const fresh = typeof bound.containerId === "string" &&
    /^[a-f0-9]{64}$/.test(bound.containerId) &&
    typeof bound.runId === "string" && /^[a-f0-9]{32}$/.test(bound.runId);
  const oldPinned = bound.containerId === undefined && bound.runId === undefined &&
    container?.Id === expectedId;
  if ((!fresh && !oldPinned) ||
      (fresh && (container?.Id !== bound.containerId ||
        labels?.["vaylet.run"] !== bound.runId)) ||
      container?.Name !== `/${project}-minio-1` ||
      container?.Config?.Image !== expectedImage ||
      container?.Image !== (bound.imageId ??
        "sha256:2136d593beacf4461187035eca949fe49abd589d5079735025c711ca58fee0c8") ||
      container?.State?.Status !== "running" ||
      labels?.["com.docker.compose.project"] !== project ||
      labels?.["com.docker.compose.service"] !== "minio" ||
      labels?.["vaylet.issue"] !== "215" ||
      labels?.["vaylet.task"] !== "282" ||
      labels?.["vaylet.owner"] !== project ||
      !Array.isArray(ports) || ports.length !== 1 ||
      ports[0]?.HostIp !== "127.0.0.1" ||
      ports[0]?.HostPort !== hostPort ||
      typeof container?.HostConfig?.Tmpfs?.["/data"] !== "string" ||
      !container.HostConfig.Tmpfs["/data"].includes("size=134217728") ||
      !Array.isArray(container.Mounts) ||
      (fresh ? container.Mounts.length !== 0 :
        container.Mounts.some((item: { Type?: string }) => item.Type === "bind")))
    throw new Error(errorMessage);
}

/** Run before any test database creation or S3 request; errors are secret-free. */
export function proveRecoveryRealMinio(): RealStorageIdentity {
  try {
    const path = resolve(process.cwd(), "../../scripts/issue215-local-s3/.runtime.json");
    const fixture = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    const runtime = assertRecoveryMinioRuntime(process.env, fixture);
    const ids = execFileSync("docker", [
      "ps", "-q", "--filter", `label=com.docker.compose.project=${project}`,
    ], { encoding: "utf8", timeout: 5_000, windowsHide: true, stdio: "pipe" })
      .trim().split(/\s+/).filter(Boolean);
    if (ids.length !== 1) throw new Error(errorMessage);
    const containers = JSON.parse(execFileSync("docker", ["inspect", ids[0]!], {
      encoding: "utf8", timeout: 5_000, windowsHide: true, stdio: "pipe",
    })) as unknown;
    assertRecoveryMinioDocker(containers, {
      ...runtime, imageId: pinnedRecoveryMinioImageId(),
    });
    return runtime;
  } catch {
    throw new Error(errorMessage);
  }
}
