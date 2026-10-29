"use client";

import { useId, type FormEvent } from "react";
import { FocusDialog } from "../../../components/presentation/focus-dialog";
import { styles } from "../operations-ui";
import { emergencyTakeoverCopy } from "./emergency-takeover-copy";

export interface EmergencyTakeoverView {
  readonly taskId: string;
  readonly vehicle: string;
  readonly currentAssignee: string;
  readonly candidates: readonly {
    readonly membershipId: string;
    readonly label: string;
  }[];
  readonly hasMoreCandidates: boolean;
  readonly custody: readonly {
    readonly label: string;
    readonly value: string;
  }[];
  readonly recentCustody: readonly {
    readonly id: string;
    readonly label: string;
  }[];
  readonly history: readonly {
    readonly id: string;
    readonly label: string;
  }[];
}

export function EmergencyTakeoverDialog(props: {
  readonly locale: "en" | "ar";
  readonly view: EmergencyTakeoverView | null;
  readonly reason: string;
  readonly replacementMembershipId: string;
  readonly search: string;
  readonly phase: "loading" | "idle" | "submitting" | "reconciling" | "unknown" | "success" | "error";
  readonly message: string | null;
  readonly canSubmit: boolean;
  readonly retryAllowed: boolean;
  readonly onReasonChange: (value: string) => void;
  readonly onReplacementChange: (value: string) => void;
  readonly onSearchChange: (value: string) => void;
  readonly onSubmit: () => void;
  readonly onRefresh: () => void;
  readonly onRetry: () => void;
  readonly onClose: () => void;
}) {
  const t = emergencyTakeoverCopy(props.locale);
  const id = useId();
  const working = props.phase === "submitting" || props.phase === "reconciling";
  const locked = working || props.phase === "unknown" || props.phase === "success";
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (props.canSubmit && !locked) props.onSubmit();
  };
  return (
    <FocusDialog label={t.title} onClose={props.onClose}>
      <form onSubmit={submit} aria-busy={working} data-testid="emergency-takeover-dialog">
        <h2>{t.title}</h2>
        <p className={styles.muted}>{t.notice}</p>
        {props.view ? (
          <>
            <dl>
              <dt>{t.task}</dt>
              <dd><bdi dir="ltr">{props.view.taskId}</bdi></dd>
              <dt>{t.vehicle}</dt>
              <dd><bdi dir="auto">{props.view.vehicle}</bdi></dd>
              <dt>{t.currentAssignee}</dt>
              <dd><bdi dir="auto">{props.view.currentAssignee}</bdi></dd>
            </dl>
            <section aria-label={t.custody}>
              <h3>{t.custody}</h3>
              <dl>
                {props.view.custody.map((fact, index) => (
                  <div key={index}>
                    <dt>{fact.label}</dt>
                    <dd><bdi dir="auto">{fact.value}</bdi></dd>
                  </div>
                ))}
              </dl>
              {props.view.recentCustody.length > 0 ? (
                <>
                  <h3>{t.recentCustody}</h3>
                  <ul>
                    {props.view.recentCustody.map((event) => (
                      <li key={event.id}><bdi dir="auto">{event.label}</bdi></li>
                    ))}
                  </ul>
                </>
              ) : null}
            </section>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor={id + "-search"}>
                {t.replacementSearch}
              </label>
              <input
                className={styles.input}
                data-testid="emergency-takeover-search"
                disabled={locked}
                id={id + "-search"}
                maxLength={80}
                onChange={(event) => props.onSearchChange(event.target.value)}
                type="search"
                value={props.search}
              />
              <p className={styles.muted}>{t.replacementSearchHelp}</p>
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor={id + "-replacement"}>
                {t.replacement}
              </label>
              <select
                className={styles.select}
                data-testid="emergency-takeover-candidate"
                disabled={locked}
                id={id + "-replacement"}
                onChange={(event) => props.onReplacementChange(event.target.value)}
                required
                value={props.replacementMembershipId}
              >
                <option value="">{t.replacementPlaceholder}</option>
                {props.view.candidates.map((candidate) => (
                  <option key={candidate.membershipId} value={candidate.membershipId}>
                    {candidate.label}
                  </option>
                ))}
              </select>
              {props.view.candidates.length === 0 ? (
                <p className={styles.muted} role="status">{t.noCandidates}</p>
              ) : null}
              {props.view.hasMoreCandidates ? (
                <p className={styles.muted}>{t.moreCandidates}</p>
              ) : null}
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor={id + "-reason"}>
                {t.reason}
              </label>
              <textarea
                aria-describedby={id + "-reason-help"}
                aria-invalid={props.reason.length > 0 && !props.reason.trim()}
                className={styles.textarea}
                data-testid="emergency-takeover-reason"
                dir="auto"
                disabled={locked}
                id={id + "-reason"}
                onChange={(event) => props.onReasonChange(event.target.value)}
                maxLength={500}
                required
                value={props.reason}
              />
              <p className={styles.muted} id={id + "-reason-help"}>{t.reasonHelp}</p>
            </div>
            <section aria-label={t.history}>
              <h3>{t.history}</h3>
              {props.view.history.length === 0 ? (
                <p className={styles.muted}>{t.noHistory}</p>
              ) : (
                <ul>
                  {props.view.history.map((entry) => (
                    <li key={entry.id}><bdi dir="auto">{entry.label}</bdi></li>
                  ))}
                </ul>
              )}
            </section>
          </>
        ) : null}
        <div aria-live="polite" role={props.phase === "error" ? "alert" : "status"}>
          {props.message ?? (props.phase === "loading" ? t.loading : null)}
        </div>
        {props.phase === "unknown" ? (
          <p className={styles.muted}>{t.unknownClose}</p>
        ) : null}
        <div className={styles.toolbar}>
          {props.phase === "unknown" || props.phase === "error" ? (
            <button className={styles.secondary} data-testid="emergency-takeover-refresh" onClick={props.onRefresh} type="button">
              {t.refresh}
            </button>
          ) : null}
          {props.retryAllowed ? (
            <button className={styles.secondary} data-testid="emergency-takeover-retry" onClick={props.onRetry} type="button">
              {t.retry}
            </button>
          ) : null}
          {props.phase !== "success" ? (
            <button className={styles.primary} data-testid="emergency-takeover-confirm" disabled={!props.canSubmit || locked} type="submit">
              {working ? t.submitting : t.confirm}
            </button>
          ) : null}
          <button className={styles.secondary} disabled={working} onClick={props.onClose} type="button">
            {props.phase === "success" || props.phase === "unknown" ? t.close : t.cancel}
          </button>
        </div>
      </form>
    </FocusDialog>
  );
}
