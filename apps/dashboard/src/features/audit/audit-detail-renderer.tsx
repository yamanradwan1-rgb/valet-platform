"use client";

import type { ManagementAuditEvent } from "@valet/contracts";

import { useDashboardLocale } from "../../lib/i18n/locale-provider";
import { auditCopy } from "./audit-copy";
import { safeAuditDetailRows } from "./audit-safe-details";
import { auditDetailKindLabel, auditDetailValue } from "./audit-detail-values";
import styles from "./audit-drawer.module.css";

const labels = {
  en: {
    acceptingIntake: "Accepting intake",
    attempt: "Attempt",
    customerPresent: "Customer present",
    effectivePhotosRequired: "Effective photos required",
    field: "Field",
    fromAcceptingIntake: "Previous intake",
    fromState: "Previous state",
    fromStatus: "Previous status",
    fromVersion: "Previous version",
    handoffMethod: "Handoff method",
    identityMode: "Identity mode",
    locationCount: "Location count",
    maxAttempts: "Maximum attempts",
    newCurrency: "New currency",
    newRole: "New role",
    newStatus: "New status",
    newTimezone: "New timezone",
    normalizationVersion: "Normalization version",
    operation: "Operation",
    previousCurrency: "Previous currency",
    previousRole: "Previous role",
    previousStatus: "Previous status",
    previousTimezone: "Previous timezone",
    qualifyingPhotoPresent: "Qualifying photo present",
    role: "Role",
    settingKey: "Setting key",
    severity: "Severity",
    status: "Status",
    terminalized: "Terminalized",
    toAcceptingIntake: "New intake",
    toState: "New state",
    toStatus: "New status",
    toVersion: "New version",
    type: "Type",
  },
  ar: {
    acceptingIntake: "استقبال المركبات",
    attempt: "المحاولة",
    customerPresent: "وجود جهة الاتصال",
    effectivePhotosRequired: "الصور المطلوبة فعليًا",
    field: "الحقل",
    fromAcceptingIntake: "الاستقبال السابق",
    fromState: "الحالة السابقة",
    fromStatus: "الوضع السابق",
    fromVersion: "الإصدار السابق",
    handoffMethod: "طريقة التسليم",
    identityMode: "نمط الهوية",
    locationCount: "عدد المواقع",
    maxAttempts: "الحد الأقصى للمحاولات",
    newCurrency: "العملة الجديدة",
    newRole: "الدور الجديد",
    newStatus: "الوضع الجديد",
    newTimezone: "المنطقة الزمنية الجديدة",
    normalizationVersion: "إصدار التطبيع",
    operation: "العملية",
    previousCurrency: "العملة السابقة",
    previousRole: "الدور السابق",
    previousStatus: "الوضع السابق",
    previousTimezone: "المنطقة الزمنية السابقة",
    qualifyingPhotoPresent: "توفر صورة مؤهلة",
    role: "الدور",
    settingKey: "مفتاح الإعداد",
    severity: "الخطورة",
    status: "الوضع",
    terminalized: "منتهية",
    toAcceptingIntake: "الاستقبال الجديد",
    toState: "الحالة الجديدة",
    toStatus: "الوضع الجديد",
    toVersion: "الإصدار الجديد",
    type: "النوع",
  },
} as const;

export function AuditDetailRenderer({
  event,
}: {
  readonly event: ManagementAuditEvent;
}) {
  const { locale } = useDashboardLocale();
  const t = auditCopy(locale);
  if (event.details.kind === "UNKNOWN") {
    return <p className={styles.safeEmpty}>{t.unknownDetails}</p>;
  }
  const detailRows = safeAuditDetailRows(event.details);
  return (
    <div className={styles.detailSection}>
      <div className={styles.fact}>
        <span>{t.kind}</span>
        <strong>{auditDetailKindLabel(event.details.kind, locale)}</strong>
      </div>
      {detailRows.length === 0 ? (
        <p className={styles.safeEmpty}>{t.noDetailFields}</p>
      ) : null}
      {detailRows.map(([key, value]) => (
        <div className={styles.fact} key={key}>
          <span>{labels[locale][key as keyof typeof labels.en] ?? key}</span>
          <strong>
            <bdi>
              {auditDetailValue(event.details.kind, key, value, locale)}
            </bdi>
          </strong>
        </div>
      ))}
    </div>
  );
}
