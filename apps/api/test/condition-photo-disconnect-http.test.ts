import "reflect-metadata";
import { Module, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

import { HttpInfrastructureModule } from "../src/common/http/http-infrastructure.module";
import { CheckInOperationRunner } from "../src/modules/check-in-api/check-in-operation-runner";
import { ConditionPhotoAuthGuard } from "../src/modules/check-in-api/condition-photo-auth.guard";
import { ConditionPhotoController } from "../src/modules/check-in-api/condition-photo.controller";
import { ConditionPhotoAdmission } from "../src/modules/vehicle-photos/condition-photo-admission";
import { ConditionPhotoBackendService } from "../src/modules/vehicle-photos/condition-photo-backend.service";
import { canonicalizeConditionJpeg } from "../src/modules/vehicle-photos/condition-photo-jpeg-decoder";
import { conditionPhotoDecodeQueue } from "../src/modules/vehicle-photos/condition-photo-decode-queue";
import { conditionPhotoProcessingMetrics as metrics } from "../src/modules/vehicle-photos/condition-photo-processing-metrics";

let app: INestApplication;
let url: string;
let entered: () => void;
const sessionId = "11111111-1111-4111-8111-111111111111";
const operationId = "22222222-2222-4222-8222-222222222222";

beforeAll(async () => {
  @Module({
    imports: [HttpInfrastructureModule],
    controllers: [ConditionPhotoController],
    providers: [
      CheckInOperationRunner,
      ConditionPhotoAuthGuard,
      {
        provide: ConditionPhotoAdmission,
        useValue: {
          statusRead: async () => ({ allowed: true }),
          uploadStart: async () => ({ allowed: true }),
        },
      },
      {
        provide: ConditionPhotoBackendService,
        useValue: {
          // Transport-only fixture: auth correctness belongs to the real-PG suites.
          authorize: async () => ({
            credential: {},
            actorMembershipId: operationId,
          }),
          upload: async (
            _credential: unknown,
            _session: string,
            _operation: string,
            bytes: Buffer,
            signal: AbortSignal,
          ) => {
            const decoding = canonicalizeConditionJpeg(bytes, signal);
            entered();
            await decoding;
            throw new Error("Queued cancelled upload must never complete");
          },
        },
      },
    ],
  })
  class DisconnectFixture {}
  app = await NestFactory.create(DisconnectFixture, { logger: false });
  await app.listen(0, "127.0.0.1");
  url = await app.getUrl();
});
afterAll(async () => {
  await app?.close();
});

describe("actual HTTP disconnect reaches JPEG admission", () => {
  it("removes a queued decode and releases multipart ingress after response disconnect", async () => {
    const bytes = await sharp({
      create: { width: 16, height: 12, channels: 3, background: "red" },
    })
      .jpeg()
      .toBuffer();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const held = [
      conditionPhotoDecodeQueue.execute(1, () => gate),
      conditionPhotoDecodeQueue.execute(1, () => gate),
    ];
    const atBackend = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const controller = new AbortController();
    const form = new FormData();
    form.append("operationId", operationId);
    form.append(
      "image",
      new Blob([new Uint8Array(bytes)], { type: "image/jpeg" }),
      "test.jpg",
    );
    const request = fetch(
      `${url}/v1/staff/check-in/sessions/${sessionId}/condition-photo-uploads`,
      {
        method: "POST",
        headers: { Authorization: "Bearer synthetic-transport-test" },
        body: form,
        signal: controller.signal,
      },
    ).then(
      (response) => ({ response, error: undefined }),
      (error: unknown) => ({ response: undefined, error }),
    );
    try {
      await Promise.race([
        atBackend,
        request.then((result) => {
          throw new Error(
            `Request ended before queue admission: ${result.response?.status}`,
          );
        }),
      ]);
      expect(metrics.waiting).toBe(1);
      controller.abort();
      expect((await request).error).toBeInstanceOf(Error);
      await vi.waitFor(() => {
        expect(metrics.waiting).toBe(0);
        expect(metrics.ingressActive).toBe(0);
      });
      expect(metrics.active).toBe(2);
    } finally {
      controller.abort();
      release();
      await Promise.all(held);
    }
    expect(metrics.active).toBe(0);
  });
});
