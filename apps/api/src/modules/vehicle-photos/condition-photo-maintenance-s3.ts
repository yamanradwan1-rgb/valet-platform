import { performance } from "node:perf_hooks";

import {
  DeleteObjectCommand,
  ListObjectVersionsCommand,
  type S3Client,
} from "@aws-sdk/client-s3";

import type { PhotoMaintenanceStorage, AbandonedVersion } from "./condition-photo-maintenance-types";
import type { ConditionPhotoStorageConfig } from "./condition-photo-storage-config";

/** Dedicated cleanup S3 principal. This adapter never has a PutObject method. */
export class S3AbandonedPhotoMaintenanceStore implements PhotoMaintenanceStorage {
  constructor(
    private readonly config: ConditionPhotoStorageConfig,
    private readonly cleanupClient: Pick<S3Client, "send">,
  ) {}

  private async request<T>(
    deadlineAtMs: number,
    work: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const remaining = Math.min(15_000, deadlineAtMs - performance.now());
    if (remaining <= 0) throw new Error("Cleanup claim deadline expired.");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remaining);
    try { return await work(controller.signal); }
    finally { clearTimeout(timer); }
  }

  async listExactVersions(key: string, deadlineAtMs: number): Promise<readonly AbandonedVersion[]> {
    // A caller must have already presented a fenced, server-persisted claim.
    if (!/^condition-photo\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/i.test(key))
      throw new Error("Invalid abandoned photo identity.");
    const result: AbandonedVersion[] = [];
    let keyMarker: string | undefined;
    let versionMarker: string | undefined;
    for (let page = 0; page < 2; page++) {
      const listed = await this.request(deadlineAtMs, (signal) => this.cleanupClient.send(
        new ListObjectVersionsCommand({
        Bucket: this.config.bucket,
        Prefix: key,
        MaxKeys: 100,
        ...(keyMarker ? { KeyMarker: keyMarker } : {}),
        ...(versionMarker ? { VersionIdMarker: versionMarker } : {}),
        }), { abortSignal: signal },
      ));
      for (const entry of [...(listed.Versions ?? []), ...(listed.DeleteMarkers ?? [])]) {
        if (entry.Key !== key) continue; // Prefix can return sibling names.
        if (!entry.VersionId || entry.VersionId === "null")
          throw new Error("Unversioned abandoned photo deletion is disabled.");
        result.push({ key, version: entry.VersionId });
      }
      if (result.length > 20) throw new Error("Abandoned photo version cap exceeded.");
      if (!listed.IsTruncated) return result;
      if (!listed.NextKeyMarker || !listed.NextVersionIdMarker ||
          (keyMarker === listed.NextKeyMarker && versionMarker === listed.NextVersionIdMarker))
        throw new Error("Abandoned photo listing continuation is invalid.");
      keyMarker = listed.NextKeyMarker;
      versionMarker = listed.NextVersionIdMarker;
    }
    throw new Error("Abandoned photo version pages exceeded.");
  }

  async deleteExactVersion(version: AbandonedVersion, deadlineAtMs: number): Promise<void> {
    if (!/^condition-photo\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/i.test(version.key) ||
        !version.version || version.version === "null" || version.version.length > 240)
      throw new Error("Invalid exact abandoned photo version.");
    await this.request(deadlineAtMs, (signal) => this.cleanupClient.send(new DeleteObjectCommand({
      Bucket: this.config.bucket,
      Key: version.key,
      VersionId: version.version,
    }), { abortSignal: signal }));
  }
}
