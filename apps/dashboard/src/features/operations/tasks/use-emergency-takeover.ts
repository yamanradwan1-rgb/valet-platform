"use client";

import {
  emergencyTakeoverRequestSchema,
  type EmergencyTakeoverContextResponse,
  type EmergencyTakeoverRequest,
  type EmergencyTakeoverResponse,
} from "@valet/contracts";
import { useEffect, useRef, useState } from "react";
import type { DashboardApiClient } from "../../../lib/api/dashboard-api-client";
import { DashboardApiError } from "../../../lib/api/dashboard-api-error";
import { emergencyTakeoverCopy } from "./emergency-takeover-copy";
import { EmergencyTakeoverIntent } from "./emergency-takeover-intent";
import {
  readEmergencyTakeoverContext,
  submitEmergencyTakeover,
} from "./emergency-takeover-api";

type Phase = "loading" | "idle" | "submitting" | "reconciling" | "unknown" | "success" | "error";

export function useEmergencyTakeover(input: {
  readonly api: DashboardApiClient;
  readonly taskId: string;
  readonly scopeKey: string;
  readonly locale: "en" | "ar";
  readonly onCanonicalRefresh: () => void;
  readonly onDenied: () => void;
}) {
  const [context, setContext] = useState<EmergencyTakeoverContextResponse | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [search, setSearch] = useState("");
  const [replacementMembershipId, setReplacementMembershipId] = useState("");
  const [reviewedUnknown, setReviewedUnknown] = useState(false);
  const intent = useRef(new EmergencyTakeoverIntent());
  const lastRequest = useRef<EmergencyTakeoverRequest | null>(null);
  const receipt = useRef<EmergencyTakeoverResponse | null>(null);
  const active = useRef(false);
  const sequence = useRef(0);
  const busy = useRef(false);
  const t = emergencyTakeoverCopy(input.locale);

  useEffect(() => {
    active.current = true;
    const ticket = ++sequence.current;
    const controller = new AbortController();
    const load = () => void readEmergencyTakeoverContext(
      input.api, input.taskId, controller.signal, search,
    )
      .then((value) => {
        if (!active.current || sequence.current !== ticket) return;
        setContext(value);
        setPhase("idle");
      })
      .catch((error: unknown) => {
        if (!active.current || controller.signal.aborted || sequence.current !== ticket) return;
        if (denied(error)) input.onDenied();
        else {
          setPhase("error");
          setMessage(t.unavailable);
        }
      });
    const timeout = setTimeout(load, search ? 250 : 0);
    return () => {
      clearTimeout(timeout);
      active.current = false;
      sequence.current += 1;
      controller.abort();
    };
    // The caller keys this component by auth/session/selection scope and task ID.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input.api, input.scopeKey, input.taskId, search]);

  async function refresh() {
    if (busy.current) return;
    busy.current = true;
    const ticket = ++sequence.current;
    const previouslyUnknown = phase === "unknown";
    setPhase("reconciling");
    setMessage(null);
    try {
      const latest = await readEmergencyTakeoverContext(input.api, input.taskId, undefined, search);
      if (!active.current || sequence.current !== ticket) return;
      setContext(latest);
      if (receipt.current) {
        setPhase("success");
        setMessage(matchesReceipt(latest, receipt.current) ? t.success : t.successReadFailed);
        input.onCanonicalRefresh();
      } else if (previouslyUnknown) {
        setReviewedUnknown(true);
        setPhase("unknown");
        setMessage(t.unknown);
      } else {
        intent.current.reset();
        lastRequest.current = null;
        setPhase("idle");
      }
    } catch (error) {
      if (!active.current || sequence.current !== ticket) return;
      if (denied(error)) input.onDenied();
      else if (receipt.current) {
        setPhase("success");
        setMessage(t.successReadFailed);
        input.onCanonicalRefresh();
      } else {
        setPhase(previouslyUnknown ? "unknown" : "error");
        setMessage(previouslyUnknown ? t.unknown : t.unavailable);
      }
    } finally {
      busy.current = false;
    }
  }

  async function execute(request: EmergencyTakeoverRequest) {
    if (busy.current) return;
    busy.current = true;
    const ticket = ++sequence.current;
    setPhase("submitting");
    setMessage(null);
    try {
      const result = await submitEmergencyTakeover(input.api, input.taskId, request);
      if (!active.current || sequence.current !== ticket) return;
      receipt.current = result;
      setPhase("reconciling");
      const latest = await readEmergencyTakeoverContext(input.api, input.taskId, undefined, search);
      if (!active.current || sequence.current !== ticket) return;
      setContext(latest);
      if (matchesReceipt(latest, result)) {
        setPhase("success");
        setMessage(t.success);
        input.onCanonicalRefresh();
      } else {
        setPhase("success");
        setMessage(t.successReadFailed);
        input.onCanonicalRefresh();
      }
    } catch (error) {
      if (!active.current || sequence.current !== ticket) return;
      if (denied(error)) {
        input.onDenied();
      } else if (receipt.current !== null) {
        setPhase("success");
        setMessage(t.successReadFailed);
        input.onCanonicalRefresh();
      } else if (ambiguous(error)) {
        setReviewedUnknown(false);
        setPhase("unknown");
        setMessage(t.unknown);
      } else {
        setPhase("error");
        setMessage(error instanceof DashboardApiError && error.kind === "conflict" ? t.changed : t.failed);
      }
    } finally {
      busy.current = false;
    }
  }

  function submit() {
    if (phase !== "idle") return;
    if (!context || !context.eligibleAssignees.some(
      (candidate) => candidate.membershipId === replacementMembershipId,
    )) return;
    const candidate = intent.current.prepare({
      taskId: input.taskId,
      expectedVersion: context.task.version,
      targetAssigneeMembershipId: replacementMembershipId,
      reason,
    });
    if (!candidate) return;
    const parsed = emergencyTakeoverRequestSchema.safeParse(candidate);
    if (!parsed.success) {
      setPhase("error");
      setMessage(t.invalidReason);
      return;
    }
    lastRequest.current = parsed.data;
    void execute(parsed.data);
  }

  function editReason(value: string) {
    if (phase === "idle" || phase === "error") {
      intent.current.reset();
      setReason(value);
    }
  }
  function editReplacement(value: string) {
    if (phase === "idle" || phase === "error") {
      intent.current.reset();
      setReplacementMembershipId(value);
    }
  }
  function editSearch(value: string) {
    if (phase !== "idle" && phase !== "error" && phase !== "loading") return;
    setSearch(value);
    setReplacementMembershipId("");
    setMessage(null);
    setPhase("loading");
  }
  const candidate = context && emergencyTakeoverRequestSchema.safeParse({
    operationId: "00000000-0000-4000-8000-000000000000",
    expectedVersion: context.task.version,
    targetAssigneeMembershipId: replacementMembershipId,
    reason,
  }).success;
  const canSubmit = phase === "idle" && Boolean(candidate) &&
    Boolean(context?.eligibleAssignees.some((item) => item.membershipId === replacementMembershipId));
  return {
    context, phase, message, reason, search, replacementMembershipId, canSubmit,
    retryAllowed: phase === "unknown" && reviewedUnknown,
    editReason, editReplacement, editSearch, submit, refresh: () => void refresh(),
    retry: () => {
      if (phase === "unknown" && reviewedUnknown && lastRequest.current)
        void execute(lastRequest.current);
    },
  };
}

function matchesReceipt(context: EmergencyTakeoverContextResponse, receipt: EmergencyTakeoverResponse) {
  return context.task.id === receipt.task.id &&
    context.task.version === receipt.task.version &&
    context.task.assigneeMembershipId === receipt.task.assigneeMembershipId;
}

function denied(error: unknown) {
  return error instanceof DashboardApiError &&
    (error.kind === "auth" || error.kind === "authorization" || error.kind === "mfa");
}

function ambiguous(error: unknown) {
  return !(error instanceof DashboardApiError) ||
    error.kind === "network" || error.kind === "malformed" || error.kind === "unknown";
}
