import {
  DeleteObjectCommand, ListObjectVersionsCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";

import { S3AbandonedPhotoMaintenanceStore } from "../src/modules/vehicle-photos/condition-photo-maintenance-s3";

const key = "condition-photo/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222";
const config = {
  bucket: "maintenance-owned-bucket", bucketAlias: "fixture",
  endpoint: "http://127.0.0.1:9000", region: "us-east-1", allowTestHttp: true,
};

describe("P5 versioned S3 cleanup identity", () => {
  it("limits listing to persisted key and sends only version-specific DELETE", async () => {
    const send = vi.fn(async (command: unknown) => {
      if (command instanceof ListObjectVersionsCommand) return {
        Versions: [
          { Key: key, VersionId: "immutable-version-1" },
          { Key: `${key}-sibling`, VersionId: "do-not-touch" },
        ],
        DeleteMarkers: [{ Key: key, VersionId: "delete-marker" }],
      };
      return {};
    });
    const adapter = new S3AbandonedPhotoMaintenanceStore(config, {
      send,
    } as unknown as Pick<S3Client, "send">);
    const versions = await adapter.listExactVersions(key, Date.now() + 60_000);
    expect(versions).toEqual([
      { key, version: "immutable-version-1" },
      { key, version: "delete-marker" },
    ]);
    for (const version of versions) await adapter.deleteExactVersion(version, Date.now() + 60_000);
    expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(ListObjectVersionsCommand);
    const deletes = send.mock.calls.slice(1).map(([command]) => command);
    expect(deletes.every((command) => command instanceof DeleteObjectCommand)).toBe(true);
    expect(deletes.map((command) => (command as DeleteObjectCommand).input)).toEqual([
      { Bucket: config.bucket, Key: key, VersionId: "immutable-version-1" },
      { Bucket: config.bucket, Key: key, VersionId: "delete-marker" },
    ]);
  });

  it("fails closed on unversioned objects or untrustworthy pagination", async () => {
    const unversioned = new S3AbandonedPhotoMaintenanceStore(config, {
      send: async () => ({ Versions: [{ Key: key, VersionId: "null" }] }),
    } as unknown as Pick<S3Client, "send">);
    await expect(unversioned.listExactVersions(key, Date.now() + 60_000)).rejects.toThrow(/Unversioned/);
    const badPagination = new S3AbandonedPhotoMaintenanceStore(config, {
      send: async () => ({ IsTruncated: true, Versions: [] }),
    } as unknown as Pick<S3Client, "send">);
    await expect(badPagination.listExactVersions(key, Date.now() + 60_000)).rejects.toThrow(/continuation/);
    await expect(badPagination.deleteExactVersion({ key, version: "null" }, Date.now() + 60_000))
      .rejects.toThrow(/Invalid exact/);
  });
});
