"use client";

import type {
  StaffPasswordResetIssueRequest,
  StaffPasswordResetIssueResponse,
} from "@valet/contracts";
import { useCallback, useRef, useState } from "react";
import { FocusDialog } from "../../../components/presentation/focus-dialog";
import type { DashboardApiClient } from "../../../lib/api/dashboard-api-client";
import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { useProtectedDashboard } from "../../../components/foundation/protected-dashboard-context";
import { administrationScopeKey } from "../administration-scope";
import { administrationCopy } from "../administration-copy";
import { styles } from "../administration-ui";
import { SensitiveMfaDialog } from "../sensitive-mfa-dialog";
import { useAuthoritativeRead } from "../use-authoritative-read";
import { useSensitiveMutation } from "../use-sensitive-mutation";
import { issueStaffPasswordReset, readStaffPasswordResetStatus } from "./staff-password-reset-api";
import { isStaffResetIssueOutcomeAmbiguous } from "./staff-password-reset-ambiguity";
import { staffPasswordResetCopy } from "./staff-password-reset-copy";
import { useStaffResetReconciliation } from "./use-staff-reset-reconciliation";

interface ResetActionProps {
  readonly api: DashboardApiClient;
  readonly organizationId: string;
  readonly membershipId: string;
  readonly reconciling: boolean;
}

export function StaffPasswordResetAction(props: ResetActionProps) {
  const dashboard = useProtectedDashboard();
  const scopeKey = administrationScopeKey(dashboard);
  // Remount across tenant/session/member changes so a one-time link cannot
  // remain in the previous component state during a context transition.
  return <ScopedStaffResetAction {...props} key={`${scopeKey}:${props.organizationId}:${props.membershipId}`} scopeKey={scopeKey} />;
}

