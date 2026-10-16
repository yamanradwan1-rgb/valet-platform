import { randomUUID } from "node:crypto";

import type { Client } from "pg";
import { expect } from "vitest";

export const requiredAuditColumns = [
  "id", "organization_id", "event_type", "entity_type",
  "entity_id", "metadata_json", "occurred_at",
] as const;

/** Verify constraints through real INSERTs as well as the catalog audit. */
export async function expectAuditRequiredFieldWriteGuards(
  client: Client,
  organizationId: string,
): Promise<void> {
  for (const [index, column] of requiredAuditColumns.entries()) {
    const values: unknown[] = [
      randomUUID(), organizationId, "vehicle.recorded", "Vehicle",
      randomUUID(), { source: "integrity-test" }, new Date(),
    ];
    values[index] = null;
    // An omitted event type is denied by the hardened audit authorization
    // before PostgreSQL reaches its underlying NOT NULL constraint.
    const code = column === "event_type" ? "42501" : "23502";
    await expect(client.query(
      `INSERT INTO audit_events (
         id, organization_id, actor_type, event_type,
         entity_type, entity_id, metadata_json, occurred_at
       ) VALUES ($1, $2, 'SYSTEM', $3, $4, $5, $6, $7)`,
      values,
    )).rejects.toMatchObject({ code });
  }
}
