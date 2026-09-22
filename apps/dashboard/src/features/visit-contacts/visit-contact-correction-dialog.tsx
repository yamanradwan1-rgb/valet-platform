"use client";

import { useEffect, useRef, useState } from "react";

import { useProtectedDashboard } from "../../components/foundation/protected-dashboard-context";
import { useSelectedScope } from "../../components/foundation/selected-scope-provider";
import { FocusDialog } from "../../components/presentation/focus-dialog";
import { useDashboardLocale } from "../../lib/i18n/locale-provider";
import { visitContactCopy } from "./visit-contact-copy";
import type { VisitContactCorrectionIntent } from "./visit-contact-correction-intent";
import {
  clearVisitContactCorrectionRecovery,
  stageVisitContactCorrectionRecovery,
} from "./visit-contact-correction-recovery";
import {
  isAuthReconciledMutation,
  isUnknownMutationOutcome,
  isVisitContactAuthorityLoss,
  isVisitContactConflict,
  isVisitContactMfaRequired,
  visitContactErrorMessage,
} from "./visit-contact-errors";
import type { VisitContactSearchItem } from "./visit-contact-results";
import { visitContactIntentScopeKey } from "./visit-contact-scope";
import { VisitContactSensitiveMfa } from "./visit-contact-sensitive-mfa";
import { correctVisitContactName, correctVisitContactPhone } from "./visit-contacts-api";
import styles from "./visit-contacts.module.css";

type Customer = Extract<VisitContactSearchItem, { kind: "CUSTOMER" }>;

