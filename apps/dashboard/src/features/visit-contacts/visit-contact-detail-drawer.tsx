"use client";

import { useEffect, useRef, useState } from "react";

import { useProtectedDashboard } from "../../components/foundation/protected-dashboard-context";
import { useDashboardLocale } from "../../lib/i18n/locale-provider";
import { VisitContactCorrectionDialog } from "./visit-contact-correction-dialog";
import type { VisitContactCorrectionIntent } from "./visit-contact-correction-intent";
import { visitContactCopy } from "./visit-contact-copy";
import { VisitContactDrawer } from "./visit-contact-drawer";
import type { VisitContactSearchItem } from "./visit-contact-results";
import { VisitHistory, type VisitHistorySubject } from "./visit-history";
import styles from "./visit-contacts.module.css";

type Customer = Extract<VisitContactSearchItem, { kind: "CUSTOMER" }>;

function CustomerFacts({ item }: { readonly item: Customer }) {
  const { locale } = useDashboardLocale();
  const t = visitContactCopy(locale);
  const phone = item.phone.kind === "FULL"
    ? item.phone.value
    : `${t.maskedPhone} ${item.phone.ending}`;
  return (
    <div className={styles.factGrid}>
      <div className={styles.fact}><span>{t.phone}</span><strong><bdi dir="ltr">{phone}</bdi></strong></div>
      <div className={styles.fact}><span>{t.completedVisits}</span><strong>{item.completedVisitCount}</strong></div>
      <div className={styles.fact}>
        <span>{t.latestVisit}</span>
        <strong>{item.latestVisit?.locationName ?? "—"}</strong>
      </div>
    </div>
  );
}

