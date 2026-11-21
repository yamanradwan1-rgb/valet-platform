import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { hashStaffPassword } from "../src/modules/auth/staff-password-hashing";
import { staffInvitationHash } from "../src/modules/management/staff-invitation-credential";
import {
  StaffOnboardingTestFixture,
  issued,
} from "./staff-onboarding-test-fixture";
const fixture = new StaffOnboardingTestFixture();
beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);
describe("T05-C PostgreSQL constraints and runtime command boundary", () => {
  it("enforces invitation FK/check/unique/current invariants and password lifecycle", async () => {
    const actor = await fixture.actor();
    const fresh = issued(await fixture.create(actor));
    for (const [changes, code] of [
      ["id=gen_random_uuid()", "23505"],
      [
        "id=gen_random_uuid(),operation_id=gen_random_uuid(),token_hash='staff-invite-sha256:v1:'||repeat('b',64),revoked_at=clock_timestamp()",
        "23505",
      ],
      [
        "id=gen_random_uuid(),generation=0,operation_id=gen_random_uuid(),token_hash='staff-invite-sha256:v1:'||repeat('b',64)",
        "23514",
      ],
      [
        "id=gen_random_uuid(),generation=2,operation_id=gen_random_uuid(),token_hash='staff-invite-sha256:v1:'||repeat('b',64)",
        "23505",
      ],
      [
        "id=gen_random_uuid(),generation=2,operation_id=gen_random_uuid(),revoked_at=clock_timestamp()",
        "23505",
      ],
      [
        "id=gen_random_uuid(),generation=2,token_hash='staff-invite-sha256:v1:'||repeat('b',64),revoked_at=clock_timestamp()",
        "23505",
      ],
      [
        "id=gen_random_uuid(),generation=2,operation_id=gen_random_uuid(),token_hash='staff-invite-sha256:v1:'||repeat('b',64),organization_id=gen_random_uuid(),revoked_at=clock_timestamp()",
        "23503",
      ],
      [
        "id=gen_random_uuid(),generation=2,operation_id=gen_random_uuid(),token_hash='staff-invite-sha256:v1:'||repeat('b',64),issued_by_membership_id=gen_random_uuid(),revoked_at=clock_timestamp()",
        "23503",
      ],
      [
        "id=gen_random_uuid(),generation=2,operation_id=gen_random_uuid(),token_hash='staff-invite-sha256:v1:'||repeat('b',64),expires_at=created_at",
        "23514",
      ],
    ] as const) {
      // Build a temporary composite record in SQL, leaving original history untouched.
      // Override bounded fixture columns in INSERT SELECT; failed rows never persist.
      const columns = [
        "id",
        "organization_id",
        "membership_id",
        "issued_by_membership_id",
        "generation",
        "operation_id",
        "request_fingerprint",
        "token_hash",
        "created_at",
        "expires_at",
        "consumed_at",
        "revoked_at",
      ];
      const overrides = new Map<string, string>();
      for (const match of changes.matchAll(/(?:^|,)(\w+)=(.*?)(?=,\w+=|$)/g))
        overrides.set(match[1]!, match[2]!);
      await expect(
        fixture.query(
          `INSERT INTO staff_onboarding_invitations SELECT ${columns.map((column) => overrides.get(column) ?? column).join(",")} FROM staff_onboarding_invitations WHERE id=$1`,
          [fresh.invitationId],
        ),
      ).rejects.toMatchObject({ code });
    }
    await expect(
      fixture.query(
        "INSERT INTO users(id,email,password_hash,status,updated_at) VALUES($1,$2,NULL,'ACTIVE',now())",
        [randomUUID(), `${randomUUID()}@example.com`],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      fixture.query(
        "INSERT INTO users(id,email,password_hash,status,updated_at) VALUES($1,$2,'fake','PENDING',now())",
        [randomUUID(), `${randomUUID()}@example.com`],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });
  it("provisions twice safely; only entrypoints execute, protected DML/private helpers/PUBLIC denied", async () => {
    const root = resolve(process.cwd(), "../..");
    const dbRoot = resolve(root, "packages/database");
    for (let attempt = 0; attempt < 2; attempt++) {
      execFileSync(process.execPath, ["scripts/provision-runtime-role.mjs"], {
        cwd: dbRoot,
        env: {
          ...process.env,
          NODE_ENV: "test",
          DATABASE_URL: fixture.runtimeDatabaseUrl(),
          MIGRATION_DATABASE_URL: fixture.migrationDatabaseUrl(),
        },
        stdio: "pipe",
        windowsHide: true,
      });
    }
    const runtime = new Client({
      connectionString: fixture.runtimeDatabaseUrl(),
    });
    await runtime.connect();
    try {
      for (const sql of [
        "UPDATE users SET password_hash='forbidden' WHERE FALSE",
        "UPDATE users SET status='ACTIVE' WHERE FALSE",
        "UPDATE organization_memberships SET status='ACTIVE' WHERE FALSE",
      ])
        await expect(runtime.query(sql)).rejects.toMatchObject({
          code: "42501",
        });
      await expect(
        runtime.query("SELECT staff_onboarding_activate('unknown',NULL,NULL)"),
      ).rejects.toMatchObject({
        code: "42501",
      });
      for (const table of [
        "users",
        "organization_memberships",
        "membership_location_access",
        "staff_onboarding_invitations",
      ]) {
        await expect(
          runtime.query(`INSERT INTO ${table} DEFAULT VALUES`),
        ).rejects.toMatchObject({ code: "42501" });
        await expect(
          runtime.query(`DELETE FROM ${table} WHERE FALSE`),
        ).rejects.toMatchObject({ code: "42501" });
      }
      await expect(
        runtime.query(
          "UPDATE staff_onboarding_invitations SET revoked_at=clock_timestamp() WHERE FALSE",
        ),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        runtime.query("SELECT staff_onboarding_proof_current($1)", [
          randomUUID(),
        ]),
      ).rejects.toMatchObject({ code: "42501" });
      const privileges = await runtime.query<{
        public_safe: boolean;
        path_safe: boolean;
        security_safe: boolean;
      }>(
        `SELECT bool_and(NOT EXISTS(SELECT 1 FROM aclexplode(COALESCE(proacl,acldefault('f',proowner))) acl WHERE grantee=0 AND privilege_type='EXECUTE')) AS public_safe,
          bool_and(proconfig=ARRAY['search_path=pg_catalog, public']::text[]) AS path_safe,
          bool_and(prosecdef) FILTER(WHERE proname IN ('staff_onboarding_create','staff_onboarding_resend','staff_onboarding_activate')) AS security_safe
         FROM pg_proc WHERE proname LIKE 'staff_onboarding_%'`,
      );
      expect(privileges.rows[0]).toEqual({
        public_safe: true,
        path_safe: true,
        security_safe: true,
      });
      const actor = await fixture.actor();
      await expect(
        runtime.query(
          "INSERT INTO audit_events(id,organization_id,actor_membership_id,event_type,entity_type,entity_id,metadata_json,occurred_at) VALUES($1,$2,$3,'STAFF_ONBOARDING_ACTIVATED','OrganizationMembership',$3,'{}',clock_timestamp())",
          [randomUUID(), actor.organizationId, actor.membershipId],
        ),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        runtime.query(
          "INSERT INTO audit_events(id,organization_id,actor_membership_id,event_type,entity_type,entity_id,metadata_json,occurred_at) VALUES($1,$2,$3,'STAFF_ONBOARDING_INVITATION_ISSUED','OrganizationMembership',$3,'{}',clock_timestamp())",
          [randomUUID(), actor.organizationId, actor.membershipId],
        ),
      ).rejects.toMatchObject({ code: "42501" });
      const fresh = issued(await fixture.create(actor));
      // An ordinary SQL principal knows the complete invitation token here.
      // A pending account must stay pending even if the caller supplies a valid
      // credential digest and a correctly encoded Argon2 password hash.
      const token = new URLSearchParams(new URL(fresh.activationLink).hash.slice(1))
        .get("invite");
      expect(token).not.toBeNull();
      await expect(
        runtime.query("SELECT staff_onboarding_activate($1,NULL,$2)", [
          staffInvitationHash(token!),
          await hashStaffPassword("Attempted SQL activation 240D!"),
        ]),
      ).rejects.toMatchObject({ code: "42501" });
      const stillPending = await fixture.query<{
        user_status: string;
        membership_status: string;
        consumed: boolean;
      }>(
        `SELECT account.status::text AS user_status,
                member.status::text AS membership_status,
                invitation.consumed_at IS NOT NULL AS consumed
         FROM staff_onboarding_invitations invitation
         JOIN organization_memberships member ON member.id=invitation.membership_id
         JOIN users account ON account.id=member.user_id
         WHERE invitation.id=$1`,
        [fresh.invitationId],
      );
      expect(stillPending.rows[0]).toEqual({
        user_status: "PENDING",
        membership_status: "PENDING",
        consumed: false,
      });
      const authorized = await fixture.request("/v1/staff/auth/activate", {
        origin: fixture.allowedOrigin,
        body: { inviteToken: token, password: "Authorized activation password 240D!" },
      });
      expect(authorized.status).toBe(200);
      for (const [sql, values] of [
        [
          "SELECT staff_management_set_role($1,$2,$3,1,'VALET_SUPERVISOR')",
          [actor.membershipId, actor.organizationId, fresh.membershipId],
        ],
        [
          "SELECT staff_management_set_status($1,$2,$3,1,'ACTIVE')",
          [actor.membershipId, actor.organizationId, fresh.membershipId],
        ],
        [
          "SELECT staff_management_set_location_access($1,$2,$3,1,$4::uuid[],TRUE)",
          [
            actor.membershipId,
            actor.organizationId,
            fresh.membershipId,
            [actor.locationId],
          ],
        ],
      ] as const)
        await expect(runtime.query(sql, [...values])).rejects.toMatchObject({
          code: "42501",
        });
    } finally {
      await runtime.end();
    }
  }, 60_000);
});
