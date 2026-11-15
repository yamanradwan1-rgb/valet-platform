import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AntiAbuseKeyDeriver } from "../../src/modules/anti-abuse/anti-abuse-key";
import { assertRuntimeDeny } from "./after-fixture";
import { OptionCAfterProtectedFixture } from "./after-protected-fixture";
import {
  activationPassword,
  invitationToken,
  invitationVerifier,
} from "./after-onboarding-fixture";

// Included by vitest.option-c-protected-writers.config.mjs. The fixture's
// original W37 owner/cluster guard is deliberately unchanged. Never run this
// suite on a shared or unrelated database.
const fixture = new OptionCAfterProtectedFixture();
beforeAll(() => fixture.start(), 180_000);
afterAll(() => fixture.stop(), 120_000);

const activationFunction = "public.s04_staff_activation_success(uuid,text,text,text)";

describe("Option C protected writers / genuine Staff activation and S04 settlement", () => {
  it("activates with the raw invitation/Argon2 ceremony, atomically ignoring both quota reservations", async () => {
    await fixture.assertIndependentWriterConnections();
    const admin = await fixture.onboardingAdmin();
    const command = fixture.newInvitation(admin.locationId);
    const issued = await fixture.createViaHttp(
      admin.membership.organizationId,
      admin.auth.accessToken,
      command,
    );
    expect(issued.status).toBe(201);
    expect(issued.body?.outcome).toBe("INVITE_ISSUED");
    const memberId = String(issued.body?.membershipId);
    const token = invitationToken(String(issued.body?.activationLink));
    const key = new AntiAbuseKeyDeriver().derive(
      "v1:staff-activation-credential", token,
    ).keyHash;
    expect(await fixture.pendingSnapshot(memberId)).toMatchObject({
      user_status: "PENDING",
      member_status: "PENDING",
      password_hash: null,
      consumed: "0",
    });

    const writer = new Pool({
      connectionString: fixture.writerUrl("STAFF_AUTH_WRITER_DATABASE_URL"),
      max: 1,
    });
    try {
      const identity = await writer.query<{ principal: string; activation: boolean; generic: boolean }>(
        `SELECT current_user AS principal,
          has_function_privilege(current_user,$1,'EXECUTE') AS activation,
          has_function_privilege(current_user,
            'public.s04_finalize(uuid,text,text,text,uuid,bigint,text)','EXECUTE') AS generic`,
        [activationFunction],
      );
      expect(identity.rows[0]).toEqual({
        principal: "vaylet_staff_auth_writer",
        activation: true,
        generic: false,
      });
    } finally {
      await writer.end();
    }
    await assertRuntimeDeny(
      fixture,
      `SELECT public.s04_staff_activation_success($1::uuid,$2,$3,$4)`,
      [
        randomUUID(),
        "v1:staff-activation-credential",
        key,
        invitationVerifier(token),
      ],
      activationFunction,
    );

    const admissionStart = await fixture.query<{ started: Date }>(
      "SELECT clock_timestamp() AS started",
    );
    const real = await fixture.activateViaHttp(token);
    expect(real.status).toBe(200);
    expect(real.body?.outcome).toBe("ACTIVATED");
    const current = await fixture.pendingSnapshot(memberId);
    expect(current).toMatchObject({
      user_status: "ACTIVE",
      member_status: "ACTIVE",
      consumed: "1",
    });
    expect(current?.password_hash).toMatch(/^\$argon2id\$/);
    const settled = await fixture.query<{
      scope: string;
      state: string;
    }>(
      `SELECT scope,state FROM public.anti_abuse_events
       WHERE state='IGNORED' AND occurred_at>=$1::timestamptz
         AND (scope='v1:staff-activation-client-address' OR
             (scope='v1:staff-activation-credential' AND key_hash=$2))
       ORDER BY occurred_at DESC`,
      [admissionStart.rows[0]!.started, key],
    );
    expect(settled.rows).toHaveLength(2);
    expect(new Set(settled.rows.map((row) => row.scope))).toEqual(new Set([
      "v1:staff-activation-client-address",
      "v1:staff-activation-credential",
    ]));
    const login = await fixture.request("/v1/staff/auth/native/login", {
      body: { email: command.email, password: activationPassword },
    });
    expect(login.status).toBe(200);
    await fixture.assertIndependentWriterConnections();
  }, 90_000);
});