export function VisitContactCorrectionDialog(props: {
  readonly customer: Customer;
  readonly kind: "NAME" | "PHONE";
  readonly initialIntent?: VisitContactCorrectionIntent | null;
  readonly onAuthorityLoss: (reason: unknown) => void;
  readonly onClose: () => void;
  readonly onIntentChange: (intent: VisitContactCorrectionIntent) => void;
  readonly onNeedsSearch: (intent: VisitContactCorrectionIntent) => void;
  readonly onReconcile: () => void;
  readonly onToken: (updatedAt: string) => void;
  readonly organizationId: string;
  readonly reconcileEvidence: number;
  readonly reconcileMatched: boolean;
}) {
  const dashboard = useProtectedDashboard();
  const { selectionRevision } = useSelectedScope();
  const { locale } = useDashboardLocale();
  const t = visitContactCopy(locale);
  const recoveryScopeKey = visitContactIntentScopeKey({
    identityGeneration: dashboard.identityGeneration,
    selectedScope: dashboard.selectedScope,
    selectionRevision,
  });
  const [draft, setDraft] = useState(
    props.initialIntent?.draft ?? (props.kind === "NAME"
      ? props.customer.displayName ?? ""
      : props.customer.phone.kind === "FULL" ? props.customer.phone.value : ""),
  );
  const [clearName, setClearName] = useState(props.initialIntent?.clearName ?? false);
  const [intentSessionGeneration] = useState(
    props.initialIntent?.sessionGeneration ?? dashboard.sessionGeneration,
  );
  const [busy, setBusy] = useState(false);
  const [mfaOpen, setMfaOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(() => {
    if (!props.initialIntent?.reviewRequired) return null;
    return props.initialIntent.sessionGeneration === dashboard.sessionGeneration
      ? t.resumeCorrection
      : t.authRetry;
  });
  const [reviewRequired, setReviewRequired] = useState(
    props.initialIntent?.reviewRequired ?? false,
  );
  const [reviewEvidenceFloor, setReviewEvidenceFloor] = useState(
    props.initialIntent?.reviewRequired
      ? props.reconcileEvidence - 1
      : props.reconcileEvidence,
  );
  const draftInputRef = useRef<HTMLInputElement>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    if (mfaOpen) return;
    const frame = requestAnimationFrame(() => draftInputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [mfaOpen]);

  function requireAuthoritativeReview(messageText: string) {
    setMessage(messageText);
    setReviewEvidenceFloor(props.reconcileEvidence);
    setReviewRequired(true);
    props.onIntentChange(intent(draft, clearName, true));
    props.onReconcile();
  }

  function intent(
    nextDraft = draft,
    nextClearName = clearName,
    nextReviewRequired = reviewRequired,
  ): VisitContactCorrectionIntent {
    return {
      clearName: nextClearName,
      customerId: props.customer.customerId,
      draft: nextDraft,
      kind: props.kind,
      reviewRequired: nextReviewRequired,
      sessionGeneration: intentSessionGeneration,
    };
  }

  async function save() {
    if (busy || reviewRequired) return;
    setBusy(true);
    setMessage(null);
    stageVisitContactCorrectionRecovery(
      recoveryScopeKey,
      intent(draft, clearName, false),
    );
    try {
      const response = props.kind === "NAME"
        ? await correctVisitContactName(
            dashboard.api,
            props.organizationId,
            props.customer.customerId,
            {
              displayName: clearName ? null : draft,
              expectedUpdatedAt: props.customer.customerUpdatedAt,
            },
          )
        : await correctVisitContactPhone(
            dashboard.api,
            props.organizationId,
            props.customer.customerId,
            {
              expectedUpdatedAt: props.customer.customerUpdatedAt,
              phone: draft,
            },
          );
      clearVisitContactCorrectionRecovery(recoveryScopeKey);
      if (!mounted.current) return;
      props.onToken(response.updatedAt);
      requireAuthoritativeReview(
        response.changed ? t.correctionChanged : t.correctionNoop,
      );
    } catch (reason) {
      if (!isAuthReconciledMutation(reason)) {
        clearVisitContactCorrectionRecovery(recoveryScopeKey);
      }
      if (!mounted.current) return;
      if (isVisitContactMfaRequired(reason)) {
        setMfaOpen(true);
      } else if (isAuthReconciledMutation(reason)) {
        props.onNeedsSearch(intent(draft, clearName, true));
      } else if (isVisitContactAuthorityLoss(reason)) {
        props.onAuthorityLoss(reason);
      } else if (isVisitContactConflict(reason)) {
        requireAuthoritativeReview(t.conflict);
      } else if (isUnknownMutationOutcome(reason)) {
        requireAuthoritativeReview(t.unknownOutcome);
      } else {
        setMessage(visitContactErrorMessage(reason, t));
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  if (mfaOpen) {
    return (
      <VisitContactSensitiveMfa
        api={dashboard.api}
        onAssured={() => {
          setMfaOpen(false);
          setMessage(t.mfaReview);
        }}
        onClose={() => setMfaOpen(false)}
      />
    );
  }

  return (
    <FocusDialog label={t.correctionTitle} onClose={props.onClose}>
      <div className={styles.dialogBody}>
        <div className={styles.dialogHeader}><h2>{t.correctionTitle}</h2></div>
        <div className={styles.dialogContent}>
          <label className={styles.field}>
            <span className={styles.label}>
              {props.kind === "NAME" ? t.displayName : t.phone}
            </span>
            <input
              className={styles.input}
              dir={props.kind === "PHONE" ? "ltr" : undefined}
              disabled={props.kind === "NAME" && clearName}
              maxLength={props.kind === "NAME" ? 120 : 40}
              onChange={(event) => {
                const value = event.target.value;
                setDraft(value);
                props.onIntentChange(intent(value, clearName));
              }}
              required={props.kind === "PHONE" || !clearName}
              ref={draftInputRef}
              value={draft}
            />
          </label>
          {props.kind === "NAME" ? (
            <label className={styles.checkbox}>
              <input
                checked={clearName}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setClearName(checked);
                  props.onIntentChange(intent(draft, checked));
                }}
                type="checkbox"
              />
              {t.clearName}
            </label>
          ) : null}
          {message ? <div className={styles.notice} role="status">{message}</div> : null}
          {reviewRequired ? (
            <>
              {props.reconcileEvidence > reviewEvidenceFloor && !props.reconcileMatched ? (
                <>
                  <div className={styles.notice} role="status">{t.searchAgainRequired}</div>
                  <button
                    className={styles.secondary}
                    onClick={() => props.onNeedsSearch({
                      clearName,
                      customerId: props.customer.customerId,
                      draft,
                      kind: props.kind,
                      reviewRequired: true,
                      sessionGeneration: intentSessionGeneration,
                    })}
                    type="button"
                  >
                    {t.returnToSearch}
                  </button>
                </>
              ) : null}
              {props.reconcileEvidence > reviewEvidenceFloor && props.reconcileMatched ? (
                <div className={styles.factGrid}>
                  <div className={styles.fact}>
                    <span>{t.latestServerValue}</span>
                    <strong>
                      {props.kind === "NAME"
                        ? props.customer.displayName ?? "—"
                        : props.customer.phone.kind === "FULL"
                          ? <bdi dir="ltr">{props.customer.phone.value}</bdi>
                          : <bdi dir="ltr">{props.customer.phone.ending}</bdi>}
                    </strong>
                  </div>
                </div>
              ) : null}
              <button
                className={styles.secondary}
                disabled={
                  props.reconcileEvidence <= reviewEvidenceFloor ||
                  !props.reconcileMatched
                }
                onClick={() => {
                  setReviewRequired(false);
                  props.onIntentChange(intent(draft, clearName, false));
                }}
                type="button"
              >
                {t.reviewLatest}
              </button>
            </>
          ) : null}
        </div>
        <div className={styles.dialogFooter}>
          <button className={styles.secondary} onClick={props.onClose} type="button">
            {t.cancel}
          </button>
          <button
            className={styles.primary}
            disabled={busy || reviewRequired}
            onClick={save}
            type="button"
          >
            {t.save}
          </button>
        </div>
      </div>
    </FocusDialog>
  );
}
