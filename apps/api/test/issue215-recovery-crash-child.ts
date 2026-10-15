import { S3Client } from "@aws-sdk/client-s3";

import { S3PrivatePhotoStore } from "../src/modules/vehicle-photos/s3-private-photo-store";

interface CrashRequest {
  readonly key: string;
  readonly canonicalJpeg: string;
  readonly endpoint: string;
  readonly bucket: string;
  readonly bucketAlias: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
}

// Owned OS subprocess runs the actual signed conditional PUT on a persisted
// T1 key. Parent kills this process after provider ACK, before readback/T2.
// Import only the storage adapter: raw Node child does not depend on bundled
// workspace @valet/contracts assets needed by production executors.
process.once("message", (message: CrashRequest) => {
  void (async () => {
    const client = new S3Client({
      region: "us-east-1", endpoint: message.endpoint, forcePathStyle: true,
      maxAttempts: 1,
      credentials: {
        accessKeyId: message.accessKeyId,
        secretAccessKey: message.secretAccessKey,
      },
    });
    const store = new S3PrivatePhotoStore({
      bucket: message.bucket, bucketAlias: message.bucketAlias,
      region: "us-east-1", endpoint: message.endpoint, allowTestHttp: true,
    }, client);
    await store.putIfAbsent(message.key, Buffer.from(message.canonicalJpeg, "base64"));
    process.send?.({ event: "put-acknowledged", key: message.key });
    await new Promise<never>(() => undefined);
  })().catch(() => process.send?.({ event: "error" }));
});
