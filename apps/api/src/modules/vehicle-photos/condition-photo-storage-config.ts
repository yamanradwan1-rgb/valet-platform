/** Deployment-owned private storage settings. No client-provided URL is allowed. */
export interface ConditionPhotoStorageConfig {
  readonly bucket: string;
  readonly bucketAlias: string;
  readonly endpoint: string;
  readonly region: string;
  readonly allowTestHttp: boolean;
}

const bucketPattern = /^(?!.*\.\.)(?!.*\.-)(?!.*-\.)(?!.*\.$)[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
const aliasPattern = /^[a-z][a-z0-9_-]{0,59}$/;

export function resolveConditionPhotoStorageConfig(
  environment: NodeJS.ProcessEnv = process.env,
): ConditionPhotoStorageConfig | undefined {
  if (environment.CONDITION_PHOTO_STORAGE_ENABLED !== "true") return undefined;
  const bucket = environment.CONDITION_PHOTO_PRIVATE_BUCKET ?? "";
  const bucketAlias = environment.CONDITION_PHOTO_BUCKET_ALIAS ?? "";
  const region = environment.CONDITION_PHOTO_STORAGE_REGION ?? "";
  const rawEndpoint = environment.CONDITION_PHOTO_STORAGE_ENDPOINT;
  if (!bucketPattern.test(bucket) || !aliasPattern.test(bucketAlias) ||
      !/^[a-z0-9-]{2,32}$/.test(region) || rawEndpoint === undefined)
    throw new Error("Private condition-photo storage configuration is invalid.");

  let url: URL;
  try { url = new URL(rawEndpoint); }
  catch { throw new Error("Private condition-photo storage configuration is invalid."); }
  const allowTestHttp = environment.NODE_ENV === "test" &&
    environment.CONDITION_PHOTO_ALLOW_TEST_HTTP === "true" &&
    url.protocol === "http:" && url.hostname === "127.0.0.1";
  // An explicit deployment-owner gate is required in addition to enabling
  // this feature. The flag is NOT provider qualification evidence by itself.
  if (environment.NODE_ENV !== "test" &&
      environment.CONDITION_PHOTO_STORAGE_PROVIDER_APPROVED !== "true")
    throw new Error("Private condition-photo storage configuration is invalid.");
  if ((!allowTestHttp && url.protocol !== "https:") ||
      url.username !== "" || url.password !== "" ||
      url.search !== "" || url.hash !== "" ||
      url.pathname !== "/" || url.hostname === "")
    throw new Error("Private condition-photo storage configuration is invalid.");

  return { bucket, bucketAlias, region, endpoint: url.origin, allowTestHttp };
}
