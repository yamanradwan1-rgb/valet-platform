import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { StaffPushApiFixture } from "./staff-push-api-fixture";

const fixture = new StaffPushApiFixture();

beforeAll(() => fixture.start(), 120_000);
afterAll(() => fixture.stop(), 60_000);

describe("Staff push registration PostgreSQL concurrency", () => {
  it("serializes simultaneous identical PUTs to one ACTIVE identity", async () => {
    const auth = await fixture.login();
    const body = fixture.requestBody();
    const results = await Promise.all([
      fixture.put(auth, body),
      fixture.put(auth, body),
    ]);
    expect(results.map((result) => result.status)).toEqual([200, 200]);
    expect(results[0]!.body?.registrationId).toBe(
      results[1]!.body?.registrationId,
    );
    const rows = (await fixture.registrations()).rows.filter(
      (row) => row.installation_id === body.installationId,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.state).toBe("ACTIVE");
  });

  it("serializes simultaneous same-install rotations to one successor", async () => {
    const auth = await fixture.login();
    const body = fixture.requestBody();
    const initial = await fixture.put(auth, body);
    const rotated = {
      ...body,
      providerToken: `${body.providerToken}-rotation-winner`,
    };
    const results = await Promise.all([
      fixture.put(auth, rotated),
      fixture.put(auth, rotated),
    ]);
    expect(results.map((result) => result.status)).toEqual([200, 200]);
    expect(results[0]!.body?.registrationId).toBe(
      results[1]!.body?.registrationId,
    );
    const rows = (await fixture.registrations()).rows.filter(
      (row) => row.installation_id === body.installationId,
    );
    expect(rows.filter((row) => row.state === "ACTIVE")).toHaveLength(1);
    expect(
      rows.find((row) => row.id === initial.body?.registrationId),
    ).toMatchObject({
      state: "SUPERSEDED",
      superseded_by_registration_id: results[0]!.body?.registrationId,
    });
  });

  it("makes the later-created session the endpoint owner in both race directions", async () => {
    const userA = await fixture.createUser();
    const older = await fixture.login(userA);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const later = await fixture.login();
    const body = fixture.requestBody();
    await fixture.put(older, body);

    const racing = await Promise.all([
      fixture.put(later, body),
      fixture.put(older, body),
    ]);
    expect(racing.some((result) => result.status === 200)).toBe(true);
    const rows = (await fixture.registrations()).rows.filter(
      (row) => row.installation_id === body.installationId,
    );
    expect(rows.filter((row) => row.state === "ACTIVE")).toEqual([
      expect.objectContaining({ staff_auth_session_id: later.sessionId }),
    ]);
    const reclaim = await fixture.put(older, body);
    expect(reclaim.status).toBe(409);
  });

  it("serializes registration against logout with no ACTIVE revoked-session row", async () => {
    const auth = await fixture.login();
    const body = fixture.requestBody();
    const [registration, logout] = await Promise.all([
      fixture.put(auth, body),
      fixture.request("/v1/staff/auth/native/logout", {
        body: { refreshToken: auth.refreshToken },
      }),
    ]);
    expect([200, 401]).toContain(registration.status);
    expect(logout.status).toBe(204);
    const session = await fixture.query<{ revoked_at: Date | null }>(
      `SELECT revoked_at FROM staff_auth_sessions WHERE id = $1`,
      [auth.sessionId],
    );
    expect(session.rows[0]!.revoked_at).toBeInstanceOf(Date);
    const rows = (await fixture.registrations()).rows.filter(
      (row) => row.staff_auth_session_id === auth.sessionId,
    );
    expect(rows.every((row) => row.state !== "ACTIVE")).toBe(true);
    expect(rows.every((row) => row.provider_token === null)).toBe(true);
  });
});
