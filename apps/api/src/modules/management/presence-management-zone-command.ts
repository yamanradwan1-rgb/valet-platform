import {
  shiftPresenceZoneSchema,
  type ShiftPresenceZoneCreateRequest,
  type ShiftPresenceZoneUpdateRequest,
} from "@valet/contracts";

import type { PostgresTransaction } from "../../common/database/postgres";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { requireMfaAssuranceInTransaction } from "../auth/mfa/mfa-assurance-policy";
import {
  createPresenceZone,
  updatePresenceZone,
} from "../shifts/shift-presence-zone";
import { lockShiftPresenceConfiguration } from "../shifts/shift-presence-policy";
import type { PresenceManagementActor } from "./presence-management-authority";
import {
  presenceLocationPolicy,
  presenceReadiness,
} from "./presence-management-projection";
import { requirePresenceResultReady } from "./presence-management-policy-command";
import { ManagementAccessDeniedError } from "./management-authorization";
import { PresenceManagementError } from "./presence-management-errors";
import { appendPresenceManagementAudit } from "./presence-management-audit";

const zoneColumns = `id::text,organization_id::text AS "organizationId",location_id::text AS "locationId",
  code,label,latitude,longitude,radius_meters AS "radiusMeters",state,revision`;

/** Result scope is already authorized; foreign global selectors still conceal. */
export async function readPresenceZoneResult(
  transaction: PostgresTransaction,
  actor: PresenceManagementActor,
  zoneId: string,
) {
  const result = await transaction.query(
    `SELECT ${zoneColumns} FROM shift_presence_zones WHERE id=$1`,
    [zoneId],
  );
  const row = result.rows[0];
  if (row === undefined) return null;
  if (
    row.organizationId !== actor.organizationId ||
    row.locationId !== actor.locationId
  )
    throw new ManagementAccessDeniedError();
  return shiftPresenceZoneSchema.parse(row);
}

export async function readPresenceZone(
  transaction: PostgresTransaction,
  actor: PresenceManagementActor,
  zoneId: string,
) {
  const result = await transaction.query(
    `SELECT ${zoneColumns} FROM shift_presence_zones
    WHERE organization_id=$1 AND location_id=$2 AND id=$3`,
    [actor.organizationId, actor.locationId, zoneId],
  );
  if (result.rows[0] === undefined) throw new ManagementAccessDeniedError();
  return shiftPresenceZoneSchema.parse(result.rows[0]);
}

export async function listPresenceZones(
  transaction: PostgresTransaction,
  actor: PresenceManagementActor,
  query: { limit: number; cursor?: string | undefined },
) {
  const result = await transaction.query(
    `SELECT ${zoneColumns} FROM shift_presence_zones
    WHERE organization_id=$1 AND location_id=$2 AND ($3::uuid IS NULL OR id>$3)
    ORDER BY id LIMIT $4`,
    [
      actor.organizationId,
      actor.locationId,
      query.cursor ?? null,
      query.limit + 1,
    ],
  );
  const items = result.rows
    .slice(0, query.limit)
    .map((row) => shiftPresenceZoneSchema.parse(row));
  return {
    items,
    nextCursor: result.rows.length > query.limit ? items.at(-1)!.id : null,
  };
}

export async function writePresenceZone(
  transaction: PostgresTransaction,
  context: StaffSessionContext,
  actor: PresenceManagementActor,
  command: ShiftPresenceZoneCreateRequest | ShiftPresenceZoneUpdateRequest,
  zoneId?: string,
) {
  if (
    (
      await transaction.query(`SELECT id FROM audit_events WHERE id=$1`, [
        command.mutationId,
      ])
    ).rowCount !== 0
  ) {
    throw new PresenceManagementError("PRESENCE_MUTATION_CONFLICT");
  }
  const creating = "zoneId" in command;
  const id = creating ? command.zoneId : zoneId!;
  const before = creating
    ? undefined
    : await readPresenceZone(transaction, actor, id);
  if (
    before !== undefined &&
    "expectedRevision" in command &&
    before.revision !== command.expectedRevision
  ) {
    throw new PresenceManagementError("PRESENCE_CONFIGURATION_CONFLICT");
  }
  const candidate = shiftPresenceZoneSchema.parse({
    id,
    organizationId: actor.organizationId,
    locationId: actor.locationId,
    code: command.code,
    label: command.label,
    latitude: command.latitude,
    longitude: command.longitude,
    radiusMeters: command.radiusMeters,
    state: command.state,
    revision: before?.revision ?? 1,
  });
  const configuration = await lockShiftPresenceConfiguration(transaction, {
    organizationId: actor.organizationId,
    locationId: actor.locationId!,
  });
  const zones = [
    ...configuration.zones.filter((zone) => zone.id !== id),
    candidate,
  ];
  const clock = await transaction.query<{ now: Date }>(
    `SELECT clock_timestamp() AS now`,
  );
  const ready = presenceReadiness(configuration.policy, zones, {
    companyRevision: configuration.companyRevision,
    locationRevision: configuration.locationRevision,
    configurationFingerprint: configuration.fingerprint,
    observedAt: clock.rows[0]!.now.toISOString(),
  });
  requirePresenceResultReady(configuration.policy, ready.configurationUsable);
  await requireMfaAssuranceInTransaction(transaction, context, {
    sensitive: true,
  });
  if (creating) await createPresenceZone(transaction, candidate);
  else await updatePresenceZone(transaction, candidate);
  const persisted = await readPresenceZone(transaction, actor, id);
  await appendPresenceManagementAudit(transaction, actor, command.mutationId, {
    eventType: creating
      ? "SHIFT_PRESENCE_ZONE_CREATED"
      : "SHIFT_PRESENCE_ZONE_UPDATED",
    entityType: "ShiftPresenceZone",
    entityId: id,
    revision: persisted.revision,
    state: persisted.state,
  });
  const projection = await presenceLocationPolicy(
    transaction,
    actor.organizationId,
    actor.locationId!,
  );
  return { zone: persisted, readiness: projection.readiness };
}
