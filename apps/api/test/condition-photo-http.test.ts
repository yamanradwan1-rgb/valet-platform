import "reflect-metadata";
import { Module, type INestApplication, UnauthorizedException } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { HttpInfrastructureModule } from "../src/common/http/http-infrastructure.module";
import { ConditionPhotoAuthGuard } from "../src/modules/check-in-api/condition-photo-auth.guard";
import { ConditionPhotoController } from "../src/modules/check-in-api/condition-photo.controller";
import { CheckInOperationRunner } from "../src/modules/check-in-api/check-in-operation-runner";
import { ConditionPhotoAdmission } from "../src/modules/vehicle-photos/condition-photo-admission";
import { ConditionPhotoBackendService } from "../src/modules/vehicle-photos/condition-photo-backend.service";

const sessionId = "11111111-1111-4111-8111-111111111111";
const operationId = "22222222-2222-4222-8222-222222222222";
const photoId = "33333333-3333-4333-8333-333333333333";
const credential = {
  staffAuthSessionId: "44444444-4444-4444-8444-444444444444",
  userId: "55555555-5555-4555-8555-555555555555",
  accessTokenHash: "test-auth-hash",
  createdAt: new Date("2026-10-15T00:00:00.000Z"),
};
const pending = {
  operationId, valetSessionId: sessionId, status: "PENDING",
  retryAction: "WAIT", retryAfterSeconds: 5,
};
const verified = {
  operationId, valetSessionId: sessionId, status: "VERIFIED",
  vehiclePhotoId: photoId, contentType: "image/jpeg",
  byteSize: 324, verifiedAt: "2026-10-15T00:00:00.000Z",
};

const backend = {
  authorize: vi.fn(async (header: string | undefined) => {
    if (header !== "Bearer ok") throw new UnauthorizedException();
    return { credential, actorMembershipId: "66666666-6666-4666-8666-666666666666" };
  }),
  upload: vi.fn(async () => ({ status: verified, newCommit: true })),
  status: vi.fn(async () => verified),
  reconcile: vi.fn(async () => pending),
  discovery: vi.fn(async () => ({
    valetSessionId: sessionId,
    photoPolicy: { required: true, source: "LOCATION_OVERRIDE" },
    qualifyingPhotoPresent: false,
    pendingOperation: pending,
    latestOperation: null,
  })),
};
const admission = {
  statusRead: vi.fn(async () => ({ allowed: true })),
  uploadStart: vi.fn(async () => ({ allowed: true })),
};

let app: INestApplication;
let url: string;

beforeAll(async () => {
  @Module({
    imports: [HttpInfrastructureModule],
    controllers: [ConditionPhotoController],
    providers: [
      CheckInOperationRunner,
      ConditionPhotoAuthGuard,
      { provide: ConditionPhotoAdmission, useValue: admission },
      { provide: ConditionPhotoBackendService, useValue: backend },
    ],
  })
  class PhotoHttpFixture {}
  app = await NestFactory.create(PhotoHttpFixture, { logger: false });
  await app.listen(0, "127.0.0.1");
  url = await app.getUrl();
}, 20_000);

afterAll(async () => {
  await app?.close();
});

function target(suffix = "condition-photo-uploads") {
  return `${url}/v1/staff/check-in/sessions/${sessionId}/${suffix}`;
}

describe("P2 actual Nest HTTP route and pre-parser guards", () => {
  it("authorizes before parsing and returns a safe 401 no-store response", async () => {
    const before = backend.upload.mock.calls.length;
    const response = await fetch(target(), {
      method: "POST",
      headers: { Authorization: "Bearer bad", "Content-Type": "application/json" },
      body: JSON.stringify({ image: "not allowed" }),
    });
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect((await response.json() as { code: string }).code).not.toBe("INTERNAL_ERROR");
    expect(backend.upload.mock.calls.length).toBe(before);
  });

  it("returns 201 for a new verified upload with no private fields", async () => {
    const parts = new FormData();
    parts.append("operationId", operationId);
    parts.append("image", new Blob([new Uint8Array([255, 216, 255, 217])], {
      type: "image/jpeg",
    }), "synthetic.jpg");
    const response = await fetch(target(), {
      method: "POST",
      headers: { Authorization: "Bearer ok" },
      body: parts,
    });
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const body = await response.json();
    expect(body).toEqual(verified);
    expect(JSON.stringify(body)).not.toMatch(/object_key|bucket|lease|sha256/i);
    expect(backend.upload).toHaveBeenCalled();
  });

  it("provides a strictly read-only GET and scoped state discovery", async () => {
    const status = await fetch(target(`condition-photo-uploads/${operationId}`), {
      headers: { Authorization: "Bearer ok" },
    });
    expect(status.status).toBe(200);
    expect(await status.json()).toEqual(verified);
    const state = await fetch(target("condition-photo-state"), {
      headers: { Authorization: "Bearer ok" },
    });
    expect(state.status).toBe(200);
    expect(await state.json()).toMatchObject({
      qualifyingPhotoPresent: false,
      pendingOperation: pending,
    });
  });

  it("reconcile returns 202 WAIT and rejects unauthorized operation bodies", async () => {
    const response = await fetch(target(`condition-photo-uploads/${operationId}/reconcile`), {
      method: "POST",
      headers: { Authorization: "Bearer ok", "Content-Type": "application/json" },
      body: "{}",
    });
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual(pending);
    const wrong = await fetch(target(`condition-photo-uploads/${operationId}/reconcile`), {
      method: "POST",
      headers: { Authorization: "Bearer ok", "Content-Type": "application/json" },
      body: JSON.stringify({ objectKey: "untrusted" }),
    });
    expect(wrong.status).toBe(400);
  });

  it("invalid multipart can return HTTP 400 rather than resetting the socket", async () => {
    const response = await fetch(target(), {
      method: "POST",
      headers: {
        Authorization: "Bearer ok",
        "Content-Type": "application/octet-stream",
      },
      body: "not-multipart",
    });
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("reports HTTP 413 on declared oversized uploads before parser allocation", async () => {
    const before = backend.upload.mock.calls.length;
    const response = await fetch(target(), {
      method: "POST",
      headers: {
        Authorization: "Bearer ok",
        "Content-Type": "multipart/form-data; boundary=exampleboundary",
        "Content-Length": String(8 * 1024 * 1024 + 16 * 1024 + 1),
      },
      body: Buffer.alloc(8 * 1024 * 1024 + 16 * 1024 + 1),
    });
    expect(response.status).toBe(413);
    expect((await response.json() as { code: string }).code)
      .toBe("CONDITION_PHOTO_TOO_LARGE");
    expect(backend.upload.mock.calls.length).toBe(before);
  });

  it("reports HTTP 413 on a multipart file-size overrun during streaming", async () => {
    const form = new FormData();
    form.append("operationId", operationId);
    form.append("image", new Blob(
      [new Uint8Array(8 * 1024 * 1024 + 1)],
      { type: "image/jpeg" },
    ), "overflow.jpg");
    const response = await fetch(target(), {
      method: "POST",
      headers: { Authorization: "Bearer ok" },
      body: form,
    });
    expect(response.status).toBe(413);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
});
