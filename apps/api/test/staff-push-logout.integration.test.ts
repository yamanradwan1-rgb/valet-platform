import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { StaffPushApiFixture } from "./staff-push-api-fixture";

const fixture = new StaffPushApiFixture();

beforeAll(() => fixture.start(), 120_000);
afterAll(() => fixture.stop(), 60_000);

describe("Staff push registration session lifecycle", () => {
  it("atomically revokes one session and disables all and only its registrations", async () => {
    const user = await fixture.createUser();
    const first = await fixture.login(user);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const independent = await fixture.login(user);
    await fixture.put(first, fixture.requestBody());
    await fixture.put(first, fixture.requestBody());
    await fixture.put(independent, fixture.requestBody());

    const logout = await fixture.request("/v1/staff/auth/native/logout", {
      body: { refreshToken: first.refreshToken },
    });
    expect(logout.status).toBe(204);
    const repeated = await fixture.request("/v1/staff/auth/native/logout", {
      body: { refreshToken: first.refreshToken },
    });
    expect(repeated.status).toBe(204);

    const sessions = await fixture.query<{
      id: string;
      revoked_at: Date | null;
    }>(
      `SELECT id, revoked_at FROM staff_auth_sessions
       WHERE id = ANY($1::uuid[]) ORDER BY id`,
      [[first.sessionId, independent.sessionId]],
    );
    expect(
      sessions.rows.find((row) => row.id === first.sessionId)?.revoked_at,
    ).toBeInstanceOf(Date);
    expect(
      sessions.rows.find((row) => row.id === independent.sessionId)?.revoked_at,
    ).toBeNull();
    const registrations = (await fixture.registrations()).rows;
    expect(
      registrations.filter(
        (row) => row.staff_auth_session_id === first.sessionId,
      ),
    ).toEqual([
      expect.objectContaining({
        provider_token: null,
        state: "DISABLED",
        terminal_reason_class: "SESSION_LOGOUT",
      }),
      expect.objectContaining({
        provider_token: null,
        state: "DISABLED",
        terminal_reason_class: "SESSION_LOGOUT",
      }),
    ]);
    expect(
      registrations.find(
        (row) => row.staff_auth_session_id === independent.sessionId,
      ),
    ).toMatchObject({ state: "ACTIVE" });
  });

  it("rolls back revocation when registration disabling faults", async () => {
    const auth = await fixture.login();
    const body = fixture.requestBody();
    await fixture.put(auth, body);
    await fixture.query(
      `CREATE FUNCTION mob020b_reject_disable() RETURNS trigger
       LANGUAGE plpgsql AS $$ BEGIN
         IF NEW.state = 'DISABLED' THEN
           RAISE EXCEPTION 'synthetic logout rollback fault';
         END IF;
         RETURN NEW;
       END $$`,
    );
    await fixture.query(
      `CREATE TRIGGER mob020b_reject_disable_trigger
       BEFORE UPDATE ON staff_push_registrations
       FOR EACH ROW EXECUTE FUNCTION mob020b_reject_disable()`,
    );
    try {
      const logout = await fixture.request("/v1/staff/auth/native/logout", {
        body: { refreshToken: auth.refreshToken },
      });
      expect(logout.status).toBe(500);
      const session = await fixture.query<{ revoked_at: Date | null }>(
        `SELECT revoked_at FROM staff_auth_sessions WHERE id = $1`,
        [auth.sessionId],
      );
      expect(session.rows[0]!.revoked_at).toBeNull();
      const registration = (await fixture.registrations()).rows.find(
        (row) => row.staff_auth_session_id === auth.sessionId,
      );
      expect(registration).toMatchObject({
        provider_token: body.providerToken,
        state: "ACTIVE",
      });
    } finally {
      await fixture.query(
        `DROP TRIGGER mob020b_reject_disable_trigger ON staff_push_registrations`,
      );
      await fixture.query(`DROP FUNCTION mob020b_reject_disable()`);
    }
  });

  it("keeps registration ownership stable through access/refresh rotation", async () => {
    const auth = await fixture.login();
    const body = fixture.requestBody();
    const registered = await fixture.put(auth, body);
    const refresh = await fixture.request("/v1/staff/auth/native/refresh", {
      body: { refreshToken: auth.refreshToken },
    });
    expect(refresh.status).toBe(200);
    const reconciled = await fixture.put(
      { accessToken: String(refresh.body?.accessToken) },
      body,
    );
    expect(reconciled.body?.registrationId).toBe(
      registered.body?.registrationId,
    );
    const row = (await fixture.registrations()).rows.find(
      (candidate) => candidate.id === registered.body?.registrationId,
    );
    expect(row?.staff_auth_session_id).toBe(auth.sessionId);
  });
});
