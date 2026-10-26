"use client";
import {
  staffShiftForceEndReasonSchema,
  type StaffShiftHistoryEntry,
  type StaffShiftHistoryDetail,
} from "@valet/contracts";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useProtectedDashboard } from "../../../components/foundation/protected-dashboard-context";
import { useStaffAuth } from "../../../lib/auth/staff-auth-context";
import { forceEndShift } from "./staff-shift-force-end-api";
import {
  ForceEndIntent,
  forceEndFailure,
  type ForceEndFailure,
} from "./staff-force-end-intent";
import {
  forceEndRecoveryScope,
  rememberForceEndRecovery,
  type ForceEndRecovery,
} from "./staff-force-end-recovery";

type Phase =
  | Exclude<ForceEndFailure, "denied">
  | "idle"
  | "submitting"
  | "success"
  | "ended"
  | "reviewed"
  | "success-read-failed";
type State =
  | { phase: Phase }
  | { phase: "reconciling"; expectedRevision: number; confirmed: boolean };
export interface ForceEndRead {
  readonly item: StaffShiftHistoryDetail | null;
  readonly loading: boolean;
  readonly error: Error | null;
  readonly revision: number;
}

export function useStaffShiftForceEnd(props: {
  readonly organizationId: string;
  readonly target: StaffShiftHistoryEntry;
  readonly read: ForceEndRead;
  readonly recovery: ForceEndRecovery | null;
  readonly onReconcile: () => void;
  readonly onDenied: () => void;
}) {
  const dashboard = useProtectedDashboard();
  const { client: auth } = useStaffAuth();
  const [intent] = useState(() => {
    const value = new ForceEndIntent();
    if (props.recovery)
      value.restore(
        props.organizationId,
        props.target.shiftId,
        props.recovery.reason,
        props.recovery.operationId,
      );
    return value;
  });
  const [reason, setReason] = useState(props.recovery?.reason ?? "");
  const [confirmed, setConfirmed] = useState(props.recovery !== null);
  const [state, setState] = useState<State>({
    phase:
      props.target.status === "ENDED"
        ? "ended"
        : props.recovery
          ? "retry"
          : "idle",
  });
  const mounted = useRef(false);
  const sequence = useRef(0);
  const busy = useRef(false);
  const authRecoveryAllowed = useRef(true);
  const cancelled = useRef(false);
  const { read, onDenied } = props;
  useLayoutEffect(() => {
    mounted.current = true;
    authRecoveryAllowed.current = true;
    return () => {
      mounted.current = false;
      sequence.current += 1;
      authRecoveryAllowed.current =
        auth.getIdentityGeneration() === dashboard.identityGeneration &&
        auth.getSessionGeneration() !== dashboard.sessionGeneration;
    };
  }, [auth, dashboard.identityGeneration, dashboard.sessionGeneration]);

  useEffect(() => {
    if (
      state.phase !== "reconciling" ||
      read.revision < state.expectedRevision ||
      read.loading
    )
      return;
    let disposed = false;
    queueMicrotask(() => {
      if (disposed || !mounted.current) return;
      if (read.error) {
        if (forceEndFailure(read.error) === "denied") onDenied();
        else
          setState({
            phase: state.confirmed ? "success-read-failed" : "unknown",
          });
      } else if (read.item) {
        const ended = read.item.status === "ENDED";
        if (ended) intent.reset();
        setState({
          phase: state.confirmed ? "success" : ended ? "ended" : "reviewed",
        });
      }
    });
    return () => {
      disposed = true;
    };
  }, [state, read, onDenied, intent]);

  const phase = state.phase;
  const working = phase === "submitting" || phase === "reconciling";
  const terminal = ["success", "ended", "success-read-failed"].includes(phase);
  const locked =
    working ||
    terminal ||
    ["unknown", "mfa", "ended-conflict", "conflict"].includes(phase);
  const valid =
    confirmed && staffShiftForceEndReasonSchema.safeParse(reason).success;
  const canSubmit =
    valid &&
    !working &&
    !terminal &&
    !["unknown", "mfa", "ended-conflict", "conflict"].includes(phase);

  function edit(nextReason: string, nextConfirmed: boolean) {
    if (locked) return;
    if (reason.trim() !== nextReason.trim() || confirmed !== nextConfirmed) {
      intent.reset();
      sequence.current += 1;
      setState({ phase: "idle" });
    }
    setReason(nextReason);
    setConfirmed(nextConfirmed);
  }
  function refresh(knownSuccess = terminal) {
    if (working) return;
    setState({
      phase: "reconciling",
      expectedRevision: props.read.revision + 1,
      confirmed: knownSuccess,
    });
    props.onReconcile();
  }
  async function submit() {
    if (!canSubmit || busy.current) return;
    const request = intent.submit(
      props.organizationId,
      props.target.shiftId,
      reason,
      confirmed,
    );
    if (!request) return;
    busy.current = true;
    const ticket = ++sequence.current;
    const current = () => mounted.current && sequence.current === ticket;
    const scope = forceEndRecoveryScope(dashboard);
    const refreshEpoch = {
      value: null as {
        identityGeneration: number;
        sessionGeneration: number;
      } | null,
    };
    setState({ phase: "submitting" });
    try {
      await forceEndShift(
        dashboard.api,
        props.organizationId,
        props.target,
        request,
        (epoch) => {
          refreshEpoch.value = epoch;
        },
      );
      if (!current()) return;
      intent.reset();
      setState({
        phase: "reconciling",
        expectedRevision: props.read.revision + 1,
        confirmed: true,
      });
      props.onReconcile();
    } catch (error) {
      const failure = forceEndFailure(error);
      const refreshed = refreshEpoch.value;
      if (
        failure === "retry" &&
        refreshed &&
        !cancelled.current &&
        authRecoveryAllowed.current &&
        auth.getIdentityGeneration() === dashboard.identityGeneration &&
        auth.getSessionGeneration() === refreshed.sessionGeneration
      ) {
        rememberForceEndRecovery({
          scope,
          sessionGeneration: refreshed.sessionGeneration,
          shiftId: props.target.shiftId,
          reason: request.reason,
          operationId: request.operationId,
        });
      }
      if (!current()) return;
      if (failure === "denied") {
        intent.reset();
        props.onDenied();
      } else setState({ phase: failure });
    } finally {
      if (current()) busy.current = false;
    }
  }
  function cancel() {
    cancelled.current = true;
    authRecoveryAllowed.current = false;
    sequence.current += 1;
    intent.reset();
  }
  return {
    reason,
    confirmed,
    phase,
    valid,
    locked,
    working,
    terminal,
    canSubmit,
    authRetry: props.recovery !== null && phase === "retry",
    editReason: (value: string) => edit(value, confirmed),
    editConfirmation: (value: boolean) => edit(reason, value),
    submit,
    refresh: () => refresh(),
    cancel,
    onMfaAssured: () => {
      if (mounted.current) setState({ phase: "retry" });
    },
    closeMfa: () => {
      if (mounted.current) setState({ phase: "idle" });
    },
  };
}
