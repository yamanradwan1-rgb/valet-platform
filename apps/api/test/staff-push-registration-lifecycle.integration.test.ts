import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { StaffPushApiFixture } from "./staff-push-api-fixture";

const fixture = new StaffPushApiFixture();

beforeAll(() => fixture.start(), 120_000);
afterAll(() => fixture.stop(), 60_000);

describe("Staff push registration lifecycle", () => {
  it("converges exact retries and lost-response retries on one identity", async () => {
    const auth = await fixture.login();
    const body = fixture.requestBody();
    const first = await fixture.put(auth, body);
    const retry = await fixture.put(auth, body);
    const lostResponseRetry = await fixture.put(auth, body);
    expect(first.status).toBe(200);
    expect(retry.body?.registrationId).toBe(first.body?.registrationId);
    expect(lostResponseRetry.body?.registrationId).toBe(
      first.body?.registrationId,
    );
    const matching = (await fixture.registrations()).rows.filter(
      (row) => row.installation_id === body.installationId,
    );
    expect(matching).toHaveLength(1);
    expect(matching[0]!.state).toBe("ACTIVE");
  });

  it("refreshes only mutable metadata and last confirmation", async () => {
    const auth = await fixture.login();
    const body = fixture.requestBody();
    const first = await fixture.put(auth, body);
    const before = (await fixture.registrations()).rows.find(
      (row) => row.id === first.body?.registrationId,
    )!;
    await new Promise((resolve) => setTimeout(resolve, 5));
    const refreshed = await fixture.put(auth, {
      ...body,
      appBuild: "101",
      appVersion: "1.0.1",
      locale: "ar",
    });
    expect(refreshed.body).toMatchObject({
      appBuild: "101",
      appVersion: "1.0.1",
      locale: "ar",
      registrationId: first.body?.registrationId,
    });
    const after = (await fixture.registrations()).rows.find(
      (row) => row.id === first.body?.registrationId,
    )!;
    expect(after.token_hash).toBe(before.token_hash);
    expect(after.staff_auth_session_id).toBe(auth.sessionId);
    expect(after.last_confirmed_at.getTime()).toBeGreaterThan(
      before.last_confirmed_at.getTime(),
    );
  });

  it("atomically supersedes token rotation and retries the winner", async () => {
    const auth = await fixture.login();
    const body = fixture.requestBody();
    const first = await fixture.put(auth, body);
    const rotatedBody = {
      ...body,
      providerToken: `${body.providerToken}-rotated`,
    };
    const rotated = await fixture.put(auth, rotatedBody);
    expect(rotated.body?.registrationId).not.toBe(first.body?.registrationId);
    const retry = await fixture.put(auth, rotatedBody);
    expect(retry.body?.registrationId).toBe(rotated.body?.registrationId);
    const rows = (await fixture.registrations()).rows.filter(
      (row) => row.installation_id === body.installationId,
    );
    const old = rows.find((row) => row.id === first.body?.registrationId)!;
    const current = rows.find(
      (row) => row.id === rotated.body?.registrationId,
    )!;
    expect(old).toMatchObject({
      provider_token: null,
      state: "SUPERSEDED",
      superseded_by_registration_id: current.id,
      terminal_reason_class: "TOKEN_ROTATION",
    });
    expect(old.terminal_at).toBeInstanceOf(Date);
    expect(current).toMatchObject({
      provider_token: rotatedBody.providerToken,
      staff_auth_session_id: auth.sessionId,
      state: "ACTIVE",
    });
  });

  it("reconciles same-device token rotation after same-user reauthentication", async () => {
    const user = await fixture.createUser();
    const priorSession = await fixture.login(user);
    const body = fixture.requestBody();
    const initial = await fixture.put(priorSession, body);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const currentSession = await fixture.login(user);

    const priorState = await fixture.query<{
      absolute_current: boolean;
      revoked_at: Date | null;
    }>(
      `SELECT revoked_at,
              clock_timestamp() < absolute_expires_at AS absolute_current
       FROM staff_auth_sessions WHERE id = $1`,
      [priorSession.sessionId],
    );
    expect(priorState.rows[0]).toMatchObject({
      absolute_current: true,
      revoked_at: null,
    });

    const rotated = await fixture.put(currentSession, {
      ...body,
      providerToken: `${body.providerToken}-reauth-rotation`,
    });

    expect(rotated.status).toBe(200);
    expect(rotated.body?.registrationId).not.toBe(initial.body?.registrationId);
    const rows = (await fixture.registrations()).rows.filter(
      (row) => row.installation_id === body.installationId,
    );
    expect(rows.filter((row) => row.state === "ACTIVE")).toEqual([
      expect.objectContaining({
        staff_auth_session_id: currentSession.sessionId,
      }),
    ]);
    expect(
      rows.find((row) => row.id === initial.body?.registrationId),
    ).toMatchObject({
      state: "SUPERSEDED",
      terminal_reason_class: "TOKEN_ROTATION",
    });
  });

  it("rebinds an exact endpoint only to the later-created current session", async () => {
    const user = await fixture.createUser();
    const older = await fixture.login(user);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const later = await fixture.login(user);
    const body = fixture.requestBody();
    const initial = await fixture.put(older, body);
    // Product invariant: legitimate same-device reauthentication must not
    // require logout/login, reinstall, or manual database cleanup for push.
    const rebound = await fixture.put(later, body);
    expect(rebound.status).toBe(200);
    expect(rebound.body?.registrationId).not.toBe(initial.body?.registrationId);
    expect(JSON.stringify(rebound.body)).not.toContain(older.userId);
    expect(JSON.stringify(rebound.body)).not.toContain(older.sessionId);

    const reclaim = await fixture.put(older, body);
    expect(reclaim.status).toBe(409);
    expect(reclaim.body?.code).toBe("STAFF_PUSH_REGISTRATION_CONFLICT");
    expect(JSON.stringify(reclaim.body)).not.toContain(later.userId);
    expect(JSON.stringify(reclaim.body)).not.toContain(later.sessionId);

    const rows = (await fixture.registrations()).rows.filter(
      (row) => row.installation_id === body.installationId,
    );
    expect(rows.filter((row) => row.state === "ACTIVE")).toEqual([
      expect.objectContaining({ staff_auth_session_id: later.sessionId }),
    ]);
    expect(
      rows.find((row) => row.id === initial.body?.registrationId),
    ).toMatchObject({
      provider_token: null,
      state: "SUPERSEDED",
      terminal_reason_class: "ACCOUNT_SWITCH",
    });
  });

  it("rejects a different user claiming the same active installation and token", async () => {
    const owner = await fixture.login();
    const otherUser = await fixture.login();
    const body = fixture.requestBody();
    await fixture.put(owner, body);
    const before = await fixture.registrations();

    const result = await fixture.put(otherUser, body);

    expect(result.status).toBe(409);
    expect(result.body?.code).toBe("STAFF_PUSH_REGISTRATION_CONFLICT");
    expect((await fixture.registrations()).rows).toEqual(before.rows);
  });

  it("fails closed when an active token is presented for another installation", async () => {
    const firstAuth = await fixture.login();
    const secondAuth = await fixture.login();
    const body = fixture.requestBody();
    await fixture.put(firstAuth, body);
    const before = await fixture.registrations();
    const collision = await fixture.put(secondAuth, {
      ...body,
      installationId: fixture.requestBody().installationId,
    });
    expect(collision.status).toBe(409);
    expect(collision.body?.code).toBe("STAFF_PUSH_REGISTRATION_CONFLICT");
    expect(JSON.stringify(collision.body)).not.toContain(body.providerToken);
    expect((await fixture.registrations()).rows).toEqual(before.rows);
  });

  it("disables only the exact owning session and repeats idempotently", async () => {
    const owner = await fixture.login();
    const foreign = await fixture.login();
    const created = await fixture.put(owner, fixture.requestBody());
    const registrationId = fixture.registrationId(created);
    const denied = await fixture.disable(foreign, registrationId);
    const missing = await fixture.disable(foreign, randomUUID());
    expect(denied.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(denied.body).toMatchObject({
      code: missing.body?.code,
      message: missing.body?.message,
    });
    const disabled = await fixture.disable(owner, registrationId);
    expect(disabled.status).toBe(200);
    expect(disabled.body).toMatchObject({
      registrationId,
      state: "DISABLED",
    });
    const repeated = await fixture.disable(owner, registrationId);
    expect(repeated.body).toEqual(disabled.body);
    const row = (await fixture.registrations()).rows.find(
      (candidate) => candidate.id === registrationId,
    )!;
    expect(row).toMatchObject({
      provider_token: null,
      state: "DISABLED",
      terminal_reason_class: "EXPLICIT_DISABLE",
    });
  });

  it("never reactivates terminal rows when desired state is registered later", async () => {
    const auth = await fixture.login();
    const body = fixture.requestBody();
    const first = await fixture.put(auth, body);
    await fixture.disable(auth, fixture.registrationId(first));
    const replacement = await fixture.put(auth, body);
    expect(replacement.body?.registrationId).not.toBe(
      first.body?.registrationId,
    );
    const rows = await fixture.registrations();
    expect(
      rows.rows.find((row) => row.id === first.body?.registrationId)?.state,
    ).toBe("DISABLED");
    expect(
      rows.rows.find((row) => row.id === replacement.body?.registrationId)
        ?.state,
    ).toBe("ACTIVE");
  });
});
