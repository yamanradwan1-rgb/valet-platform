"use client";

import type {
  DashboardSessionState,
  DashboardTaskStatus,
} from "@valet/contracts";

import {
  freshnessLabelKey,
  incidentSeverityLabelKey,
  incidentStatusLabelKey,
  keySlotStatusLabelKey,
  paymentStatusLabelKey,
  retrievalStatusLabelKey,
  sessionStateLabelKey,
  taskStatusLabelKey,
  type FreshnessValue,
  type IncidentSeverityValue,
  type IncidentStatusValue,
  type KeySlotStatusValue,
  type PaymentStatusValue,
  type RetrievalRequestStatusValue,
} from "../../i18n/enum-labels";
import { useTranslation } from "../../i18n/locale-provider";
import type { TranslationKey } from "../../i18n/translations/types";

export type BadgeVariant =
  | "session"
  | "task"
  | "retrieval"
  | "incident-severity"
  | "incident-status"
  | "payment"
  | "key"
  | "freshness";

type BadgeColors = { bg: string; text: string };

function getColors(variant: BadgeVariant, value: string): BadgeColors {
  const fallback: BadgeColors = {
    bg: "var(--surface-muted)",
    text: "var(--text-secondary)",
  };
  if (variant === "session") {
    const map: Record<string, BadgeColors> = {
      CHECKING_IN: { bg: "var(--accent-soft)", text: "var(--accent)" },
      AWAITING_PARKING: { bg: "var(--warning-soft)", text: "var(--warning)" },
      PARKING: { bg: "var(--warning-soft)", text: "var(--warning)" },
      PARKED: { bg: "var(--success-soft)", text: "var(--success)" },
      REQUESTED: { bg: "var(--accent-soft)", text: "var(--accent)" },
      RETRIEVING: { bg: "var(--danger-soft)", text: "var(--danger)" },
      READY: { bg: "var(--success-soft)", text: "var(--success)" },
      HANDOFF_PENDING: { bg: "var(--warning-soft)", text: "var(--warning)" },
      COMPLETED: { bg: "var(--surface-muted)", text: "var(--text-secondary)" },
    };
    return map[value] ?? fallback;
  }
  if (variant === "task") {
    const map: Record<string, BadgeColors> = {
      QUEUED: { bg: "var(--surface-muted)", text: "var(--text-secondary)" },
      ASSIGNED: { bg: "var(--accent-soft)", text: "var(--accent)" },
      ACCEPTED: { bg: "var(--accent-soft)", text: "var(--accent-hover)" },
      IN_PROGRESS: { bg: "var(--warning-soft)", text: "var(--warning)" },
      COMPLETED: { bg: "var(--success-soft)", text: "var(--success)" },
      CANCELLED: { bg: "var(--surface-muted)", text: "var(--text-muted)" },
    };
    return map[value] ?? fallback;
  }
  if (variant === "retrieval") {
    const map: Record<string, BadgeColors> = {
      OPEN: { bg: "var(--warning-soft)", text: "var(--warning)" },
      ACCEPTED: { bg: "var(--accent-soft)", text: "var(--accent)" },
    };
    return map[value] ?? fallback;
  }
  if (variant === "incident-severity") {
    const map: Record<string, BadgeColors> = {
      LOW: { bg: "var(--surface-muted)", text: "var(--text-secondary)" },
      MEDIUM: { bg: "var(--warning-soft)", text: "var(--warning)" },
      HIGH: { bg: "var(--danger-soft)", text: "var(--danger)" },
      CRITICAL: { bg: "var(--danger-soft)", text: "var(--danger)" },
    };
    return map[value] ?? fallback;
  }
  if (variant === "incident-status") {
    const map: Record<string, BadgeColors> = {
      OPEN: { bg: "var(--danger-soft)", text: "var(--danger)" },
      INVESTIGATING: { bg: "var(--warning-soft)", text: "var(--warning)" },
      RESOLVED: { bg: "var(--success-soft)", text: "var(--success)" },
      CLOSED: { bg: "var(--surface-muted)", text: "var(--text-muted)" },
    };
    return map[value] ?? fallback;
  }
  if (variant === "payment") {
    // COMPLETED stays valid for payment-independent session state counts; the
    // payment variant only covers backend payment statuses.
    const map: Record<string, BadgeColors> = {
      NOT_REQUIRED: { bg: "var(--surface-muted)", text: "var(--text-muted)" },
      UNPAID: { bg: "var(--warning-soft)", text: "var(--warning)" },
      PENDING: { bg: "var(--accent-soft)", text: "var(--accent)" },
      PAID: { bg: "var(--success-soft)", text: "var(--success)" },
      FAILED: { bg: "var(--danger-soft)", text: "var(--danger)" },
    };
    return map[value] ?? fallback;
  }
  if (variant === "key") {
    const map: Record<string, BadgeColors> = {
      ACTIVE: { bg: "var(--success-soft)", text: "var(--success)" },
      INACTIVE: { bg: "var(--surface-muted)", text: "var(--text-muted)" },
    };
    return map[value] ?? fallback;
  }
  const map: Record<string, BadgeColors> = {
    LIVE: { bg: "var(--success-soft)", text: "var(--success)" },
    STALE: { bg: "var(--warning-soft)", text: "var(--warning)" },
  };
  return map[value] ?? fallback;
}

/**
 * Pure enum-value to typed translation-key resolution. Raw developer enum
 * values are never rendered; unknown values fall back to a visible placeholder
 * key so contract drift is detectable instead of silently leaking enums.
 */
export function badgeLabelKey(
  variant: BadgeVariant,
  value: string,
): TranslationKey | null {
  switch (variant) {
    case "session":
      return sessionStateLabelKey(value as DashboardSessionState);
    case "task":
      return taskStatusLabelKey(value as DashboardTaskStatus);
    case "retrieval":
      return retrievalStatusLabelKey(value as RetrievalRequestStatusValue);
    case "incident-severity":
      return incidentSeverityLabelKey(value as IncidentSeverityValue);
    case "incident-status":
      return incidentStatusLabelKey(value as IncidentStatusValue);
    case "payment":
      return paymentStatusLabelKey(value as PaymentStatusValue);
    case "key":
      return keySlotStatusLabelKey(value as KeySlotStatusValue);
    case "freshness":
      return freshnessLabelKey(value as FreshnessValue);
  }
}

interface StatusBadgeProps {
  variant: BadgeVariant;
  value: string;
  size?: "sm" | "md";
}

export function StatusBadge({ variant, value, size = "sm" }: StatusBadgeProps) {
  const { t } = useTranslation();
  const key = badgeLabelKey(variant, value);
  const label = key === null ? value : t(key);
  const colors = getColors(variant, value);
  return (
    <span
      className={`status-badge ${size === "sm" ? "status-badge-sm" : "status-badge-md"}`}
      style={{ backgroundColor: colors.bg, color: colors.text }}
    >
      {label}
    </span>
  );
}
