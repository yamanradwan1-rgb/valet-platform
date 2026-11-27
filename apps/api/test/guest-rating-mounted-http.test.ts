import "reflect-metadata";
import { request as httpRequest } from "node:http";

import {
  Module,
  type INestApplication,
} from "@nestjs/common";
import { APP_FILTER, NestFactory } from "@nestjs/core";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiExceptionFilter } from "../src/common/http/api-exception.filter";
import { ApiOperationRunner } from "../src/common/http/api-operation-runner";
import {
  MONOTONIC_CLOCK,
  OPERATION_OBSERVER,
} from "../src/common/observability/operation-observability";
import { GuestCredentialAuthorizer } from "../src/modules/guest-access/guest-credential-authorizer";
import { GuestRatingController } from "../src/modules/guest-access/guest-rating.controller";
import { GuestRatingService } from "../src/modules/guest-access/guest-rating.service";

const visit = "00000000-0000-4000-8000-000000000003";
const testCredential = { kind: "LEGACY_BEARER" as const, secret: "A".repeat(43) };
const secret = "PRIVATE_COMMENT_SENTINEL_463";
const submit = vi.fn(async (...args: [unknown, unknown, number, unknown?]) => ({
  rating: args[2], ratedAt: "2026-11-27T10:00:00.000Z", valetSessionId: visit,
}));
const authorize = vi.fn(async (_request: unknown, _options: unknown,
  action: (reservation: unknown, credential: typeof testCredential) => Promise<unknown>) =>
  action({ id: "synthetic-admission" }, testCredential));

@Module({
  controllers: [GuestRatingController],
  providers: [
    ApiOperationRunner,
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: GuestRatingService, useValue: { submit } },
    { provide: GuestCredentialAuthorizer, useValue: { authorize } },
    { provide: MONOTONIC_CLOCK, useValue: { now: () => 1 } },
    { provide: OPERATION_OBSERVER, useValue: { observe: () => undefined } },
  ],
})
class ActualRatingControllerModule {}

async function send(
  port: number,
  bytes: Buffer,
  contentType = "application/json",
): Promise<{ status: number; body: Record<string, unknown>; raw: string; headers: Headers }> {
  return new Promise((resolve, reject) => {
    const request = httpRequest({
      host: "127.0.0.1",
      port,
      path: "/v1/guest/session/rating",
      method: "POST",
      headers: {
        "content-type": contentType,
        "content-length": String(bytes.length),
        authorization: "Bearer " + testCredential.secret,
      },
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve({
          status: response.statusCode ?? 0,
          body: JSON.parse(raw) as Record<string, unknown>,
          raw,
          headers: new Headers(
            Object.entries(response.headers)
              .filter((entry): entry is [string, string] =>
                typeof entry[1] === "string"),
          ),
        });
      });
    });
    request.on("error", reject);
    request.end(bytes);
  });
}

const json = (value: unknown) => Buffer.from(JSON.stringify(value), "utf8");

describe("Issue #463 mounted real GuestRatingController HTTP adapter (no DB)", () => {
  let app: INestApplication;
  let port: number;

  beforeAll(async () => {
    app = await NestFactory.create(ActualRatingControllerModule, {
      logger: false,
      rawBody: true,
      forceCloseConnections: true,
    });
    await app.listen(0, "127.0.0.1");
    port = (app.getHttpServer().address() as { port: number }).port;
  });
  afterAll(async () => app?.close());
  beforeEach(() => {
    submit.mockClear();
    authorize.mockClear();
  });

  it("preserves the three-key legacy success without invoking new SQL mode", async () => {
    const response = await send(port, json({ rating: 4 }));
    expect(response.status).toBe(200);
    expect(Object.keys(response.body).sort()).toEqual([
      "ratedAt", "rating", "valetSessionId",
    ]);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(submit).toHaveBeenCalledWith(
      expect.anything(), testCredential, 4,
    );
  });

  it("accepts strict scoped variant with canonicalized comment and exact response", async () => {
    const response = await send(port, json({
      rating: 5, expectedValetSessionId: visit, comment: "  مرحبا\r\n" + secret + "  ",
    }));
    expect(response.status).toBe(200);
    expect(submit).toHaveBeenCalledWith(
      expect.anything(), testCredential, 5,
      { expectedValetSessionId: visit, comment: "مرحبا\n" + secret },
    );
    expect(response.raw).not.toContain(secret);
    expect(response.body).not.toHaveProperty("comment");
  });

  it.each([
    [{ rating: 3, comment: secret }, 400],
    [{ rating: 3, expectedValetSessionId: visit, comment: " ".repeat(1001) }, 400],
    [{ rating: 3, expectedValetSessionId: visit, comment: "\ud800" }, 400],
    [{ rating: 3, expectedValetSessionId: visit, comment: "\u202e" }, 400],
    [{ rating: 3, expectedValetSessionId: visit, comment: 7 }, 400],
    [{ rating: 3, expectedValetSessionId: visit, extra: secret }, 400],
    [{ rating: "3" }, 400],
  ])("rejects invalid or unscoped shape %#", async (body, expected) => {
    const response = await send(port, json(body));
    expect(response.status).toBe(expected);
    expect(response.body.code).toBe("REQUEST_INVALID");
    expect(response.raw).not.toContain(secret);
    expect(submit).not.toHaveBeenCalled();
  });

  it.each(["c328", "c0af", "eda080", "f4908080", "e282"])(
    "rejects malformed raw UTF8 bytes %s without converting to replacement",
    async (hex) => {
      const head = Buffer.from('{"rating":4,"expectedValetSessionId":"' +
        visit + '","comment":"' + secret, "ascii");
      const tail = Buffer.from('"}', "ascii");
      const response = await send(
        port, Buffer.concat([head, Buffer.from(hex, "hex"), tail]),
      );
      expect(response.status).toBe(400);
      expect(response.body.code).toBe("REQUEST_INVALID");
      expect(response.raw).not.toContain(secret);
      expect(response.raw).not.toContain("\ufffd");
      expect(submit).not.toHaveBeenCalled();
    },
  );

  it("accepts genuinely encoded U+FFFD and rejects broken JSON", async () => {
    const valid = await send(port, json({
      rating: 4, expectedValetSessionId: visit, comment: "literal\ufffd",
    }));
    expect(valid.status).toBe(200);
    const invalid = await send(
      port, Buffer.from('{"rating":4,"expectedValetSessionId":', "ascii"),
    );
    expect(invalid.status).toBe(400);
    expect(invalid.raw).not.toContain(secret);
  });

  it("does not widen legacy media type handling, but requires JSON for scoped", async () => {
    const legacy = await send(port, json({ rating: 5 }), "text/plain");
    expect(legacy.status).toBe(400);
    const scoped = await send(port, json({
      rating: 4, expectedValetSessionId: visit,
    }), "text/plain");
    expect(scoped.status).toBe(400);
  });
});