function ScopedStaffResetAction(props: ResetActionProps & { readonly scopeKey: string }) {
  const scopeKey = props.scopeKey;
  const { locale } = useDashboardLocale();
  const t = staffPasswordResetCopy[locale];
  const adminCopy = administrationCopy(locale);
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  const dialogGeneration = useRef(0);
  const attemptRef = useRef<StaffPasswordResetIssueRequest | null>(null);
  const reconciliation = useStaffResetReconciliation(
    props.api, props.organizationId, props.membershipId, attemptRef,
  );
  const [result, setResult] = useState<StaffPasswordResetIssueResponse | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const load = useCallback(
    (signal: AbortSignal) =>
      readStaffPasswordResetStatus(
        props.api,
        props.organizationId,
        props.membershipId,
        signal,
      ),
    [props.api, props.organizationId, props.membershipId],
  );
  const status = useAuthoritativeRead(
    `${scopeKey}:password-reset:${props.membershipId}`,
    load,
  );
  const mutation = useSensitiveMutation(
    `password-reset:${props.organizationId}:${props.membershipId}`,
    () => {
      attemptRef.current = null;
      setUncertain(false);
      reconciliation.reset();
      status.refresh();
    },
  );
  // A normal status.refresh may complete after direct reconciliation. Never
  // let its older response replace the verified decision for this operation.
  const verifiedStatus = reconciliation.state
    ? reconciliation.state.verifiedStatus : status.data;
  const statusLoading = reconciliation.state
    ? reconciliation.state.phase === "checking" : status.loading;
  const statusError = reconciliation.state
    ? reconciliation.state.phase === "blocked" : status.error !== null;

  function close() {
    dialogGeneration.current++;
    openRef.current = false;
    setOpen(false);
    setResult(null);
    setCopyFeedback(null);
    // A closed POST may still commit; retain its exact operation for reconciliation.
    if (mutation.busy) {
      setUncertain(true);
      reconciliation.pending();
    } else if (!uncertain) {
      attemptRef.current = null;
      reconciliation.reset();
    }
  }

  function issue() {
    if (
      !openRef.current ||
      mutation.busy ||
      props.reconciling ||
      statusLoading ||
      statusError ||
      !verifiedStatus?.eligible
    ) return;
    setResult(null);
    setCopyFeedback(null);
    setUncertain(false);
    attemptRef.current ??= {
      operationId: crypto.randomUUID(),
      expectedGeneration: verifiedStatus.latestGeneration,
    };
    const capturedDialogGeneration = dialogGeneration.current;
    const currentDialog = () =>
      openRef.current && dialogGeneration.current === capturedDialogGeneration;
    const command = attemptRef.current;
    void mutation.run(
      async () => {
        try {
          return await issueStaffPasswordReset(
            props.api, props.organizationId, props.membershipId, command,
          );
        } catch (reason) {
          if (isStaffResetIssueOutcomeAmbiguous(reason)) {
            if (attemptRef.current === command) {
              setUncertain(true);
              await reconciliation.reconcile(command);
            }
          } else if (!currentDialog() && attemptRef.current === command) {
            reconciliation.block();
          }
          throw reason;
        }
      },
      (next) => {
        if (!currentDialog()) {
          if (attemptRef.current !== command) return;
          setUncertain(true);
          void reconciliation.reconcile(command);
          return;
        }
        setResult(next);
        setUncertain(false);
        reconciliation.reset();
        attemptRef.current = null;
        status.refresh();
      },
    );
  }

  async function copy() {
    if (!openRef.current || result?.outcome !== "LINK_ISSUED") return;
    const generation = dialogGeneration.current;
    try {
      await navigator.clipboard.writeText(result.resetLink);
      if (openRef.current && generation === dialogGeneration.current) setCopyFeedback(t.copied);
    } catch {
      if (openRef.current && generation === dialogGeneration.current) setCopyFeedback(t.copyFailed);
    }
  }

  if (status.loading && !status.data && !open) return null;
  if (!status.data?.eligible && !verifiedStatus?.eligible && !open) {
    return status.error ? (
      <button className={styles.secondary} onClick={status.refresh} type="button">
        {t.retry}
      </button>
    ) : null;
  }

  return (
    <>
      <button
        className={styles.secondary}
        disabled={
          mutation.busy || props.reconciling ||
          (!status.data?.eligible && !verifiedStatus?.eligible)
        }
        onClick={() => {
          openRef.current = true;
          dialogGeneration.current++;
          setOpen(true);
          setResult(null);
          setCopyFeedback(null);
          status.refresh();
        }}
        type="button"
      >
        {t.action}
      </button>
      {open && mutation.mfaOpen ? (
        <SensitiveMfaDialog
          api={props.api}
          onAssured={mutation.onMfaAssured}
          onClose={mutation.closeMfa}
        />
      ) : open ? (
        <FocusDialog label={t.title} onClose={close}>
          <div className={styles.stack}>
            <h2 className={styles.dialogTitle}>{t.title}</h2>
            <p className={styles.muted}>{t.description}</p>
            {result?.outcome === "LINK_ISSUED" ? (
              <>
                <p role="status">{t.issued}</p>
                <p className={styles.muted}>
                  {t.expires}: <bdi dir="ltr">{new Date(result.expiresAt).toLocaleString(locale)}</bdi>
                </p>
                <button className={styles.primary} onClick={() => void copy()} type="button">
                  {t.copy}
                </button>
              </>
            ) : result?.outcome === "LINK_UNAVAILABLE" ? (
              <p role="status">{t.unavailable}</p>
            ) : null}
            {uncertain ? <p className={styles.error} role="alert">
              {reconciliation.state?.phase === "checking"
                ? t.uncertainChecking
                : reconciliation.state?.phase === "blocked"
                  ? t.uncertainBlocked
                  : reconciliation.state?.phase === "same-operation"
                    ? t.uncertainSame
                    : t.uncertain}
            </p> : null}
            {mutation.error && !uncertain ? (
              <p className={styles.error} role="alert">
                {mutation.error === adminCopy.mfaRetry ? adminCopy.mfaRetry : t.failed}
              </p>
            ) : null}
            {copyFeedback ? <p role="status">{copyFeedback}</p> : null}
            {(
              reconciliation.state?.phase === "blocked" ||
              (reconciliation.state?.phase === "checking" && !mutation.busy)
            ) ? (
              <button
                className={styles.secondary}
                onClick={() => { if (attemptRef.current) void reconciliation.reconcile(attemptRef.current); }}
                type="button"
              >
                {t.retry}
              </button>
            ) : status.error && !reconciliation.state ? (
              <button className={styles.secondary} onClick={status.refresh} type="button">
                {t.retry}
              </button>
            ) : null}
            <div className={styles.actions}>
              <button
                className={styles.primary}
                disabled={
                  mutation.busy || statusLoading || statusError ||
                  !verifiedStatus?.eligible || props.reconciling
                }
                onClick={issue}
                type="button"
              >
                {reconciliation.state?.phase === "same-operation"
                  ? t.retryOriginal
                  : result || uncertain || verifiedStatus?.linkState === "ACTIVE"
                  ? t.replace
                  : t.confirm}
              </button>
              <button className={styles.secondary} onClick={close} type="button">
                {t.close}
              </button>
            </div>
          </div>
        </FocusDialog>
      ) : null}
    </>
  );
}
