import { randomBytes, randomUUID } from "node:crypto";

import { type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module";
import { decryptWebPushCredentials } from "../src/common/web-push/subscription-crypto";
import {
  configureWebPushTestEnvironment,
  pushInput,
  WebPushTestContext,
  webPushTestActiveKey,
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

describe("T2 Web Push subscription lifecycle API", () => {
  it("binds Employee subscriptions to StaffAuthSession and refreshes safely", async () => {
    const staff = await context.createStaff();
    const input = pushInput("https://push.test/staff-one");
    const first = await request("staff", staff.accessToken, "POST", input);
    expect(first).toMatchObject({
      body: { audience: "EMPLOYEE", status: "ACTIVE" },
      status: 200,
    });
    const id = String(first.body.id);
    const persisted = await context.subscription(id);
    expect(persisted.staff_auth_session_id).toBe(staff.sessionId);
    expect(JSON.stringify(first.body)).not.toContain(staff.sessionId);
    expect(JSON.stringify(persisted)).not.toContain(input.endpoint);
    const plaintext = decryptWebPushCredentials(
      {
        authCiphertext: persisted.auth_ciphertext!,
        encryptionKeyVersion: persisted.encryption_key_version!,
        endpointCiphertext: persisted.endpoint_ciphertext!,
        p256dhCiphertext: persisted.p256dh_ciphertext!,
        subscriptionId: id,
      },
      { active: webPushTestActiveKey },
    );
    expect(plaintext).toEqual({
      auth: input.auth,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
    });

    const refreshedInput = pushInput(input.endpoint, "ar");
    const refreshed = await request(
      "staff",
      staff.accessToken,
      "POST",
      refreshedInput,
    );
    expect(refreshed.body).toMatchObject({ id, locale: "ar" });
    expect((await context.subscription(id)).auth_ciphertext).not.toBe(
      persisted.auth_ciphertext,
    );
  });

  it("keeps endpoints exclusive while allowing multiple Employee devices", async () => {
    const owner = await context.createStaff();
    const other = await context.createStaff();
    const shared = pushInput("https://push.test/exclusive-staff");
    const owned = await request("staff", owner.accessToken, "POST", shared);
    expect(
      await request("staff", other.accessToken, "POST", shared),
    ).toMatchObject({ status: 409 });
    const second = await request(
      "staff",
      owner.accessToken,
      "POST",
      pushInput("https://push.test/second-device"),
    );
    expect(second.status).toBe(200);
    expect(second.body.id).not.toBe(owned.body.id);
    await context.adminPool.query(
      "UPDATE staff_auth_sessions SET revoked_at = now() WHERE id = $1",
      [owner.sessionId],
    );
    expect(
      await request("staff", other.accessToken, "POST", shared),
    ).toMatchObject({ body: { status: "ACTIVE" }, status: 200 });
    expect(await context.subscription(String(owned.body.id))).toMatchObject({
      disabled_reason: "SESSION_REVOKED",
      endpoint_ciphertext: null,
    });
  });

  it("preserves the binding across access rotation and denies revoked sessions", async () => {
    const staff = await context.createStaff();
    const initial = await request(
      "staff",
      staff.accessToken,
      "POST",
      pushInput("https://push.test/rotation"),
    );
    const replacementToken = `vsa1.${randomBytes(32).toString("base64url")}`;
    const hash = `staff-access-sha256:v1:${await crypto.subtle
      .digest("SHA-256", new TextEncoder().encode(replacementToken))
      .then((value) => Buffer.from(value).toString("hex"))}`;
    await context.adminPool.query(
      `UPDATE staff_auth_sessions
       SET current_access_token_hash = $2, access_expires_at = now() + interval '15 minutes'
       WHERE id = $1`,
      [staff.sessionId, hash],
    );
    expect(
      await request(
        "staff",
        replacementToken,
        "PUT",
        pushInput("https://push.test/rotation-new"),
        String(initial.body.id),
      ),
    ).toMatchObject({ body: { id: initial.body.id }, status: 200 });
    expect(
      await request(
        "staff",
        staff.accessToken,
        "POST",
        pushInput("https://push.test/old-token"),
      ),
    ).toMatchObject({ status: 401 });

    const expired = await context.createStaff();
    await context.adminPool.query(
      `UPDATE staff_auth_sessions
       SET created_at = now() - interval '2 hours',
           last_rotated_at = now() - interval '1 hour',
           access_expires_at = now() - interval '1 second'
       WHERE id = $1`,
      [expired.sessionId],
    );
    expect(
      await request(
        "staff",
        expired.accessToken,
        "POST",
        pushInput("https://push.test/expired"),
      ),
    ).toMatchObject({ status: 401 });
    await context.adminPool.query(
      "UPDATE staff_auth_sessions SET revoked_at = now() WHERE id = $1",
      [staff.sessionId],
    );
    expect(
      await request(
        "staff",
        replacementToken,
        "POST",
        pushInput("https://push.test/revoked"),
      ),
    ).toMatchObject({ status: 401 });
  });

  it("allows only the exact Employee owner to tombstone and repeats safely", async () => {
    const owner = await context.createStaff();
    const other = await context.createStaff();
    const created = await request(
      "staff",
      owner.accessToken,
      "POST",
      pushInput("https://push.test/staff-unsubscribe"),
    );
    const id = String(created.body.id);
    expect(
      await request("staff", other.accessToken, "DELETE", undefined, id),
    ).toMatchObject({ status: 404 });
    expect(
      await request("staff", owner.accessToken, "DELETE", undefined, id),
    ).toMatchObject({ body: { status: "DISABLED" }, status: 200 });
    expect(
      await request("staff", owner.accessToken, "DELETE", undefined, id),
    ).toMatchObject({ body: { status: "DISABLED" }, status: 200 });
    const row = await context.subscription(id);
    expect(row).toMatchObject({
      auth_ciphertext: null,
      disabled_reason: "UNSUBSCRIBED",
      encryption_key_version: null,
      endpoint_ciphertext: null,
      p256dh_ciphertext: null,
    });
    expect(
      await request(
        "staff",
        other.accessToken,
        "POST",
        pushInput("https://push.test/staff-unsubscribe"),
      ),
    ).toMatchObject({ body: { status: "ACTIVE" }, status: 200 });
  });
});
