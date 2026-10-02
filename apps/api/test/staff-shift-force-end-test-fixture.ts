import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";
import type { StaffSessionContext } from "../src/modules/auth/staff-session-context";
import {
  ManagementControlPlaneTestFixture,
  type ManagementTestRole,
} from "./management-control-plane-test-fixture";

export class StaffShiftForceEndTestFixture extends ManagementControlPlaneTestFixture {
  async scenario(role: ManagementTestRole = "ORG_ADMIN") {
    const actorUser = await this.createUser();
    const actor = await this.createMembership(actorUser.id, { role });
    const auth = await this.nativeLogin(actorUser);
    const factor =
      role === "ORG_ADMIN" || role === "LOCATION_MANAGER"
        ? await this.enrollAndAssure(auth)
        : null;
    const location = await this.addLocation(actor.organizationId);
    const outside = await this.addLocation(actor.organizationId);
    if (role !== "ORG_ADMIN")
      await this.grant(
        actor.organizationId,
        actor.membershipId,
        location.locationId,
      );
    const targetUser = await this.createUser();
    const membershipId = await this.addMembership(
      actor.organizationId,
      targetUser.id,
      "VALET_EMPLOYEE",
    );
    // Mixed target coverage deliberately proves Force End is Shift-Location authority.
    await this.grant(actor.organizationId, membershipId, location.locationId);
    await this.grant(actor.organizationId, membershipId, outside.locationId);
    const shiftId = randomUUID();
    await this.query(
      `INSERT INTO shifts(id,organization_id,location_id,membership_id,status,started_at)
      VALUES($1,$2,$3,$4,'ACTIVE',clock_timestamp()-interval '1 hour')`,
      [shiftId, actor.organizationId, location.locationId, membershipId],
    );
    const command = {
      operationId: randomUUID(),
      confirmation: "FORCE_END_SHIFT" as const,
      reason: "سبب — administrative closure <script>text</script>",
    };
    const context: StaffSessionContext = {
      createdAt: new Date(),
      userId: actorUser.id,
      staffAuthSessionId: auth.sessionId,
      accessTokenHash: `staff-access-sha256:v1:${createHash("sha256").update(auth.accessToken).digest("hex")}`,
    };
    return {
      ...actor,
      actorMembershipId: actor.membershipId,
      auth,
      factor,
      actorUser,
      targetUser,
      membershipId,
      shiftId,
      locationId: location.locationId,
      outsideId: outside.locationId,
      command,
      context,
      path: `/v1/staff/management/organizations/${actor.organizationId}/shifts/${shiftId}/force-end`,
    };
  }

  async grant(
    organizationId: string,
    membershipId: string,
    locationId: string,
  ) {
    await this.query(
      `INSERT INTO membership_location_access(organization_id,membership_id,location_id)
      VALUES($1,$2,$3)`,
      [organizationId, membershipId, locationId],
    );
  }

  force(
    s: Awaited<ReturnType<StaffShiftForceEndTestFixture["scenario"]>>,
    command: unknown = s.command,
  ) {
    return this.managementPost(s.path, s.auth.accessToken, command);
  }

  async snapshot(shiftId: string) {
    const row = await this.query<Record<string, unknown>>(
      `SELECT status::text, ended_at, cash_expected, cash_reported,
      cash_variance,cash_currency,cash_reported_at,cash_reported_by_membership_id,
      (SELECT count(*)::int FROM shift_force_end_closures c WHERE c.shift_id=s.id) AS closures,
      (SELECT count(*)::int FROM audit_events a WHERE a.entity_id=s.id AND a.event_type='SHIFT_FORCE_ENDED') AS audits
      FROM shifts s WHERE s.id=$1`,
      [shiftId],
    );
    return row.rows[0]!;
  }

  async task(
    s: Awaited<ReturnType<StaffShiftForceEndTestFixture["scenario"]>>,
    status = "QUEUED",
  ) {
    const vehicleId = randomUUID(),
      sessionId = randomUUID(),
      taskId = randomUUID();
    await this.query(
      `INSERT INTO vehicles(id,organization_id,temporary_descriptor,updated_at)
      VALUES($1,$2,'test',now())`,
      [vehicleId, s.organizationId],
    );
    await this.query(
      `INSERT INTO valet_sessions(id,organization_id,location_id,vehicle_id,
      customer_access_token_hash,customer_access_expires_at,state,checked_in_by_membership_id,updated_at)
      VALUES($1,$2,$3,$4,$5,now()+interval '1 hour','AWAITING_PARKING',$6,now())`,
      [
        sessionId,
        s.organizationId,
        s.locationId,
        vehicleId,
        `test:${randomUUID()}`,
        s.membershipId,
      ],
    );
    await this.query(
      `INSERT INTO tasks(id,organization_id,location_id,valet_session_id,task_type,
      status,current_assignee_membership_id,updated_at) VALUES($1,$2,$3,$4,'PARKING',$5,$6,now())`,
      [
        taskId,
        s.organizationId,
        s.locationId,
        sessionId,
        status,
        status === "QUEUED" ? null : s.membershipId,
      ],
    );
    return { taskId, sessionId };
  }

  runtimePool() {
    return new Pool({ connectionString: this.runtimeDatabaseUrl() });
  }
}

export type ForceEndScenario = Awaited<
  ReturnType<StaffShiftForceEndTestFixture["scenario"]>
>;
