import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CreateBucketCommand, HeadBucketCommand, ListObjectsV2Command, S3Client,
} from "@aws-sdk/client-s3";

const environmentPath = resolve(process.cwd(), "../../tmp/wa310-runtime/compose.env");
const settings = Object.fromEntries(readFileSync(environmentPath, "utf8")
  .trim().split("\n").map((row) => {
    const equals = row.indexOf("=");
    return [row.slice(0, equals), row.slice(equals + 1).trim()];
  }));
if (process.env.NODE_ENV !== "test" ||
    process.env.OUTBOUND_MESSAGING_SEND_ENABLED !== "false" ||
    settings.WA310_MINIO_USER?.startsWith("wa310") !== true) {
  throw new Error("Issue310 MinIO provisioning requires test-only isolated credentials.");
}
const bucket = "wa310-condition-private";
const storage = new S3Client({
  endpoint: "http://127.0.0.1:59310",
  region: "us-east-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId: settings.WA310_MINIO_USER,
    secretAccessKey: settings.WA310_MINIO_PASSWORD,
  },
});
async function main(): Promise<void> {
try {
  try {
    await storage.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status !== 404) throw error;
    await storage.send(new CreateBucketCommand({ Bucket: bucket }));
  }
  const objects = await storage.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 2 }));
  if ((objects.Contents?.length ?? 0) !== 0) {
    throw new Error("Expected a newly isolated and empty Issue310 bucket.");
  }
  console.log(`PASS: isolated MinIO bucket '${bucket}' exists and is empty; credentials withheld.`);
} finally {
  storage.destroy();
}
}

void main();
