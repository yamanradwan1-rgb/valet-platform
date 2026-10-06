import { randomBytes, randomUUID } from "node:crypto";

import type { ShiftPresenceMode } from "@valet/contracts";
import {
  generateStaffCredential,
  staffCredentialHash,
} from "../src/modules/auth/staff-auth-credential";
import type { StaffSessionContext } from "../src/modules/auth/staff-session-context";
import { ShiftPresenceService } from "../src/modules/shifts/shift-presence.service";
import { PresenceManagementService } from "../src/modules/management/presence-management.service";
import { createStartShiftCommandExecutor } from "../src/modules/shifts/start-shift-command";
import { createEndShiftCommandExecutor } from "../src/modules/shifts/end-shift-command";
import {
  ShiftTestContext,
  type ShiftFixture,
  type TestRole,
} from "./shift-test-context";

export class PresenceServerTestContext extends ShiftTestContext {
  private readonly previousKey = process.env.SHIFT_PRESENCE_FINGERPRINT_KEY;
  private readonly previousKeys =
    process.env.SHIFT_PRESENCE_PREVIOUS_FINGERPRINT_KEYS;
  private readonly previousAbuseKey = process.env.ANTI_ABUSE_HMAC_SECRET_B64URL;
  readonly key = randomBytes(32);
  presence!: ShiftPresenceService;
  management!: PresenceManagementService;

