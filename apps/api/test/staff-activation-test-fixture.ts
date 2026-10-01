import { Client } from "pg";
import { StaffOnboardingTestFixture } from "./staff-onboarding-test-fixture";

export const ACTIVATION_PASSWORD = "Chosen activation password 240D!";
export function invitationToken(link: string) {
  return new URLSearchParams(new URL(link).hash.slice(1)).get("invite")!;
}

export class StaffActivationTestFixture extends StaffOnboardingTestFixture {
  activate(token: string, password = ACTIVATION_PASSWORD) {
    return this.request("/v1/staff/auth/activate", {
      origin: this.allowedOrigin,
      body: { inviteToken: token, password },
    });
  }
  async snapshot(member: string) {
    const result = await this.query<{
      user_status: string;
      status: string;
      version: number;
      password_hash: string | null;
      consumed: number;
      audits: number;
      sessions: number;
    }>(
      `SELECT u.status::text AS user_status,m.status::text AS status,m.version,u.password_hash,
      (SELECT count(*)::integer FROM staff_onboarding_invitations WHERE membership_id=m.id AND consumed_at IS NOT NULL) AS consumed,
      (SELECT count(*)::integer FROM audit_events WHERE entity_id=m.id AND event_type='STAFF_ONBOARDING_ACTIVATED') AS audits,
      (SELECT count(*)::integer FROM staff_auth_sessions WHERE user_id=u.id) AS sessions
      FROM organization_memberships m JOIN users u ON u.id=m.user_id WHERE m.id=$1`,
      [member],
    );
    return result.rows[0]!;
  }
  async userBarrier(member: string) {
    const client = new Client({
      connectionString: this.migrationDatabaseUrl(),
    });
    await client.connect();
    await client.query("BEGIN");
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtextextended('staff-user-security:' || user_id::text,0))
      FROM organization_memberships WHERE id=$1`,
      [member],
    );
    return client;
  }
}
