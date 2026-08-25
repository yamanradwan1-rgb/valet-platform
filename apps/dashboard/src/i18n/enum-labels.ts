import type {
  DashboardSessionState,
  DashboardTaskStatus,
} from "@valet/contracts";

import type { TranslationKey } from "./translations/types";

/**
 * Enum-to-human-label mapping.
 *
 * Raw developer enum values must never be rendered to users. Every backend
 * enum rendered by the dashboard maps through these functions into typed
 * translation keys, which are resolved at render time in the active locale.
 *
 * The functions are typed against the shared contract enums so a newly added
 * backend enum member breaks compilation here until it is given a label.
 */

export function sessionStateLabelKey(
  state: DashboardSessionState,
): TranslationKey {
  const keys: Record<DashboardSessionState, TranslationKey> = {
    AWAITING_PARKING: "enum.session.AWAITING_PARKING",
    CHECKING_IN: "enum.session.CHECKING_IN",
    COMPLETED: "enum.session.COMPLETED",
    HANDOFF_PENDING: "enum.session.HANDOFF_PENDING",
    PARKED: "enum.session.PARKED",
    PARKING: "enum.session.PARKING",
    READY: "enum.session.READY",
    REQUESTED: "enum.session.REQUESTED",
    RETRIEVING: "enum.session.RETRIEVING",
  };
  return keys[state];
}

export function taskStatusLabelKey(
  status: DashboardTaskStatus,
): TranslationKey {
  const keys: Record<DashboardTaskStatus, TranslationKey> = {
    QUEUED: "enum.task.QUEUED",
    ASSIGNED: "enum.task.ASSIGNED",
    ACCEPTED: "enum.task.ACCEPTED",
    IN_PROGRESS: "enum.task.IN_PROGRESS",
    COMPLETED: "enum.task.COMPLETED",
    CANCELLED: "enum.task.CANCELLED",
  };
  return keys[status];
}

export type PaymentStatusValue =
  "NOT_REQUIRED" | "UNPAID" | "PENDING" | "PAID" | "FAILED";

export function paymentStatusLabelKey(
  status: PaymentStatusValue,
): TranslationKey {
  const keys: Record<PaymentStatusValue, TranslationKey> = {
    NOT_REQUIRED: "enum.payment.NOT_REQUIRED",
    UNPAID: "enum.payment.UNPAID",
    PENDING: "enum.payment.PENDING",
    PAID: "enum.payment.PAID",
    FAILED: "enum.payment.FAILED",
  };
  return keys[status];
}

export type CollectionMethodValue = "NONE" | "CASH" | "DIGITAL";

export function collectionMethodLabelKey(
  method: CollectionMethodValue,
): TranslationKey {
  const keys: Record<CollectionMethodValue, TranslationKey> = {
    NONE: "enum.collection.NONE",
    CASH: "enum.collection.CASH",
    DIGITAL: "enum.collection.DIGITAL",
  };
  return keys[method];
}

export type IncidentStatusValue =
  "OPEN" | "INVESTIGATING" | "RESOLVED" | "CLOSED";

export function incidentStatusLabelKey(
  status: IncidentStatusValue,
): TranslationKey {
  const keys: Record<IncidentStatusValue, TranslationKey> = {
    OPEN: "enum.incident.OPEN",
    INVESTIGATING: "enum.incident.INVESTIGATING",
    RESOLVED: "enum.incident.RESOLVED",
    CLOSED: "enum.incident.CLOSED",
  };
  return keys[status];
}

export type IncidentSeverityValue = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export function incidentSeverityLabelKey(
  severity: IncidentSeverityValue,
): TranslationKey {
  const keys: Record<IncidentSeverityValue, TranslationKey> = {
    LOW: "enum.severity.LOW",
    MEDIUM: "enum.severity.MEDIUM",
    HIGH: "enum.severity.HIGH",
    CRITICAL: "enum.severity.CRITICAL",
  };
  return keys[severity];
}

export type RetrievalRequestStatusValue = "OPEN" | "ACCEPTED";

export function retrievalStatusLabelKey(
  status: RetrievalRequestStatusValue,
): TranslationKey {
  const keys: Record<RetrievalRequestStatusValue, TranslationKey> = {
    OPEN: "enum.retrieval.OPEN",
    ACCEPTED: "enum.retrieval.ACCEPTED",
  };
  return keys[status];
}

export type RequesterTypeValue = "CUSTOMER" | "STAFF";

export function requesterTypeLabelKey(
  requesterType: RequesterTypeValue,
): TranslationKey {
  const keys: Record<RequesterTypeValue, TranslationKey> = {
    CUSTOMER: "enum.requester.CUSTOMER",
    STAFF: "enum.requester.STAFF",
  };
  return keys[requesterType];
}

export type KeySlotStatusValue = "ACTIVE" | "INACTIVE";

export function keySlotStatusLabelKey(
  status: KeySlotStatusValue,
): TranslationKey {
  const keys: Record<KeySlotStatusValue, TranslationKey> = {
    ACTIVE: "enum.keySlot.ACTIVE",
    INACTIVE: "enum.keySlot.INACTIVE",
  };
  return keys[status];
}

export type FreshnessValue = "LIVE" | "STALE";

export function freshnessLabelKey(freshness: FreshnessValue): TranslationKey {
  const keys: Record<FreshnessValue, TranslationKey> = {
    LIVE: "enum.freshness.LIVE",
    STALE: "enum.freshness.STALE",
  };
  return keys[freshness];
}
