"use client";

import type { ManagementAlertUnifiedItem } from "@valet/contracts";
import type { DashboardLocale } from "../../lib/i18n/locale";
import { managementAlertCopy } from "./alert-copy";
import { unifiedAlertTitle } from "./alert-unified-title";

const additionalCopy = {
  en: {
    active: "Current condition",
    occurrence: "Committed occurrence",
    seen: "Mark Seen",
    seeing: "Saving Seen…",
    seenFailed: "Could not mark Seen. Check your access and retry.",
    noTime: "Current state; no authoritative start time available",
  },
  ar: {
    active: "حالة تشغيلية حالية",
    occurrence: "حدث مؤكد",
    seen: "تحديد كمُشاهَد",
    seeing: "جارٍ حفظ المشاهدة…",
    seenFailed: "تعذر تسجيل المشاهدة. تحقق من صلاحيتك وأعد المحاولة.",
    noTime: "حالة حالية دون وقت بدء مثبت من المصدر",
  },
} as const;

export function UnifiedAlertList({
  items,
  locale,
  detail,
  detailPendingId,
  detailFailedId,
  seenPendingId,
  seenFailedId,
  onDetails,
  onSeen,
}: {
  readonly items: readonly ManagementAlertUnifiedItem[];
  readonly locale: DashboardLocale;
  readonly detail: ManagementAlertUnifiedItem | null;
  readonly detailPendingId: string | null;
  readonly detailFailedId: string | null;
  readonly seenPendingId: string | null;
  readonly seenFailedId: string | null;
  readonly onDetails: (item: ManagementAlertUnifiedItem) => void;
  readonly onSeen: (item: ManagementAlertUnifiedItem) => void;
}) {
  const copy = managementAlertCopy[locale];
  const extra = additionalCopy[locale];
  return (
    <ol className="management-alert-list management-alert-list--unified">
      {items.map((item) => (
        <li key={item.id}>
          <span className="management-alert-severity">
            {item.severity === "CRITICAL" ? copy.critical : copy.important}
          </span>
          <bdi>{unifiedAlertTitle(item, locale)}</bdi>
          <small>
            {item.category} ·{" "}
            {item.caseKind === "ACTIVE" ? extra.active : extra.occurrence}
          </small>
          <button type="button" onClick={() => onDetails(item)}>
            {copy.details}
          </button>
          {item.caseKind === "OCCURRENCE" ? (
            <button
              type="button"
              disabled={seenPendingId !== null}
              onClick={() => onSeen(item)}
            >
              {seenPendingId === item.id ? extra.seeing : extra.seen}
            </button>
          ) : null}
          {seenFailedId === item.id ? (
            <p role="alert">{extra.seenFailed}</p>
          ) : null}
          {detailPendingId === item.id ? (
            <p role="status">{copy.loadingSource}</p>
          ) : null}
          {detailFailedId === item.id ? (
            <p role="status">{copy.source}</p>
          ) : null}
          {detail?.id === item.id ? (
            <dl className="management-alert-source-facts">
              <dt>{copy.sourceLabel}</dt>
              <dd>
                <bdi>{detail.category}</bdi>
              </dd>
              <dt>{copy.occurrence}</dt>
              <dd>
                {detail.occurredAt === null ? (
                  extra.noTime
                ) : (
                  <time dateTime={detail.occurredAt}>
                    {new Date(detail.occurredAt).toLocaleString(locale)}
                  </time>
                )}
              </dd>
            </dl>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
