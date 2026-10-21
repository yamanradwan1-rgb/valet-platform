import { createHash, randomUUID } from "node:crypto";

import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Issue215HttpScope } from "./issue215-http-fixture-database";
import { staffCredentialHash } from "../src/modules/auth/staff-auth-credential";

import { syntheticJpeg } from "./issue215-http-fixture";
import {
  browserActor, currentTotp, openRealNext, realChromium, unusedLoopbackPort,
} from "./issue309-photo-browser-support";
import {
  openIssue309PhotoHttpFixture,
  type Issue309PhotoHttpFixture,
} from "./issue309-photo-http-fixture";

// Protected project: requires exact attested disposable PG17 and MinIO.
// This launches real Next, browser, real Nest, real staff login, and actual
// uploaded private JPEG. Never fulfill/intercept staff API routes or bytes.
describe("#309 actual Next Dashboard -> protected HTTP -> persisted Check-In JPEG", () => {
  let h: Issue309PhotoHttpFixture;
  let next: Awaited<ReturnType<typeof openRealNext>>;
  let browser: Awaited<ReturnType<ReturnType<typeof realChromium>["launch"]>>;
  let photoId: string;
  let seededScope: Issue215HttpScope;
  let sessionId: string;
  let secondVisitId: string;
  let locationId: string;
  let expectedSha256: string;
  let admin: Awaited<ReturnType<typeof browserActor>>;
  let manager: Awaited<ReturnType<typeof browserActor>>;
  let supervisor: Awaited<ReturnType<typeof browserActor>>;
  let employee: Awaited<ReturnType<typeof browserActor>>;
  const scopedViewers = new Map<string, string>();

  beforeAll(async () => {
    const port = await unusedLoopbackPort();
    h = await openIssue309PhotoHttpFixture({
      browserOrigin: `http://127.0.0.1:${port}`,
      developmentPolicy: true,
    });
    const restricted = new Pool({ connectionString: h.db.runtimeUrl, max: 1 });
    try {
      const privilege = await restricted.query<{ canUpdate: boolean }>(
        `SELECT has_table_privilege(current_user,
          'vehicle_photo_verifications','UPDATE') AS "canUpdate"`,
      );
      expect(privilege.rows[0]?.canUpdate).toBe(false);
    } finally { await restricted.end(); }
    const seeded = await h.seedPhoto();
    seededScope = seeded.scope;
    sessionId = seeded.scope.sessionId;
    locationId = seeded.scope.locationId;
    const jpeg = await syntheticJpeg();
    const inputSha256 = createHash("sha256").update(jpeg).digest("hex");
    const upload = await h.upload(sessionId, seeded.authorization, jpeg);
    expect(upload.status).toBe(201);
    photoId = String(JSON.parse(upload.body.toString("utf8")).vehiclePhotoId);
    const verified = await h.db.admin.query<{ content_sha256: Buffer }>(
      "SELECT content_sha256 FROM vehicle_photo_verifications WHERE vehicle_photo_id=$1",
      [photoId],
    );
    expect(verified.rows).toHaveLength(1);
    expectedSha256 = verified.rows[0]!.content_sha256.toString("hex");
    // Upload sanitizes/reencodes JPEG; the browser must match the persisted
    // independently verified object, not the original raw input bytes.
    expect(expectedSha256).not.toBe(inputSha256);
    secondVisitId = randomUUID();
    await h.db.admin.query(
      `INSERT INTO valet_sessions
       (id,customer_access_token_hash,customer_access_expires_at,
        organization_id,location_id,vehicle_id,state,checked_in_by_membership_id,completed_at,created_at,updated_at)
       VALUES($1,$2,clock_timestamp()+interval '1 hour',$3,$4,$5,
        'COMPLETED',$6,clock_timestamp()-interval '1 day',
        clock_timestamp()-interval '1 day',clock_timestamp()-interval '1 day')`,
      [secondVisitId, `issue309:${randomUUID()}`, seeded.scope.orgId,
        locationId, seeded.scope.vehicleId, seeded.scope.memberId],
    );
    manager = await browserActor(h, seeded.scope, "LOCATION_MANAGER");
    admin = await browserActor(h, seeded.scope, "ORG_ADMIN");
    supervisor = await browserActor(h, seeded.scope, "VALET_SUPERVISOR");
    employee = await browserActor(h, seeded.scope, "VALET_EMPLOYEE");
    h.activateDevelopmentPhotoView();
    next = await openRealNext(h.baseUrl, port);
    browser = await realChromium().launch({ headless: true });
  }, 240_000);

  afterAll(async () => {
    try { await browser?.close(); }
    finally {
      try { await next?.close(); }
      finally { await h?.close(); }
    }
  }, 90_000);

  async function signIn(actor: Awaited<ReturnType<typeof browserActor>>, role: "manager" | "admin") {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript(() => {
      const created: string[] = [], revoked: string[] = [];
      const originalCreate = URL.createObjectURL.bind(URL);
      const originalRevoke = URL.revokeObjectURL.bind(URL);
      URL.createObjectURL = (blob) => {
        const url = originalCreate(blob); created.push(url); return url;
      };
      URL.revokeObjectURL = (url) => { revoked.push(url); originalRevoke(url); };
      Object.defineProperty(globalThis, "__issue309PrivateBlobs", { value: { created, revoked } });
    });
    await page.goto(`${next.origin}/vehicles`);
    const login = page.waitForResponse((response: { url(): string }) =>
      response.url().endsWith("/v1/staff/auth/login"));
    await page.getByLabel("Email").fill(actor.email);
    await page.getByLabel("Password").fill(actor.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    const tokenPayload = await (await login).json() as { accessToken: string };
    expect(tokenPayload.accessToken).toMatch(/^vsa1\./);
    const matched = await h.db.admin.query<{ id: string }>(
      `SELECT id::text FROM staff_auth_sessions
       WHERE user_id=$1 AND current_access_token_hash=$2 AND revoked_at IS NULL`,
      [actor.userId, staffCredentialHash("access", tokenPayload.accessToken)],
    );
    expect(matched.rows).toHaveLength(1);
    scopedViewers.set(role, [actor.userId, matched.rows[0]!.id, locationId, sessionId].join(":"));
    process.env.ISSUE309_DEV_PHOTO_VIEW_SCOPES = [...scopedViewers.values()].join(";");
    if (role === "admin") {
      // Genuine TOTP step-up over the live authenticated Next -> Nest rewrite.
      // Company Admin photo VIEW retains the server's MFA validity check.
      const step = await page.evaluate(async ({ bearer, code }: { bearer: string; code: string }) => {
        const response = await fetch("/v1/staff/auth/mfa/step-up", {
          method: "POST", headers: { authorization: bearer, "content-type": "application/json" },
          body: JSON.stringify({ code }),
        });
        return { status: response.status, body: await response.text() };
      }, { bearer: `Bearer ${tokenPayload.accessToken}`, code: currentTotp() });
      expect(step.status, step.body).toBe(200);
    }
    await page.getByRole("button", { name: "P1 isolated test" }).click();
    await page.getByRole("button", { name: "P1 location" }).click();
    return { context, page, authorization: `Bearer ${tokenPayload.accessToken}` };
  }

  it("LM sees the same exact saved visit in Vehicles and Live Ops; different visit has zero photos", async () => {
    const { context, page, authorization } = await signIn(manager, "manager");
    try {
      const received: string[] = [];
      page.on("response", (response: { url(): string; status(): number }) => {
        if (response.url().includes("/condition-photos/" + photoId + "/bytes")) {
          expect(response.status()).toBe(200);
          received.push(response.url());
        }
      });
      await page.locator("tbody tr").filter({ hasText: "Test vehicle" }).first()
        .getByRole("button", { name: /Details/ }).click();
      await page.locator('img[src^="blob:"]').first().waitFor();
      const digest = await page.locator('img[src^="blob:"]').first().evaluate(
        async (image: { src: string }) => {
          const bytes = await (await fetch(image.src)).arrayBuffer();
          const sha = await crypto.subtle.digest("SHA-256", bytes);
          return [...new Uint8Array(sha)].map((b) => b.toString(16).padStart(2, "0")).join("");
        },
      );
      expect(digest).toBe(expectedSha256);
      await page.keyboard.press("Escape");
      await page.goto(`${next.origin}/live-operations`);
      await page.locator("tbody tr").filter({ hasText: "Test vehicle" }).first()
        .getByRole("button", { name: /Details/ }).click();
      await page.locator('img[src^="blob:"]').first().waitFor();
      expect(received.length).toBeGreaterThanOrEqual(2);
      expect(received.every((url) => url.includes(sessionId))).toBe(true);
      await page.keyboard.press("Escape");
      const stored = await h.db.admin.query<{ id: string; vehicle_id: string }>(
        "SELECT id::text,vehicle_id::text FROM valet_sessions WHERE id=ANY($1::uuid[])",
        [[sessionId, secondVisitId]],
      );
      expect(stored.rows).toHaveLength(2);
      expect(new Set(stored.rows.map((row) => row.vehicle_id)).size).toBe(1);
      const second = await h.get(
        `/v1/staff/dashboard/locations/${locationId}/sessions/${secondVisitId}/condition-photos`,
        authorization,
      );
      // The explicit development allowlist also fences one exact *visit*.
      expect([403, 404]).toContain(second.status);
      await page.locator("tbody tr").filter({ hasText: "Test vehicle" }).last()
        .getByRole("button", { name: /Details/ }).click();
      await page.getByText(/not available|not authorized|Access denied|unavailable/u).first().waitFor();
      await page.keyboard.press("Escape");
      await page.goto(`${next.origin}/vehicles`);
      await page.locator("tbody tr").filter({ hasText: "Test vehicle" }).first()
        .getByRole("button", { name: /Details/ }).click();
      await page.locator('img[src^="blob:"]').first().waitFor();
      const saved = await page.evaluate(() => {
        const state = (globalThis as unknown as { __issue309PrivateBlobs: {
          created: string[]; revoked: string[];
        } }).__issue309PrivateBlobs;
        return [...state.created];
      });
      expect(saved.length).toBeGreaterThan(0);
      await h.db.admin.query(
        "DELETE FROM membership_location_access WHERE membership_id=$1 AND location_id=$2",
        [manager.memberId, locationId],
      );
      const revoked = await h.get(
        `/v1/staff/dashboard/locations/${locationId}/sessions/${sessionId}/condition-photos`,
        authorization,
      );
      expect([403, 404]).toContain(revoked.status);
      await page.getByRole("link", { name: /Live Operations/ }).click();
      await page.waitForFunction(() => {
        const state = (globalThis as unknown as { __issue309PrivateBlobs: {
          created: string[]; revoked: string[];
        } }).__issue309PrivateBlobs;
        return state.created.every((url) => state.revoked.includes(url));
      });
    } finally { await context.close(); }
  }, 120_000);

  it("CA must perform genuine TOTP and can read exact saved JPEG", async () => {
    const { context, page } = await signIn(admin, "admin");
    try {
      await page.locator("tbody tr").filter({ hasText: "Test vehicle" }).first()
        .getByRole("button", { name: /Details/ }).click();
      await page.locator('img[src^="blob:"]').first().waitFor();
    } finally { await context.close(); }
  }, 90_000);

  it("Supervisor, Employee and Guest cannot read the real session photo", async () => {
    for (const actor of [supervisor, employee]) {
      const res = await fetch(
        `${h.baseUrl}/v1/staff/dashboard/locations/${locationId}/sessions/${sessionId}/condition-photos`,
        { headers: { authorization: (await h.db.createBearer({
          ...seededScope, userId: actor.userId, memberId: actor.memberId,
        })) } },
      );
      expect([403, 404]).toContain(res.status);
    }
    const guest = await fetch(
      `${h.baseUrl}/v1/staff/dashboard/locations/${locationId}/sessions/${sessionId}/condition-photos`,
    );
    expect([401, 403, 404]).toContain(guest.status);
  });
});
