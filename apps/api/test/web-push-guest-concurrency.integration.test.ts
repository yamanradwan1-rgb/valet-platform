import { createHash, randomBytes, randomUUID } from "node:crypto";

import { type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module";
import {
  configureWebPushTestEnvironment,
  pushInput,
  WebPushTestContext,
} from "./web-push-test-context";

interface HttpResult {
  readonly body: Record<string, unknown>;
  readonly status: number;
}

const context = new WebPushTestContext();
let app: INestApplication;
let baseUrl: string;

async function startApp(): Promise<INestApplication> {
  const instance = await NestFactory.create(AppModule, { logger: false });
  await instance.listen(0, "127.0.0.1");
  return instance;
}

function url(instance: INestApplication): string {
  const address = instance.getHttpServer().address() as { port: number };
  return `http://127.0.0.1:${address.port}`;
}

async function request(
  audience: "guest" | "staff",
  token: string,
  method: "DELETE" | "POST" | "PUT",
  input?: ReturnType<typeof pushInput>,
  id?: string,
  target = baseUrl,
): Promise<HttpResult> {
  const response = await fetch(
    `${target}/v1/${audience}/web-push/subscriptions${id === undefined ? "" : `/${id}`}`,
    {
      ...(input === undefined ? {} : { body: JSON.stringify(input) }),
      headers: {
        Authorization: `Bearer ${token}`,
        ...(input === undefined ? {} : { "Content-Type": "application/json" }),
        "X-Request-Id": randomUUID(),
      },
      method,
    },
  );
  return {
    body: (await response.json()) as Record<string, unknown>,
    status: response.status,
  };
}

beforeAll(async () => {
  await context.setup();
  process.env.DATABASE_URL = context.runtimeUrl;
  process.env.ANTI_ABUSE_HMAC_SECRET_B64URL =
    randomBytes(32).toString("base64url");
  process.env.ANTI_ABUSE_TRUSTED_PROXY_CIDRS = "";
  configureWebPushTestEnvironment(true);
  app = await startApp();
  baseUrl = url(app);
}, 120_000);

afterAll(async () => {
  await app?.close();
  await context.teardown();
}, 60_000);

describe("T2 Guest and concurrency subscription rules", () => {
  it("binds Guest subscriptions to exact session and generation", async () => {
    const guest = await context.createGuest();
    const other = await context.createGuest();
    const input = pushInput("https://push.test/guest-context");
    const first = await request("guest", guest.rawToken, "POST", input);
    const id = String(first.body.id);
    expect(first).toMatchObject({ body: { audience: "GUEST" }, status: 200 });
    expect(JSON.stringify(first.body)).not.toContain(guest.accessGeneration);
    expect(await context.subscription(id)).toMatchObject({
      guest_access_generation: guest.accessGeneration,
      guest_valet_session_id: guest.sessionId,
    });
    expect(
      await request(
        "guest",
        guest.rawToken,
        "POST",
        pushInput(input.endpoint, "ar"),
      ),
    ).toMatchObject({ body: { id, locale: "ar" }, status: 200 });
    expect(await request("guest", other.rawToken, "POST", input)).toMatchObject(
      { status: 409 },
    );
    expect(
      await request("guest", other.rawToken, "DELETE", undefined, id),
    ).toMatchObject({ status: 404 });
    expect(
      await request("guest", guest.rawToken, "DELETE", undefined, id),
    ).toMatchObject({ body: { status: "DISABLED" }, status: 200 });
  });

  it("invalidates old Guest generations for replace and unsubscribe", async () => {
    const guest = await context.createGuest();
    const other = await context.createGuest();
    const endpoint = "https://push.test/guest-rotate";
    const created = await request(
      "guest",
      guest.rawToken,
      "POST",
      pushInput(endpoint),
    );
    const id = String(created.body.id);
    await context.adminPool.query(
      "UPDATE valet_sessions SET customer_access_generation = gen_random_uuid() WHERE id = $1",
      [guest.sessionId],
    );
    expect(
      await request(
        "guest",
        guest.rawToken,
        "PUT",
        pushInput("https://push.test/guest-after-rotate"),
        id,
      ),
    ).toMatchObject({ status: 404 });
    expect(
      await request("guest", guest.rawToken, "DELETE", undefined, id),
    ).toMatchObject({ status: 404 });
    expect(
      await request("guest", other.rawToken, "POST", pushInput(endpoint)),
    ).toMatchObject({ body: { status: "ACTIVE" }, status: 200 });
    expect(await context.subscription(id)).toMatchObject({
      disabled_reason: "GUEST_ACCESS_CHANGED",
      endpoint_ciphertext: null,
    });
  });

  it("denies revoked, expired, and completed Guest authority", async () => {
    for (const update of [
      "customer_access_revoked_at = now()",
      "customer_access_expires_at = now() - interval '1 second'",
      "state = 'COMPLETED', completed_at = now()",
    ]) {
      const guest = await context.createGuest();
      await context.adminPool.query(
        `UPDATE valet_sessions SET ${update} WHERE id = $1`,
        [guest.sessionId],
      );
      expect(
        await request(
          "guest",
          guest.rawToken,
          "POST",
          pushInput(`https://push.test/denied-${randomUUID()}`),
        ),
      ).toMatchObject({ status: 401 });
    }
  });

  it("serializes same-owner and competing-owner endpoint races", async () => {
    const owner = await context.createStaff();
    const other = await context.createStaff();
    const same = pushInput("https://push.test/concurrent-same");
    const sameResults = await Promise.all([
      request("staff", owner.accessToken, "POST", same),
      request("staff", owner.accessToken, "POST", same),
    ]);
    expect(new Set(sameResults.map((result) => result.body.id)).size).toBe(1);
    const competing = pushInput("https://push.test/concurrent-other");
    const results = await Promise.all([
      request("staff", owner.accessToken, "POST", competing),
      request("staff", other.accessToken, "POST", competing),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
  });

  it("keeps unsubscribe versus replace races tombstoned", async () => {
    const staff = await context.createStaff();
    const created = await request(
      "staff",
      staff.accessToken,
      "POST",
      pushInput("https://push.test/unsubscribe-race"),
    );
    const id = String(created.body.id);
    await Promise.allSettled([
      request("staff", staff.accessToken, "DELETE", undefined, id),
      request(
        "staff",
        staff.accessToken,
        "PUT",
        pushInput("https://push.test/unsubscribe-race-new"),
        id,
      ),
    ]);
    expect((await context.subscription(id)).disabled_at).not.toBeNull();
  });

  it("fails closed across canonical authority rotation races", async () => {
    const staff = await context.createStaff();
    const staffEndpoint = pushInput("https://push.test/revocation-race");
    await Promise.allSettled([
      request("staff", staff.accessToken, "POST", staffEndpoint),
      context.adminPool.query(
        "UPDATE staff_auth_sessions SET revoked_at = now() WHERE id = $1",
        [staff.sessionId],
      ),
    ]);
    expect(
      await request("staff", staff.accessToken, "POST", staffEndpoint),
    ).toMatchObject({ status: 401 });

    const guest = await context.createGuest();
    const replacementToken = randomBytes(32).toString("base64url");
    const replacementHash = `sha256:v1:${createHash("sha256")
      .update(replacementToken, "utf8")
      .digest("hex")}`;
    await Promise.allSettled([
      request(
        "guest",
        guest.rawToken,
        "POST",
        pushInput("https://push.test/generation-race"),
      ),
      context.adminPool.query(
        `UPDATE valet_sessions
         SET customer_access_token_hash = $2,
             customer_access_generation = gen_random_uuid()
         WHERE id = $1`,
        [guest.sessionId, replacementHash],
      ),
    ]);
    expect(
      await request(
        "guest",
        guest.rawToken,
        "POST",
        pushInput("https://push.test/generation-race"),
      ),
    ).toMatchObject({ status: 401 });
  });

  it("returns unavailable while disabled without changing auth state", async () => {
    configureWebPushTestEnvironment(false);
    const disabledApp = await startApp();
    try {
      const staff = await context.createStaff();
      const result = await request(
        "staff",
        staff.accessToken,
        "POST",
        pushInput("https://push.test/disabled"),
        undefined,
        url(disabledApp),
      );
      expect(result).toMatchObject({
        body: { code: "WEB_PUSH_UNAVAILABLE" },
        status: 503,
      });
      expect(
        await context.adminPool.query(
          "SELECT revoked_at FROM staff_auth_sessions WHERE id = $1",
          [staff.sessionId],
        ),
      ).toMatchObject({ rows: [{ revoked_at: null }] });
    } finally {
      await disabledApp.close();
      configureWebPushTestEnvironment(true);
    }
  });
});
