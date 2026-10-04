import {
  managementAuditEventSchema,
  type ManagementAuditEvent,
} from "@valet/contracts";

import type { ManagementAuditAuthorization } from "./management-audit-authorization";
import {
  isManagementAuditSupervisorEventType,
  managementAuditFamilyFor,
  managementAuditKnownEventTypes,
  managementAuditSupervisorEventTypes,
} from "./management-audit-event-catalog";
import { projectManagementAuditDetails } from "./management-audit-detail-projection";
import type { ManagementAuditQueryRow } from "./management-audit-query";

export { managementAuditKnownEventTypes, managementAuditSupervisorEventTypes };

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function projectActor(row: ManagementAuditQueryRow) {
  if (
    (row.actorType === "MEMBERSHIP" || row.actorType === null) &&
    row.actorMembershipId !== null &&
    uuidPattern.test(row.actorMembershipId)
  ) {
    return { type: "MEMBERSHIP" as const, membershipId: row.actorMembershipId };
  }
  if (
    row.actorType === "GUEST" ||
    row.actorType === "SYSTEM" ||
    row.actorType === "EXTERNAL_PROVIDER" ||
    row.actorType === "CONTROLLED_OPERATOR"
  ) {
    return { type: row.actorType };
  }
  return { type: "UNKNOWN" as const };
}

function projectEntity(row: ManagementAuditQueryRow) {
  if (!uuidPattern.test(row.entityId)) return null;
  const mapped = {
    ValetSession: "VALET_SESSION",
    VALET_SESSION: "VALET_SESSION",
    Vehicle: "VEHICLE",
    Customer: "CUSTOMER",
    Task: "TASK",
    Shift: "SHIFT",
    INCIDENT: "INCIDENT",
    Payment: "PAYMENT",
    Validation: "VALIDATION",
    CashEntry: "CASH_ENTRY",
    PaymentCollectionOperation: "PAYMENT_COLLECTION_OPERATION",
    Refund: "REFUND",
    Location: "LOCATION",
    Organization: "ORGANIZATION",
    OrganizationMembership: "ORGANIZATION_MEMBERSHIP",
    LocationMapPoint: "MAP_POINT",
    LocationMapArea: "MAP_AREA",
    KeySlot: "KEY_SLOT",
    ParkingSpot: "PARKING_SPOT",
    ShiftPresenceZone: "SHIFT_PRESENCE_ZONE",
    ShiftPresenceException: "SHIFT_PRESENCE_EXCEPTION",
  } as const;
  const type = mapped[row.entityType as keyof typeof mapped];
  return type === undefined ? null : { id: row.entityId, type };
}

function assertViewerScope(
  row: ManagementAuditQueryRow,
  viewer: ManagementAuditAuthorization,
): void {
  if (
    row.organizationId !== viewer.organizationId ||
    (viewer.scope === "LOCATION" && row.locationId !== viewer.locationId)
  ) {
    throw new Error("Management audit projection scope mismatch.");
  }
}

export function projectManagementAuditEvent(
  row: ManagementAuditQueryRow,
  viewer: ManagementAuditAuthorization,
): ManagementAuditEvent {
  assertViewerScope(row, viewer);
  const family = managementAuditFamilyFor(row.eventType);
  if (
    viewer.role === "VALET_SUPERVISOR" &&
    (family === null || !isManagementAuditSupervisorEventType(row.eventType))
  ) {
    throw new Error("Management audit event is not supervisor-visible.");
  }
  const envelope = {
    eventId: row.id,
    occurredAt: row.occurredAt.toISOString(),
    scope:
      row.locationId === null
        ? ({ kind: "ORGANIZATION" } as const)
        : ({ kind: "LOCATION", locationId: row.locationId } as const),
  };
  if (family === null) {
    return managementAuditEventSchema.parse({
      ...envelope,
      details: { kind: "UNKNOWN" },
      entity: null,
      eventType: "UNKNOWN",
    });
  }
  return managementAuditEventSchema.parse({
    ...envelope,
    actor: projectActor(row),
    details: projectManagementAuditDetails(
      family,
      row.metadataJson,
      row.eventType,
    ),
    entity: projectEntity(row),
    eventType: row.eventType,
  });
}
