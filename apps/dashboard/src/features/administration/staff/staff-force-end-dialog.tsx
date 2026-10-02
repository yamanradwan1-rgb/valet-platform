"use client";
import {
  staffManagementDisplayName,
  type StaffShiftHistoryEntry,
} from "@valet/contracts";
import { useEffect, useId, useRef, type FormEvent } from "react";
import { FocusDialog } from "../../../components/presentation/focus-dialog";
import { useProtectedDashboard } from "../../../components/foundation/protected-dashboard-context";
import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { styles } from "../administration-ui";
import { SensitiveMfaDialog } from "../sensitive-mfa-dialog";
import { staffForceEndCopy } from "./staff-force-end-copy";
import type { ForceEndRecovery } from "./staff-force-end-recovery";
import {
  useStaffShiftForceEnd,
  type ForceEndRead,
} from "./use-staff-shift-force-end";

export function StaffForceEndDialog(props: {
  readonly organizationId: string;
  readonly target: StaffShiftHistoryEntry;
  readonly read: ForceEndRead;
  readonly recovery: ForceEndRecovery | null;
  readonly onClose: () => void;
  readonly onDenied: () => void;
  readonly onReconcile: () => void;
}) {
  const dashboard = useProtectedDashboard();
  const { locale } = useDashboardLocale();
  const t = staffForceEndCopy(locale);
  const mutation = useStaffShiftForceEnd(props);
  const id = useId();
  function close() {
    mutation.cancel();
    props.onClose();
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    void mutation.submit();
  }
  const phase = mutation.phase;
  const formRef = useRef<HTMLFormElement>(null);
  const previousPhase = useRef(phase);
  useEffect(() => {
    const leavingMfa = previousPhase.current === "mfa" && phase !== "mfa";
    previousPhase.current = phase;
    let disposed = false;
    queueMicrotask(() => {
      const form = formRef.current;
      if (disposed || !form) return;
      const dialog = form.closest('[role="dialog"]');
      if (
        Array.from(
          document.querySelectorAll('[role="dialog"][aria-modal="true"]'),
        ).at(-1) !== dialog
      )
        return;
      const active = document.activeElement;
      if (
        leavingMfa ||
        !form.contains(active) ||
        active?.matches(":disabled")
      ) {
        form
          .querySelector<HTMLElement>(
            "textarea:not([disabled]), button:not([disabled])",
          )
          ?.focus();
      }
    });
    return () => {
      disposed = true;
    };
  }, [phase]);
  const message =
    phase === "idle" ? null : mutation.authRetry ? t.authRetry : t[phase];
  const needsRefresh = [
    "unknown",
    "ended-conflict",
    "conflict",
    "success-read-failed",
  ].includes(phase);
  return (
    <FocusDialog label={t.action} onClose={close}>
      <form ref={formRef} className={styles.stack} onSubmit={submit}>
        <h2 className={styles.dialogTitle}>{t.action}</h2>
        <p className={styles.dialogSubtitle}>{t.body}</p>
        <div>
          <div className={styles.strong}>
            <bdi dir="auto">
              {staffManagementDisplayName(props.target.identity)}
            </bdi>
          </div>
          <div className={styles.muted}>
            <bdi dir="ltr">{props.target.identity.email}</bdi>
          </div>
          <div>
            <bdi dir="auto">{props.target.location.name}</bdi> ·{" "}
            <bdi dir="ltr">{props.target.location.code}</bdi>
          </div>
        </div>
        <div className={styles.field}>
          <label htmlFor={id + "-reason"}>{t.reason}</label>
          <textarea
            id={id + "-reason"}
            className={styles.textarea}
            maxLength={500}
            required
            dir="auto"
            disabled={mutation.locked}
            value={mutation.reason}
            onChange={(event) => mutation.editReason(event.target.value)}
            aria-invalid={mutation.reason.length > 0 && !mutation.reason.trim()}
            aria-describedby={id + "-reason-help"}
          />
          <div id={id + "-reason-help"} className={styles.muted}>
            {mutation.reason.length > 0 && !mutation.reason.trim()
              ? t.invalid
              : t.reasonHelp}
          </div>
        </div>
        <label>
          <input
            type="checkbox"
            checked={mutation.confirmed}
            disabled={mutation.locked}
            onChange={(event) =>
              mutation.editConfirmation(event.target.checked)
            }
          />{" "}
          {t.confirm}
        </label>
        {message ? (
          <p className={styles.muted} role="status" aria-live="polite">
            {message}
          </p>
        ) : null}
        <div className={styles.actions}>
          {needsRefresh ? (
            <button
              className={styles.secondary}
              type="button"
              onClick={mutation.refresh}
            >
              {t.refresh}
            </button>
          ) : null}
          {!mutation.terminal ? (
            <button
              className={styles.primary}
              type="submit"
              disabled={!mutation.canSubmit}
            >
              {mutation.working
                ? t.submitting
                : phase === "reviewed"
                  ? t.retrySame
                  : t.action}
            </button>
          ) : null}
          <button className={styles.secondary} type="button" onClick={close}>
            {mutation.terminal ? t.close : t.cancel}
          </button>
        </div>
      </form>
      {phase === "mfa" ? (
        <SensitiveMfaDialog
          api={dashboard.api}
          onAssured={mutation.onMfaAssured}
          onClose={mutation.closeMfa}
        />
      ) : null}
    </FocusDialog>
  );
}
