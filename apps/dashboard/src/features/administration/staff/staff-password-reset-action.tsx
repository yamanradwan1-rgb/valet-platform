"use client";

import type { StaffPasswordResetIssueResponse } from "@valet/contracts";
import { useCallback, useRef, useState } from "react";
import { FocusDialog } from "../../../components/presentation/focus-dialog";
import type { DashboardApiClient } from "../../../lib/api/dashboard-api-client";
import { DashboardApiError } from "../../../lib/api/dashboard-api-error";
import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { useProtectedDashboard } from "../../../components/foundation/protected-dashboard-context";
import { administrationScopeKey } from "../administration-scope";
import { administrationCopy } from "../administration-copy";
import { styles } from "../administration-ui";
import { SensitiveMfaDialog } from "../sensitive-mfa-dialog";
import { useAuthoritativeRead } from "../use-authoritative-read";
import { useSensitiveMutation } from "../use-sensitive-mutation";
import { issueStaffPasswordReset, readStaffPasswordResetStatus } from "./staff-password-reset-api";
import { staffPasswordResetCopy } from "./staff-password-reset-copy";

export function StaffPasswordResetAction(props: {
  readonly api: DashboardApiClient;
  readonly organizationId: string;
  readonly membershipId: string;
  readonly reconciling: boolean;
}) {
  const dashboard = useProtectedDashboard();
  const scopeKey = administrationScopeKey(dashboard);
  const { locale } = useDashboardLocale();
  const t = staffPasswordResetCopy[locale];
  const adminCopy = administrationCopy(locale);
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  const dialogGeneration = useRef(0);
  const operationId = useRef<string | null>(null);
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
      operationId.current = null;
      status.refresh();
    },
  );

  function close() {
    dialogGeneration.current++;
    openRef.current = false;
    setOpen(false);
    setResult(null);
    setCopyFeedback(null);
    operationId.current = null;
    // Closing a POST in progress cannot establish whether it committed.
    if (mutation.busy) {
      setUncertain(true);
      status.refresh();
    }
  }

  function issue() {
    if (
      !openRef.current ||
      mutation.busy ||
      props.reconciling ||
      status.loading ||
      !status.data?.eligible
    ) return;
    setResult(null);
    setCopyFeedback(null);
    setUncertain(false);
    operationId.current ??= crypto.randomUUID();
    const capturedDialogGeneration = dialogGeneration.current;
    const currentDialog = () =>
      openRef.current && dialogGeneration.current === capturedDialogGeneration;
    const command = {
      operationId: operationId.current,
      expectedGeneration: status.data.latestGeneration,
    };
    void mutation.run(
      async () => {
        try {
          return await issueStaffPasswordReset(
            props.api, props.organizationId, props.membershipId, command,
          );
        } catch (reason) {
          if (
            reason instanceof DashboardApiError &&
            (reason.kind === "network" || reason.kind === "malformed")
          ) {
            if (currentDialog()) {
              setUncertain(true);
              operationId.current = null;
            }
            status.refresh();
          }
          throw reason;
        }
      },
      (next) => {
        if (!currentDialog()) {
          status.refresh();
          return;
        }
        setResult(next);
        setUncertain(false);
        operationId.current = null;
        status.refresh();
      },
    );
  }

  async function copy() {
    if (!openRef.current || result?.outcome !== "LINK_ISSUED") return;
    try {
      await navigator.clipboard.writeText(result.resetLink);
      if (openRef.current) setCopyFeedback(t.copied);
    } catch {
      if (openRef.current) setCopyFeedback(t.copyFailed);
    }
  }

  if (status.loading && !status.data) return null;
  if (!status.data?.eligible && !open) {
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
        disabled={mutation.busy || props.reconciling || !status.data?.eligible}
        onClick={() => {
          openRef.current = true;
          dialogGeneration.current++;
          setOpen(true);
          setResult(null);
          setUncertain(false);
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
            {uncertain ? <p className={styles.error} role="alert">{t.uncertain}</p> : null}
            {mutation.error && !uncertain ? (
              <p className={styles.error} role="alert">
                {mutation.error === adminCopy.mfaRetry ? adminCopy.mfaRetry : t.failed}
              </p>
            ) : null}
            {copyFeedback ? <p role="status">{copyFeedback}</p> : null}
            {status.error ? (
              <button className={styles.secondary} onClick={status.refresh} type="button">
                {t.retry}
              </button>
            ) : null}
            <div className={styles.actions}>
              <button
                className={styles.primary}
                disabled={mutation.busy || status.loading || !status.data?.eligible || props.reconciling}
                onClick={issue}
                type="button"
              >
                {result || uncertain || status.data?.linkState === "ACTIVE"
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
