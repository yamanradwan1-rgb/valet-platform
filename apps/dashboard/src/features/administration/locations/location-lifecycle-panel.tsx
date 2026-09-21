"use client";

import type { ManagementLocationLifecycleResponse } from "@valet/contracts";
import { useState } from "react";

import type { DashboardApiClient } from "../../../lib/api/dashboard-api-client";
import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { administrationCopy } from "../administration-copy";
import { SensitiveMfaDialog } from "../sensitive-mfa-dialog";
import { StatusBadge, styles } from "../administration-ui";
import { useSensitiveMutation } from "../use-sensitive-mutation";
import { commandLocationLifecycle, correctLocationCurrency, correctLocationTimezone } from "./locations-api";

export function LocationLifecyclePanel(props: {
  readonly api: DashboardApiClient;
  readonly location: ManagementLocationLifecycleResponse;
  readonly onReload: () => void;
  readonly organizationId: string;
}) {
  const { locale } = useDashboardLocale();
  const t = administrationCopy(locale);
  const [currency, setCurrency] = useState(props.location.currency);
  const [timezone, setTimezone] = useState(props.location.timezone);
  const [reason, setReason] = useState("");
  const [impact, setImpact] = useState(false);
  const mutation = useSensitiveMutation(props.onReload);
  async function timezoneCorrection() {
    setImpact(false);
    await mutation.run(
      () => correctLocationTimezone(props.api, props.organizationId, props.location.locationId, {
        expectedUpdatedAt: props.location.updatedAt, newTimezone: timezone, reason,
      }),
      (response) => {
        setImpact(!response.impact.historicalTimestampsRewritten && !response.impact.historicalReportFactsRewritten);
        props.onReload();
      },
    );
  }
  const inactiveCorrectionAllowed = props.location.status === "INACTIVE" && !props.location.acceptingIntake && !props.location.drain.blocked;
  return (
    <div className={styles.stack}>
      <div className={styles.facts}>
        <div className={styles.fact}><div className={styles.factValue}>{props.location.status === "ACTIVE" ? t.active : t.inactive}</div><div className={styles.factLabel}>{t.status}</div></div>
        <div className={styles.fact}><div className={styles.factValue}>{props.location.acceptingIntake ? t.open : t.closed}</div><div className={styles.factLabel}>{t.intake}</div></div>
        <div className={styles.fact}><div className={styles.factValue}>{props.location.readiness.readyForActivation ? t.ready : t.notReady}</div><div className={styles.factLabel}>{t.readiness}</div></div>
      </div>
      <div className={styles.grid2}>
        <div className={`${styles.card} ${styles.cardPad}`}><h3 className={styles.sectionTitle}>{t.readiness}</h3><p className={styles.sectionText}>{t.currencySupported}: <StatusBadge good={props.location.readiness.checks.currencySupported}>{props.location.readiness.checks.currencySupported ? t.enabled : t.disabled}</StatusBadge> · {t.timezoneValid}: <StatusBadge good={props.location.readiness.checks.timezoneValid}>{props.location.readiness.checks.timezoneValid ? t.enabled : t.disabled}</StatusBadge></p></div>
        <div className={`${styles.card} ${styles.cardPad}`}><h3 className={styles.sectionTitle}>{t.drain}</h3><p className={styles.sectionText}>{props.location.drain.blocked ? t.blocked : t.clear} · {t.activeShift}: {props.location.drain.activeShiftPresent ? t.enabled : t.disabled} · {t.nonCompletedSession}: {props.location.drain.nonCompletedValetSessionPresent ? t.enabled : t.disabled} · {t.nonTerminalTask}: {props.location.drain.nonTerminalTaskPresent ? t.enabled : t.disabled}</p></div>
      </div>
      <div className={styles.actions}>
        {props.location.status === "INACTIVE" ? <button className={styles.primary} disabled={mutation.busy || !props.location.readiness.readyForActivation} onClick={() => void mutation.run(() => commandLocationLifecycle(props.api, props.organizationId, props.location.locationId, "activate", props.location.updatedAt), props.onReload)} type="button">{t.activateLocation}</button> : null}
        {props.location.acceptingIntake ? <button className={styles.secondary} disabled={mutation.busy} onClick={() => void mutation.run(() => commandLocationLifecycle(props.api, props.organizationId, props.location.locationId, "stop-intake", props.location.updatedAt), props.onReload)} type="button">{t.stopIntake}</button> : null}
        {props.location.status === "ACTIVE" && !props.location.acceptingIntake ? <button className={styles.danger} disabled={mutation.busy || props.location.drain.blocked} onClick={() => void mutation.run(() => commandLocationLifecycle(props.api, props.organizationId, props.location.locationId, "deactivate", props.location.updatedAt), props.onReload)} type="button">{t.deactivateLocation}</button> : null}
      </div>
      <div className={styles.grid2}>
        <div className={styles.field}><label htmlFor="correct-currency">{t.correctCurrency}</label><div className={styles.actions}><input className={styles.input} dir="ltr" id="correct-currency" maxLength={3} onChange={(e) => setCurrency(e.target.value.toUpperCase())} value={currency} /><button className={styles.secondary} disabled={mutation.busy || !inactiveCorrectionAllowed || currency === props.location.currency} onClick={() => void mutation.run(() => correctLocationCurrency(props.api, props.organizationId, props.location.locationId, { expectedUpdatedAt: props.location.updatedAt, newCurrency: currency }), props.onReload)} type="button">{t.save}</button></div></div>
        <div className={styles.field}><label htmlFor="correct-timezone">{t.correctTimezone}</label><input className={styles.input} dir="ltr" id="correct-timezone" onChange={(e) => setTimezone(e.target.value)} value={timezone} /><label htmlFor="timezone-reason">{t.reason}</label><textarea className={styles.textarea} id="timezone-reason" onChange={(e) => setReason(e.target.value)} value={reason} /><button className={styles.secondary} disabled={mutation.busy || !inactiveCorrectionAllowed || timezone === props.location.timezone || !reason.trim()} onClick={() => void timezoneCorrection()} type="button">{t.save}</button></div>
      </div>
      {impact ? <div className={styles.cardPad}><b>{t.historicalImpact}</b><p className={styles.sectionText}>{t.historyUnchanged}</p></div> : null}
      {mutation.error ? <div className={styles.error} role="alert">{mutation.error}</div> : null}
      {mutation.mfaOpen ? <SensitiveMfaDialog api={props.api} onAssured={mutation.onMfaAssured} onClose={mutation.closeMfa} /> : null}
    </div>
  );
}
