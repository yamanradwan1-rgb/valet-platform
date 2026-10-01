import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import {
  StaffActivationTestFixture,
  invitationToken,
} from "./staff-activation-test-fixture";
import { issued } from "./staff-onboarding-test-fixture";

const fixture = new StaffActivationTestFixture();
beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);
const unknown = () => `vsi1.${randomBytes(32).toString("base64url")}`;

function limited(result: Awaited<ReturnType<typeof fixture.activate>>) {
  expect(result.status).toBe(429);
  expect(result.body?.code).toBe("STAFF_ACTIVATION_RATE_LIMITED");
  const retry = Number(result.headers.get("retry-after"));
  expect(retry >= 1 && retry <= 900).toBe(true);
}

describe("T05-D independent persisted activation abuse limits", () => {
  it("admits only five failures per credential, with HMAC-only persistence and bounded retry", async () => {
    const token = unknown();
    for (let i = 0; i < 5; i++)
      expect((await fixture.activate(token)).status).toBe(401);
    limited(await fixture.activate(token));
    const rows = await fixture.query<{
      scope: string;
      key_hash: string;
      state: string;
    }>(
      "SELECT scope,key_hash,state FROM anti_abuse_events WHERE scope LIKE 'v1:staff-activation-%'",
    );
    expect(
      rows.rows.every((row) =>
        /^anti-abuse-hmac-sha256:v1:[0-9a-f]{64}$/.test(row.key_hash),
      ),
    ).toBe(true);
    expect(JSON.stringify(rows.rows).includes(token)).toBe(false);
    expect(
      rows.rows.filter(
        (row) =>
          row.scope === "v1:staff-activation-credential" &&
          row.state === "COUNTED",
      ).length,
    ).toBe(5);
    expect(
      rows.rows.filter(
        (row) =>
          row.scope === "v1:staff-activation-client-address" &&
          row.state === "COUNTED",
      ).length,
    ).toBe(5);
    // Credential denial is not another counted address failure.
    expect(rows.rows.filter((row) => row.state === "IGNORED").length).toBe(1);
    await fixture.query(
      "UPDATE anti_abuse_events SET occurred_at=clock_timestamp()-interval '16 minutes' WHERE scope LIKE 'v1:staff-activation-%'",
    );
    expect((await fixture.activate(token)).status).toBe(401);
  });

  it("rotating tokens cannot bypass the 30-failure trusted-address limit; login stays independent", async () => {
    for (let i = 0; i < 30; i++)
      expect((await fixture.activate(unknown())).status).toBe(401);
    limited(await fixture.activate(unknown()));
    const user = await fixture.createUser();
    expect(
      (
        await fixture.request("/v1/staff/auth/login", {
          origin: fixture.allowedOrigin,
          body: { email: user.email, password: user.password },
        })
      ).status,
    ).toBe(200);
  }, 30_000);

  it("concurrent reservations cannot exceed the credential threshold", async () => {
    const token = unknown();
    const results = await Promise.all(
      Array.from({ length: 7 }, () => fixture.activate(token)),
    );
    expect(results.filter((r) => r.status === 401).length).toBe(5);
    expect(results.filter((r) => r.status === 429).length).toBe(2);
  });

  it("successful redemption and terminal reconciliation finalize ignored atomically", async () => {
    const actor = await fixture.actor();
    const invite = issued(await fixture.create(actor));
    const token = invitationToken(invite.activationLink);
    expect((await fixture.activate(token)).status).toBe(200);
    for (let i = 0; i < 6; i++)
      expect((await fixture.activate(token)).body?.outcome).toBe(
        "ALREADY_ACTIVATED",
      );
    const rows = await fixture.query<{ state: string }>(
      "SELECT state FROM anti_abuse_events WHERE scope LIKE 'v1:staff-activation-%'",
    );
    expect(rows.rows.length).toBe(14);
    expect(rows.rows.every((row) => row.state === "IGNORED")).toBe(true);
  });

  it("fails closed when limiter configuration or reservation storage is unavailable", async () => {
    const actor = await fixture.actor();
    const invite = issued(await fixture.create(actor));
    const token = invitationToken(invite.activationLink);
    const secret = process.env.ANTI_ABUSE_HMAC_SECRET_B64URL;
    delete process.env.ANTI_ABUSE_HMAC_SECRET_B64URL;
    try {
      expect((await fixture.activate(token)).status).toBe(503);
    } finally {
      process.env.ANTI_ABUSE_HMAC_SECRET_B64URL = secret;
    }
    await fixture.query(
      "ALTER TABLE anti_abuse_events ADD CONSTRAINT test_240d_abuse_failure CHECK(scope NOT LIKE 'v1:staff-activation-%') NOT VALID",
    );
    try {
      expect((await fixture.activate(token)).status).toBe(503);
    } finally {
      await fixture.query(
        "ALTER TABLE anti_abuse_events DROP CONSTRAINT test_240d_abuse_failure",
      );
    }
    expect((await fixture.snapshot(invite.membershipId)).status).toBe(
      "PENDING",
    );
  });
});
