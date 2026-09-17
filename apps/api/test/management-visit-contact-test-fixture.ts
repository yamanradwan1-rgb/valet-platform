import { randomUUID } from "node:crypto";

import { ManagementAuditTestFixture } from "./management-audit-test-fixture";

export interface VisitSeed {
  readonly completedAt?: string | null;
  readonly createdAt?: string;
  readonly customerId?: string | null;
  readonly locationId: string;
  readonly membershipId: string;
  readonly organizationId: string;
  readonly sessionId?: string;
  readonly state?: string;
  readonly vehicleId: string;
}

export class ManagementVisitContactTestFixture extends ManagementAuditTestFixture {
  async createCustomer(
    organizationId: string,
    phone = "+962790000001",
    displayName: string | null = "Visit Contact",
    customerId = randomUUID(),
  ): Promise<string> {
    await this.query(
      `INSERT INTO customers(id,organization_id,phone_normalized,display_name,updated_at)
       VALUES($1,$2,$3,$4,transaction_timestamp())`,
      [customerId, organizationId, phone, displayName],
    );
    return customerId;
  }

  async createVehicle(
    organizationId: string,
    input: {
      plateCountry?: string;
      plateNumber?: string;
      temporaryDescriptor?: string;
    } = {},
  ): Promise<string> {
    const id = randomUUID();
    const raw = input.plateNumber ?? null;
    const normalized = raw?.normalize("NFKC").toUpperCase().replace(/[\s\-./\\]+/gu, "") ?? null;
    await this.query(
      `INSERT INTO vehicles(id,organization_id,plate_country,plate_number_raw,
         plate_number_normalized,temporary_descriptor,updated_at)
       VALUES($1,$2,$3,$4,$5,$6,transaction_timestamp())`,
      [
        id,
        organizationId,
        raw === null ? null : (input.plateCountry ?? "JO"),
        raw,
        normalized,
        raw === null ? (input.temporaryDescriptor ?? `Vehicle ${id}`) : null,
      ],
    );
    return id;
  }

  async createVisit(input: VisitSeed): Promise<string> {
    const id = input.sessionId ?? randomUUID();
    const state = input.state ?? "COMPLETED";
    const completedAt = state === "COMPLETED"
      ? (input.completedAt ?? input.createdAt ?? new Date().toISOString())
      : null;
    await this.query(
      `INSERT INTO valet_sessions(
         id,customer_access_token_hash,customer_access_expires_at,
         organization_id,location_id,vehicle_id,customer_id,state,
         checked_in_by_membership_id,created_at,completed_at,updated_at)
       VALUES($1,$2,clock_timestamp()+interval '1 day',$3,$4,$5,$6,$7,$8,
         COALESCE($9::timestamptz,clock_timestamp()),$10::timestamptz,clock_timestamp())`,
      [
        id,
        `visit-contact-${id}`,
        input.organizationId,
        input.locationId,
        input.vehicleId,
        input.customerId ?? null,
        state,
        input.membershipId,
        input.createdAt ?? null,
        completedAt,
      ],
    );
    return id;
  }

  async customerState(customerId: string) {
    const result = await this.query<{
      display_name: string | null;
      phone_normalized: string;
      updated_at: Date;
    }>(
      `SELECT display_name,phone_normalized,updated_at FROM customers WHERE id=$1`,
      [customerId],
    );
    const row = result.rows[0];
    if (row === undefined) throw new Error("Customer fixture missing.");
    return row;
  }

  async eventRows(organizationId: string, eventType?: string) {
    return this.query<{
      actor_membership_id: string | null;
      event_type: string;
      location_id: string | null;
      metadata_json: unknown;
    }>(
      `SELECT actor_membership_id::text,event_type,location_id::text,metadata_json
       FROM audit_events WHERE organization_id=$1
         AND ($2::text IS NULL OR event_type=$2)
       ORDER BY occurred_at,id`,
      [organizationId, eventType ?? null],
    );
  }
}
