"use client";

import type { ManagementLocationLifecycleResponse } from "@valet/contracts";
import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { administrationCopy } from "../administration-copy";
import { StatusBadge, styles } from "../administration-ui";

export function LocationLifecycleFacts({
  location,
}: {
  readonly location: ManagementLocationLifecycleResponse;
}) {
  const { locale } = useDashboardLocale();
  const t = administrationCopy(locale);
  return (
    <>
      <div className={styles.facts}>
        <div className={styles.fact}>
          <div className={styles.factValue}>
            {location.status === "ACTIVE" ? t.active : t.inactive}
          </div>
          <div className={styles.factLabel}>{t.status}</div>
        </div>
        <div className={styles.fact}>
          <div className={styles.factValue}>
            {location.acceptingIntake ? t.open : t.closed}
          </div>
          <div className={styles.factLabel}>{t.intake}</div>
        </div>
        <div className={styles.fact}>
          <div className={styles.factValue}>
            {location.readiness.readyForActivation ? t.ready : t.notReady}
          </div>
          <div className={styles.factLabel}>{t.readiness}</div>
        </div>
      </div>
      <div className={styles.grid2}>
        <div className={`${styles.card} ${styles.cardPad}`}>
          <h3 className={styles.sectionTitle}>{t.readiness}</h3>
          <p className={styles.sectionText}>
            {t.currencySupported}:{" "}
            <StatusBadge good={location.readiness.checks.currencySupported}>
              {location.readiness.checks.currencySupported
                ? t.enabled
                : t.disabled}
            </StatusBadge>{" "}
            · {t.timezoneValid}:{" "}
            <StatusBadge good={location.readiness.checks.timezoneValid}>
              {location.readiness.checks.timezoneValid ? t.enabled : t.disabled}
            </StatusBadge>
          </p>
        </div>
        <div className={`${styles.card} ${styles.cardPad}`}>
          <h3 className={styles.sectionTitle}>{t.drain}</h3>
          <p className={styles.sectionText}>
            {location.drain.blocked ? t.blocked : t.clear} · {t.activeShift}:{" "}
            {location.drain.activeShiftPresent
              ? locale === "ar"
                ? "موجود"
                : "Present"
              : locale === "ar"
                ? "لا يوجد"
                : "None"}{" "}
            · {t.nonCompletedSession}:{" "}
            {location.drain.nonCompletedValetSessionPresent
              ? locale === "ar"
                ? "موجود"
                : "Present"
              : locale === "ar"
                ? "لا يوجد"
                : "None"}{" "}
            · {t.nonTerminalTask}:{" "}
            {location.drain.nonTerminalTaskPresent
              ? locale === "ar"
                ? "موجود"
                : "Present"
              : locale === "ar"
                ? "لا يوجد"
                : "None"}
          </p>
        </div>
      </div>
    </>
  );
}
