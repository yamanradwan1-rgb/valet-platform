import { randomUUID } from "node:crypto";

import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";

export interface AuditInsertInput {
  readonly actorMembershipId?: string | null;
  readonly actorType?:
    | "CONTROLLED_OPERATOR"
    | "EXTERNAL_PROVIDER"
    | "GUEST"
    | "MEMBERSHIP"
    | "SYSTEM";
  readonly controlledOperatorRef?: string | null;
  readonly createdAt?: Date;
  readonly entityId?: string;
  readonly entityType?: string;
  readonly eventType: string;
  readonly locationId?: string | null;
  readonly metadata?: unknown;
  readonly occurredAt?: Date;
  readonly organizationId: string;
  readonly valetSessionId?: string | null;
}

export class ManagementAuditTestFixture extends ManagementControlPlaneTestFixture {
  async grantLocationAccess(
    organizationId: string,
    membershipId: string,
    locationId: string,
  ): Promise<void> {
    await this.query(
      `INSERT INTO membership_location_access
         (organization_id, membership_id, location_id)
       VALUES ($1, $2, $3)`,
      [organizationId, membershipId, locationId],
    );
  }

  async startActiveShift(
    organizationId: string,
    locationId: string,
    membershipId: string,
  ): Promise<string> {
    const shiftId = randomUUID();
    await this.query(
      `INSERT INTO shifts
         (id, organization_id, location_id, membership_id, status, started_at)
       VALUES ($1, $2, $3, $4, 'ACTIVE', clock_timestamp())`,
      [shiftId, organizationId, locationId, membershipId],
    );
    return shiftId;
  }

  async endShift(shiftId: string): Promise<void> {
    await this.query(
      `UPDATE shifts
       SET status = 'ENDED', ended_at = clock_timestamp()
       WHERE id = $1`,
      [shiftId],
    );
  }

  async insertAuditEvent(input: AuditInsertInput): Promise<string> {
    const id = randomUUID();
    const actorMembershipId = input.actorMembershipId ?? null;
    const actorType =
      input.actorType ??
      (actorMembershipId === null ? "SYSTEM" : "MEMBERSHIP");
    await this.query(
      `INSERT INTO audit_events
         (id, organization_id, location_id, valet_session_id,
          actor_membership_id, actor_type, controlled_operator_ref,
          event_type, entity_type, entity_id, metadata_json,
          occurred_at${input.createdAt === undefined ? "" : ", created_at"})
       VALUES ($1, $2, $3, $4, $5, $6::audit_actor_type, $7,
               $8, $9, $10, $11::jsonb, $12
               ${input.createdAt === undefined ? "" : ", $13"})`,
      [
        id,
        input.organizationId,
        input.locationId ?? null,
        input.valetSessionId ?? null,
        actorMembershipId,
        actorType,
        input.controlledOperatorRef ?? null,
        input.eventType,
        input.entityType ?? "Location",
        input.entityId ?? input.locationId ?? input.organizationId,
        JSON.stringify(input.metadata ?? {}),
        input.occurredAt ?? new Date(),
        ...(input.createdAt === undefined ? [] : [input.createdAt]),
      ],
    );
    return id;
  }

  async insertAccountSecurityEvent(input: {
    readonly actorUserId?: string | null;
    readonly eventType: string;
    readonly subjectUserId?: string | null;
  }): Promise<string> {
    const id = randomUUID();
    const actorUserId = input.actorUserId ?? null;
    await this.query(
      `INSERT INTO account_security_audit_events
         (id, event_type, subject_user_id, actor_type, actor_user_id,
          controlled_operator_ref, occurred_at)
       VALUES ($1, $2, $3,
               CASE WHEN $4::uuid IS NULL THEN 'SYSTEM'::account_security_actor_type
                    ELSE 'USER'::account_security_actor_type END,
               $4, NULL, clock_timestamp())`,
      [id, input.eventType, input.subjectUserId ?? null, actorUserId],
    );
    return id;
  }

  async auditCount(organizationId: string): Promise<number> {
    const result = await this.query<{ readonly count: string }>(
      `SELECT count(*)::text AS count
       FROM audit_events
       WHERE organization_id = $1`,
      [organizationId],
    );
    return Number(result.rows[0]?.count ?? "0");
  }
}