  override async setup() {
    await super.setup();
    process.env.SHIFT_PRESENCE_FINGERPRINT_KEY = this.key.toString("base64");
    delete process.env.SHIFT_PRESENCE_PREVIOUS_FINGERPRINT_KEYS;
    process.env.ANTI_ABUSE_HMAC_SECRET_B64URL =
      randomBytes(32).toString("base64url");
    this.presence = new ShiftPresenceService(this.runtimePool);
    this.management = new PresenceManagementService(this.runtimePool);
  }
  override async teardown() {
    await super.teardown();
    if (this.previousAbuseKey === undefined)
      delete process.env.ANTI_ABUSE_HMAC_SECRET_B64URL;
    else process.env.ANTI_ABUSE_HMAC_SECRET_B64URL = this.previousAbuseKey;
    if (this.previousKey === undefined)
      delete process.env.SHIFT_PRESENCE_FINGERPRINT_KEY;
    else process.env.SHIFT_PRESENCE_FINGERPRINT_KEY = this.previousKey;
    if (this.previousKeys === undefined)
      delete process.env.SHIFT_PRESENCE_PREVIOUS_FINGERPRINT_KEYS;
    else
      process.env.SHIFT_PRESENCE_PREVIOUS_FINGERPRINT_KEYS = this.previousKeys;
  }
  async policy(
    fixture: ShiftFixture,
    start: ShiftPresenceMode,
    end: ShiftPresenceMode = start,
  ) {
    await this.adminPool.query(
      `UPDATE organizations SET shift_start_presence_mode=$2,
      shift_end_presence_mode=$3 WHERE id=$1`,
      [fixture.organizationId, start, end],
    );
  }
  async zone(fixture: ShiftFixture) {
    const id = randomUUID();
    await this.adminPool.query(
      `INSERT INTO shift_presence_zones
      (id,organization_id,location_id,code,label,latitude,longitude,radius_meters,state)
      VALUES($1,$2,$3,$4,'Synthetic attendance zone',31.95,35.91,100,'ACTIVE')`,
      [id, fixture.organizationId, fixture.locationId, randomUUID()],
    );
    return id;
  }
  async session(userId: string, assured = false) {
    const token = generateStaffCredential("vsa1.");
    const id = randomUUID();
    const hash = staffCredentialHash("access", token);
    let factor: string | null = null;
    if (assured) {
      factor = randomUUID();
      await this.adminPool.query(
        `INSERT INTO user_mfa_totp_factors
        (id,user_id,state,protected_secret,last_accepted_step,recovery_set_generation,activated_at)
        VALUES($1,$2,'ACTIVE',$3,1,1,clock_timestamp())`,
        [
          factor,
          userId,
          `mte1.${"a".repeat(16)}.${"b".repeat(32)}.${"c".repeat(22)}`,
        ],
      );
    }
    const row = await this.adminPool.query<{ created_at: Date }>(
      `INSERT INTO staff_auth_sessions
      (id,user_id,current_access_token_hash,access_expires_at,absolute_expires_at,last_rotated_at,
       mfa_factor_id,mfa_authenticated_at,last_admin_activity_at)
      VALUES($1,$2,$3,clock_timestamp()+interval '1 hour',clock_timestamp()+interval '1 day',clock_timestamp(),
        $4,CASE WHEN $4::uuid IS NULL THEN NULL ELSE clock_timestamp() END,
        CASE WHEN $4::uuid IS NULL THEN NULL ELSE clock_timestamp() END) RETURNING created_at`,
      [id, userId, hash, factor],
    );
    const context: StaffSessionContext = {
      userId,
      staffAuthSessionId: id,
      accessTokenHash: hash,
      createdAt: row.rows[0]!.created_at,
    };
    return { context, token, factorId: factor };
  }
  async manager(
    fixture: ShiftFixture,
    role: TestRole = "ORG_ADMIN",
    userId: string = randomUUID(),
  ) {
    const member = randomUUID();
    await this.adminPool.query(
      `INSERT INTO users(id,email,password_hash,status,updated_at)
      VALUES($1,$2,'synthetic-test-only','ACTIVE',clock_timestamp()) ON CONFLICT(id) DO NOTHING`,
      [userId, `${userId}@gpsb.test`],
    );
    await this.adminPool.query(
      `INSERT INTO organization_memberships(id,organization_id,user_id,role,status,updated_at)
      VALUES($1,$2,$3,$4,'ACTIVE',clock_timestamp())`,
      [member, fixture.organizationId, userId, role],
    );
    await this.adminPool.query(
      `INSERT INTO membership_location_access(organization_id,membership_id,location_id)
      VALUES($1,$2,$3)`,
      [fixture.organizationId, member, fixture.locationId],
    );
    await this.adminPool.query(
      `UPDATE organization_subscriptions SET dashboard_access_enabled=TRUE WHERE organization_id=$1`,
      [fixture.organizationId],
    );
    return {
      ...(await this.session(userId, true)),
      membershipId: member,
      userId,
      companyTarget: {
        authority: "COMPANY_ADMIN" as const,
        organizationId: fixture.organizationId,
      },
      target: {
        authority:
          role === "LOCATION_MANAGER"
            ? ("LOCATION_MANAGER" as const)
            : ("COMPANY_ADMIN" as const),
        organizationId: fixture.organizationId,
        locationId: fixture.locationId,
      },
    };
  }
  async challenge(
    fixture: ShiftFixture,
    session: StaffSessionContext,
    shiftId?: string,
    cashReported = "0",
  ) {
    return this.presence.issue(
      session,
      shiftId === undefined
        ? {
            action: "START",
            targetLocationId: fixture.locationId,
            operationId: randomUUID(),
          }
        : { action: "END", shiftId, cashReported, operationId: randomUUID() },
    );
  }
  measured(
    challenge: Awaited<ReturnType<PresenceServerTestContext["challenge"]>>,
    latitude = 31.95,
  ) {
    return {
      kind: "MEASURED" as const,
      operationId: challenge.operationId,
      challengeId: challenge.challengeId,
      clientSampleId: randomUUID(),
      measurement: {
        latitude,
        longitude: 35.91,
        accuracyMeters: 5,
        capturedAt: new Date().toISOString(),
      },
    };
  }
  start(
    fixture: ShiftFixture,
    context?: StaffSessionContext,
    presence?: ReturnType<PresenceServerTestContext["measured"]>,
  ) {
    return createStartShiftCommandExecutor(this.runtimePool)({
      authenticatedUserId: fixture.userId,
      targetLocationId: fixture.locationId,
      ...(context === undefined ? {} : { sessionContext: context }),
      ...(presence === undefined ? {} : { presence }),
    });
  }
  end(
    fixture: ShiftFixture,
    shiftId: string,
    cashReported = "0",
    presence?: ReturnType<PresenceServerTestContext["measured"]>,
  ) {
    return createEndShiftCommandExecutor(this.runtimePool)({
      authenticatedUserId: fixture.userId,
      shiftId,
      cashReported,
      ...(presence === undefined ? {} : { presence }),
    });
  }
  async facts(fixture: ShiftFixture) {
    const result = await this.adminPool.query(
      `SELECT
      (SELECT count(*)::int FROM shifts WHERE membership_id=$1) AS shifts,
      (SELECT count(*)::int FROM shift_presence_decisions WHERE membership_id=$1) AS decisions,
      (SELECT count(*)::int FROM audit_events WHERE actor_membership_id=$1 AND event_type='SHIFT_STARTED') AS starts,
      (SELECT count(*)::int FROM audit_events WHERE actor_membership_id=$1 AND event_type='SHIFT_ENDED') AS ends`,
      [fixture.membershipId],
    );
    return result.rows[0];
  }
}