export function VisitContactDetailDrawer(props: {
  readonly item: VisitContactSearchItem;
  readonly onAccessLoss: (reason: unknown) => void;
  readonly onClose: () => void;
  readonly onClearPendingCorrection: () => void;
  readonly onCorrectionIntentChange: (intent: VisitContactCorrectionIntent) => void;
  readonly onNeedsCorrectionSearch: (intent: VisitContactCorrectionIntent) => void;
  readonly onReconcile: () => void;
  readonly onToken: (updatedAt: string) => void;
  readonly reconcileEvidence: number;
  readonly reconcileMatched: boolean;
  readonly role: "COMPANY_ADMIN" | "LOCATION_MANAGER";
  readonly organizationId: string;
  readonly pendingCorrection: VisitContactCorrectionIntent | null;
}) {
  const dashboard = useProtectedDashboard();
  const { locale } = useDashboardLocale();
  const t = visitContactCopy(locale);
  const initialSubject: VisitHistorySubject = props.item.kind === "CUSTOMER"
    ? { kind: "CUSTOMER", id: props.item.customerId }
    : { kind: "VEHICLE", id: props.item.vehicleId };
  const [subject, setSubject] = useState<VisitHistorySubject>(initialSubject);
  const matchingPending = props.item.kind === "CUSTOMER" &&
    props.pendingCorrection?.customerId === props.item.customerId
    ? props.pendingCorrection
    : null;
  const [correction, setCorrection] = useState<"NAME" | "PHONE" | null>(
    matchingPending?.kind ?? null,
  );
  const [restoreCorrectionFocus, setRestoreCorrectionFocus] =
    useState<"NAME" | "PHONE" | null>(null);
  const nameCorrectionRef = useRef<HTMLButtonElement>(null);
  const phoneCorrectionRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (correction !== null || restoreCorrectionFocus === null) return;
    const frame = requestAnimationFrame(() => {
      const target = restoreCorrectionFocus === "NAME"
        ? nameCorrectionRef.current
        : phoneCorrectionRef.current;
      target?.focus();
      setRestoreCorrectionFocus(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [correction, restoreCorrectionFocus]);
  const title = props.item.kind === "CUSTOMER"
    ? props.item.displayName ?? t.unavailableName
    : props.item.plateNumberRaw;
  function startCorrection(kind: "NAME" | "PHONE") {
    if (props.item.kind !== "CUSTOMER") return;
    const draft = kind === "NAME"
      ? props.item.displayName ?? ""
      : props.item.phone.kind === "FULL" ? props.item.phone.value : "";
    props.onCorrectionIntentChange({
      clearName: false,
      customerId: props.item.customerId,
      draft,
      kind,
      reviewRequired: false,
      sessionGeneration: dashboard.sessionGeneration,
    });
    setRestoreCorrectionFocus(kind);
    setCorrection(kind);
  }
  return (
    <>
      {correction === null ? <VisitContactDrawer
        closeLabel={t.close}
        label={title}
        onClose={props.onClose}
        subtitle={<div className={styles.muted}>{props.item.kind === "CUSTOMER" ? t.customer : t.vehicle}</div>}
      >
        {props.item.kind === "CUSTOMER" ? <CustomerFacts item={props.item} /> : (
          <div className={styles.factGrid}>
            <div className={styles.fact}><span>{t.plate}</span><strong><bdi dir="ltr">{props.item.plateNumberRaw}</bdi></strong></div>
            <div className={styles.fact}><span>{t.plateCountry}</span><strong><bdi dir="ltr">{props.item.plateCountry}</bdi></strong></div>
            <div className={styles.fact}><span>{t.completedVisits}</span><strong>{props.item.completedVisitCount}</strong></div>
          </div>
        )}
        {props.item.kind === "CUSTOMER" && props.item.associatedVehicles.length > 0 ? (
          <section>
            <h3 className={styles.sectionTitle}>{t.associatedVehicles}</h3>
            <div className={styles.vehicleList}>
              {props.item.associatedVehicles.map((vehicle) => (
                <button
                  className={styles.vehicleButton}
                  key={vehicle.vehicleId}
                  onClick={() => setSubject({ kind: "VEHICLE", id: vehicle.vehicleId })}
                  type="button"
                >
                  <span><bdi dir="ltr">{vehicle.plateNumberRaw ?? t.unavailable}</bdi></span>
                  <span className={styles.muted}><bdi dir="ltr">{vehicle.plateCountry ?? "—"}</bdi></span>
                </button>
              ))}
              <button
                className={styles.secondary}
                onClick={() => setSubject({ kind: "CUSTOMER", id: props.item.kind === "CUSTOMER" ? props.item.customerId : "" })}
                type="button"
              >
                {t.customer} {t.history}
              </button>
            </div>
          </section>
        ) : null}
        {props.item.kind === "CUSTOMER" && props.role === "COMPANY_ADMIN" ? (
          <div className={styles.actions}>
            <button className={styles.secondary} onClick={() => startCorrection("NAME")} ref={nameCorrectionRef} type="button">{t.correctName}</button>
            <button className={styles.secondary} onClick={() => startCorrection("PHONE")} ref={phoneCorrectionRef} type="button">{t.correctPhone}</button>
          </div>
        ) : null}
        <section>
          <h3 className={styles.sectionTitle}>{t.history}</h3>
          <VisitHistory onAuthorityLoss={props.onAccessLoss} subject={subject} />
        </section>
      </VisitContactDrawer> : null}
      {correction && props.item.kind === "CUSTOMER" ? (
        <VisitContactCorrectionDialog
          customer={props.item}
          initialIntent={matchingPending}
          kind={correction}
          onClose={() => {
            props.onClearPendingCorrection();
            setCorrection(null);
          }}
          onAuthorityLoss={props.onAccessLoss}
          onIntentChange={props.onCorrectionIntentChange}
          onNeedsSearch={props.onNeedsCorrectionSearch}
          onReconcile={props.onReconcile}
          onToken={props.onToken}
          organizationId={props.organizationId}
          reconcileEvidence={props.reconcileEvidence}
          reconcileMatched={props.reconcileMatched}
        />
      ) : null}
    </>
  );
}
