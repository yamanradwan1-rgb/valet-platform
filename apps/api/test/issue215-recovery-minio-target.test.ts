import { describe, expect, it } from "vitest";
import {
  assertRecoveryMinioDocker,
  assertRecoveryMinioRuntime,
} from "./issue215-recovery-minio-target";

const runtime = {
  endpoint: "http://127.0.0.1:49902",
  bucket: "issue215-s3-worker4",
  containerProject: "issue215-s3-worker4",
  region: "us-east-1",
  temporary: true,
  versioning: true,
  accessKeyId: "issue215app0123456789",
  secretAccessKey: "a".repeat(56),
};
const environment = {
  ISSUE215_REAL_S3_ENABLED: "true",
  ISSUE215_S3_ENDPOINT: runtime.endpoint,
  ISSUE215_S3_BUCKET: runtime.bucket,
  ISSUE215_S3_ACCESS_KEY_ID: runtime.accessKeyId,
  ISSUE215_S3_SECRET_ACCESS_KEY: runtime.secretAccessKey,
};
const container = {
  Id: "3aabca66b44715267505e7222e0e55602675c8a2518c0bd64755737c730752ea",
  Image: "sha256:2136d593beacf4461187035eca949fe49abd589d5079735025c711ca58fee0c8",
  Name: "/issue215-s3-worker4-minio-1",
  Config: {
    Image: "cgr.dev/chainguard/minio@sha256:2136d593beacf4461187035eca949fe49abd589d5079735025c711ca58fee0c8",
    Labels: {
      "com.docker.compose.project": "issue215-s3-worker4",
      "com.docker.compose.service": "minio",
      "vaylet.issue": "215",
      "vaylet.task": "282",
      "vaylet.owner": "issue215-s3-worker4",
    },
  },
  State: { Status: "running" },
  NetworkSettings: {
    Ports: { "9000/tcp": [{ HostIp: "127.0.0.1", HostPort: "49902" }] },
  },
  HostConfig: { Tmpfs: { "/data": "size=134217728,mode=1777" } },
  Mounts: [],
};

describe("#285 live MinIO owner attestation gates database setup", () => {
  it("accepts the exact persisted worker4 fixture and owned Docker identity", () => {
    const accepted = assertRecoveryMinioRuntime(environment, runtime);
    expect(accepted.endpoint).toBe(runtime.endpoint);
    expect(() => assertRecoveryMinioDocker([container], accepted)).not.toThrow();
  });

  it("accepts a newly minted run only with matching exact container ID and run label", () => {
    const fresh = { ...runtime, runId: "a".repeat(32), containerId: "b".repeat(64) };
    const accepted = assertRecoveryMinioRuntime(environment, fresh);
    const attested = {
      ...container, Id: fresh.containerId,
      Config: { ...container.Config, Labels: {
        ...container.Config.Labels, "vaylet.run": fresh.runId,
      } },
    };
    expect(() => assertRecoveryMinioDocker([attested], accepted)).not.toThrow();
    expect(() => assertRecoveryMinioDocker([{
      ...attested, Config: { ...attested.Config, Labels: {
        ...attested.Config.Labels, "vaylet.run": "c".repeat(32),
      } },
    }], accepted)).toThrow();
    expect(() => assertRecoveryMinioDocker([{ ...attested, Id: "c".repeat(64) }],
      accepted)).toThrow();
    expect(() => assertRecoveryMinioDocker([
      { ...attested, Mounts: [{ Type: "volume" }] },
    ], accepted)).toThrow();
  });

  it.each([
    ["foreign endpoint", { endpoint: "http://127.0.0.1:59999" }],
    ["foreign bucket", { bucket: "other" }],
    ["absent versioning", { versioning: false }],
    ["non-ephemeral provider", { temporary: false }],
    ["wrong fixture project", { containerProject: "other" }],
    ["foreign secret", { secretAccessKey: "b".repeat(56) }],
  ])("rejects %s even when local credentials look valid", (_label, changes) => {
    expect(() => assertRecoveryMinioRuntime(environment, {
      ...runtime, ...changes,
    })).toThrow(/live task-owned MinIO fixture/);
  });

  it.each([
    ["changed container", { Id: "b".repeat(64) }],
    ["wrong image", { Config: { ...container.Config, Image: "minio:latest" } }],
    ["stopped service", { State: { Status: "exited" } }],
    ["bound on all addresses", { NetworkSettings: {
      Ports: { "9000/tcp": [{ HostIp: "0.0.0.0", HostPort: "49902" }] },
    } }],
    ["changed mapped port", { NetworkSettings: {
      Ports: { "9000/tcp": [{ HostIp: "127.0.0.1", HostPort: "59999" }] },
    } }],
    ["disk-mounted data", { Mounts: [{ Type: "bind" }] }],
    ["missing temp storage", { HostConfig: { Tmpfs: {} } }],
    ["wrong owner label", { Config: { ...container.Config, Labels: {
      ...container.Config.Labels, "vaylet.owner": "foreign",
    } } }],
  ])("rejects %s before writing DB or object", (_label, changes) => {
    const accepted = assertRecoveryMinioRuntime(environment, runtime);
    expect(() => assertRecoveryMinioDocker([
      { ...container, ...changes },
    ], accepted)).toThrow(/live task-owned MinIO fixture/);
  });
});
