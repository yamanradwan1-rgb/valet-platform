import "reflect-metadata";

import { createRequire } from "node:module";
import { resolve } from "node:path";

import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

// Exercise the compiled production controllers/services. The tsx-only loader
// does not emit Nest constructor design:paramtypes metadata for those modules.
const load = createRequire(resolve(process.cwd(), "package.json"));
const { CheckInModule } = load(resolve(
  process.cwd(), "dist/modules/check-in-api/check-in.module.js",
)) as { CheckInModule: typeof import("../src/modules/check-in-api/check-in.module").CheckInModule };
const { S3PrivatePhotoStore } = load(resolve(
  process.cwd(), "dist/modules/vehicle-photos/s3-private-photo-store.js",
)) as {
  S3PrivatePhotoStore: typeof import("../src/modules/vehicle-photos/s3-private-photo-store").S3PrivatePhotoStore;
};

// A real out-of-process Nest CheckInModule with the production controllers,
// Staff bearer guard, runtime role and S3 adapter. Only the disposable crash
// child inserts a barrier AFTER MinIO provider ACK but BEFORE readback/T2.
if (process.env.ISSUE215_NEST_CHILD_CRASH === "true") {
  const original = S3PrivatePhotoStore.prototype.putIfAbsent;
  S3PrivatePhotoStore.prototype.putIfAbsent = async function(key, bytes, deadlineMs) {
    const committed = await original.call(this, key, bytes, deadlineMs);
    process.send?.({
      event: "put-acknowledged", key, version: committed.version,
    });
    return await new Promise<never>(() => undefined);
  };
}

@Module({ imports: [CheckInModule] })
class Issue215NestCrashFixture {}

async function start(): Promise<void> {
  if (process.env.NODE_ENV !== "test" ||
      process.env.ISSUE215_NEST_CHILD_OWNED !== "true" ||
      process.env.ISSUE215_REAL_HTTP_ENABLED !== "true" ||
      !process.send)
    throw new Error("Task-owned Nest process required.");
  const app = await NestFactory.create(Issue215NestCrashFixture, {
    logger: false, abortOnError: false,
  });
  await app.listen(0, "127.0.0.1");
  process.send({
    event: "ready", baseUrl: await app.getUrl(),
  });
}

void start().catch((error: unknown) => {
  const cause = error instanceof Error ? error.message : "Unknown Nest startup failure";
  const safe = cause.replace(/postgres(?:ql)?:\/\/\S+/gi, "[DATABASE]")
    .replace(/(?:secret|password|token)\s*[:=]\s*\S+/gi, "[REDACTED]")
    .slice(0, 400);
  process.stderr.write(`Owned Nest failed to start: ${safe}\n`);
  process.send?.({ event: "bootstrap-error", cause: safe });
  process.exitCode = 1;
});
