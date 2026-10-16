"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { DashboardLocale } from "../../../lib/i18n/locale";
import { styles } from "../administration-ui";
import { ScopedContextHelp } from "../../help/scoped-context-help";
import type { PresenceApi, PresenceLocation } from "./shift-presence-api";
import { presenceCopy } from "./shift-presence-copy";
import { guidedPresenceCopy } from "./shift-presence-guided-copy";
import {
  presenceFields, presencePolicyIntent, isStrictPresenceMode,
  type Field, type PresencePolicyDraftState, type PresencePolicyDrafts,
} from "./shift-presence-policy-fields";
import type { PresenceMutation } from "./use-shift-presence-mutation";
import {
  applyGuidedPlan, guidedPlan, guidedPlanError,
  type GuidedPlan, type GuidedOutcome, type GuidedStop,
} from "./shift-presence-guided-apply";

export type { PresencePolicyDraftState, PresencePolicyDrafts };

type Phase = "DRAFT" | "REVIEWED" | "CONFIRMED" | "APPLYING" | "FINISHED";

const stopCopy: Record<GuidedStop, Parameters<ReturnType<typeof guidedPresenceCopy>>[0]> = {
  INVALID: "invalidDraft", CONFLICT: "conflict", NOT_READY: "serverNotReady",
  BLOCKED: "stopNoReplay", UNKNOWN: "unknown", DENIED: "denied",
  CANCELLED: "stopNoReplay", READ_FAILED: "retryAfterRefresh",
};

export function ShiftPresenceSetupReview(props: {
  readonly api: PresenceApi;
  readonly locale: DashboardLocale;
  readonly data: PresenceLocation;
  readonly companyName: string;
  readonly locationName: string;
  readonly drafts: PresencePolicyDrafts;
  readonly mutation: PresenceMutation;
  readonly loading: boolean;
  readonly isCurrent: () => boolean;
  readonly onDraftChange: (field: Field["field"], next: PresencePolicyDraftState | null) => void;
  readonly onPolicy: () => void;
  readonly onOverview: () => void;
}) {
  const copy = guidedPresenceCopy(props.locale);
  const t = presenceCopy(props.locale);
  const [phase, setPhase] = useState<Phase>("DRAFT");
  const [reviewed, setReviewed] = useState<GuidedPlan | null>(null);
  const [outcome, setOutcome] = useState<GuidedOutcome | null>(null);
  const [confirmed, setConfirmed] = useState<readonly Field["field"][]>([]);
  const [saved, setSaved] = useState<PresenceLocation | null>(null);
  const [stop, setStop] = useState<GuidedStop | null>(null);
  const [ack, setAck] = useState(false);
  const flight = useRef(false);
  const mounted = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const reviewButton = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    mounted.current = true;
    heading.current?.focus();
    return () => { mounted.current = false; };
  }, []);
  const current = () => mounted.current && props.isCurrent();
  const initial = guidedPlan(saved ?? props.data, props.drafts);
  const plan = reviewed ?? initial;
  const requiresAck = plan.actions.some((action) => {
    const proposed = action.intent.kind === "SET"
      ? action.intent.value : plan.baseline.company[action.field.key];
    return isStrictPresenceMode(proposed);
  });
  const busy = phase === "APPLYING";

  async function review() {
    if (flight.current || props.loading || props.mutation.blocked ||
        !props.data.capabilities.canEdit || !current()) return;
    flight.current = true;
    setStop(null);
    setOutcome(null);
    setConfirmed([]);
    setReviewed(null);
    try {
      const response = await props.api.policy();
      if (!current()) return;
      if (!("overrides" in response)) { setStop("DENIED"); return; }
      const next = guidedPlan(response, props.drafts);
      const error = guidedPlanError(next);
      if (error) { setStop(error); return; }
      setSaved(response);
      setReviewed(next);
      setAck(false);
      setPhase("REVIEWED");
    } catch {
      if (current()) setStop("READ_FAILED");
    } finally {
      flight.current = false;
    }
  }
  function resetReview() {
    if (busy) return;
    setPhase("DRAFT");
    setReviewed(null);
    setOutcome(null);
    setConfirmed([]);
    setAck(false);
    setStop(null);
    setSaved(null);
    queueMicrotask(() => reviewButton.current?.focus());
  }
  async function apply() {
    if (!reviewed || phase !== "CONFIRMED" || flight.current ||
        props.mutation.blocked || props.loading ||
        !props.data.capabilities.canEdit || !current()) return;
    flight.current = true;
    setPhase("APPLYING");
    try {
      const result = await applyGuidedPlan(reviewed, {
        api: props.api, mutation: props.mutation, isCurrent: current,
        onCommitted: (field, canonical) => {
          if (!current()) return;
          setSaved(canonical);
          setConfirmed((old) => [...old, field]);
          props.onDraftChange(field, null);
        },
      });
      if (current()) {
        setOutcome(result);
        setStop(result.stopped);
        setPhase("FINISHED");
      }
    } catch {
      if (current()) {
        setStop("READ_FAILED");
        setPhase("FINISHED");
      }
    } finally {
      flight.current = false;
    }
  }
  const effective = saved ?? props.data;
  return (
    <div data-testid="presence-setup-review" onKeyDown={(event) => {
      if (event.key === "Escape" && !busy &&
          (phase === "REVIEWED" || phase === "CONFIRMED")) {
        event.stopPropagation();
        resetReview();
      }
    }}>
      <div className={styles.cardPad}>
        <div className={styles.actions}>
          <h3 ref={heading} tabIndex={-1} className={styles.sectionTitle}>{copy("reviewTitle")}</h3>
          <ScopedContextHelp helpKey="presence.readiness" />
        </div>
        <p className={styles.sectionText}>{copy("reviewHelp")}</p>
        <p className={styles.sectionText}>{copy("companyScope")}: {props.companyName} · {copy("locationScope")}: {props.locationName}</p>
        <p className={styles.muted}>{copy("serverTruth")}</p>
        <p className={styles.sectionText}>
          {copy("savedVsProposed")} · {copy("pendingFields")}: {plan.actions.length -
            confirmed.length}
        </p>
        <div className={styles.tableWrap} role="region"
          aria-label={copy("savedVsProposed")} tabIndex={0}>
          <table className={`${styles.table} ${styles.referenceTable}`}>
            <thead><tr>
              <th scope="col">{copy("setting")}</th>
              <th scope="col">{copy("savedValue")} / {copy("savedSource")}</th>
              <th scope="col">{copy("proposedValue")} / {copy("proposedSource")}</th>
              <th scope="col">{copy("committed")}</th>
            </tr></thead>
            <tbody>{presenceFields.map((field) => {
              const intent = presencePolicyIntent(
                plan.baseline, field, plan.drafts[field.field]);
              const isConfirmed = confirmed.includes(field.field);
              const proposed = intent.kind === "SET" ? intent.value
                : intent.proposedSource === "INHERIT"
                  ? intent.companyValue : intent.savedValue;
              const format = (value: string | number) =>
                value === "OFF" || value === "WARN_ONLY" ||
                value === "REQUIRE" || value === "REQUIRE_OR_OVERRIDE"
                  ? t(value) : String(value);
              return <tr key={field.field} data-guided-field={field.field}>
                <th scope="row">{t(field.label)}</th>
                <td><bdi>{format(isConfirmed ? effective.effective[field.key]
                  : intent.savedValue)}</bdi> ·
                  {copy((isConfirmed
                    ? effective.overrides[field.override] === null
                      ? "INHERIT" : "CUSTOM"
                    : intent.savedSource) === "INHERIT" ? "inherit" : "custom")}</td>
                <td><bdi>{format(proposed)}</bdi> ·
                  {copy(intent.proposedSource === "INHERIT" ? "inherit" : "custom")}</td>
                <td>{isConfirmed ? copy("committed")
                  : intent.kind === "NONE" ? copy("unchanged")
                    : copy("notCommitted")}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
        <p className={styles.muted}>{copy("zonesHelp")}</p>
        <p className={styles.sectionText}>{t("zoneCount")}: {effective.readiness.activeZoneCount}</p>
        {effective.readiness.blockers.map((blocker) =>
          <p key={blocker} className={styles.error}>{t(blocker)}</p>)}
        {requiresAck ? <p className={styles.error}>{copy("strictRisk")} {copy("strictApproval")}
          {effective.readiness.activeZoneCount === 0 ? ` ${copy("requiredZone")}` : ""}
        </p> : null}
        {props.mutation.pending ? <p className={styles.error} role="alert">
          {copy("unknownHelp")}: <bdi dir="ltr">{props.mutation.pending.mutationId}</bdi>
        </p> : null}
        {stop ? <p className={styles.error} role="alert" aria-live="assertive">
          {copy(stopCopy[stop])} {copy("stopNoReplay")}</p> : null}
        {outcome ? <p role="status" aria-live="polite">
          {outcome.stopped
            ? `${copy("partial")}: ${outcome.committed.length}/${reviewed?.actions.length ?? 0}. ${copy("partialHelp")}`
            : copy("applyComplete")}</p> : null}
        {phase === "DRAFT" ? <button ref={reviewButton} className={styles.primary} type="button"
          disabled={props.loading || props.mutation.blocked ||
            !props.data.capabilities.canEdit || busy}
          onClick={() => void review()}>{copy("reviewButton")}</button> : null}
        {phase === "REVIEWED" ? <div>
          <p>{copy("confirmHelp")}</p>
          {requiresAck ? <label>
            <input type="checkbox" checked={ack}
              onChange={(event) => setAck(event.target.checked)} />
            {copy("confirmStrict")}
          </label> : null}
          <button className={styles.primary} type="button"
            disabled={plan.actions.length === 0 || (requiresAck && !ack)}
            onClick={() => setPhase("CONFIRMED")}>{copy("confirmButton")}</button>
          <button className={styles.secondary} type="button"
            onClick={resetReview}>{copy("cancel")}</button>
        </div> : null}
        {phase === "CONFIRMED" ? <div>
          <p>{copy("confirmTitle")} · {copy("noAggregateSave")}</p>
          <button className={styles.primary} type="button"
            disabled={props.mutation.blocked || props.loading ||
              !props.data.capabilities.canEdit}
            onClick={() => void apply()}>{copy("applyButton")}</button>
          <button className={styles.secondary} type="button"
            onClick={resetReview}>{copy("cancel")}</button>
        </div> : null}
        {phase === "APPLYING" ? <p role="status">{copy("applying")}</p> : null}
        {phase === "FINISHED" ? <p>{copy("retryAfterRefresh")}</p> : null}
        <div className={styles.actions}>
          <button className={styles.secondary} type="button" disabled={busy}
            onClick={props.onPolicy}>{copy("backToPolicy")}</button>
          <button className={styles.secondary} type="button" disabled={busy}
            onClick={props.onOverview}>{copy("backToOverview")}</button>
        </div>
      </div>
    </div>
  );
}
