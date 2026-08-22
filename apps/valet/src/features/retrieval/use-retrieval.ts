"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { EmployeeApiClient } from "../../lib/api/employee-api-client";
import {
  getDefaultStaffAuthClient,
  useOptionalStaffAuth,
} from "../../lib/auth/staff-auth-context";
import { RetrievalController } from "./retrieval-controller";
import type {
  ActiveRetrievalSession,
  RetrievalFlowStep,
  RetrievalState,
} from "./retrieval-types";

export interface UseRetrievalOptions {
  readonly actorRole?: "VALET_SUPERVISOR" | undefined;
  readonly client?: EmployeeApiClient | undefined;
  readonly currentAssigneeMembershipId?: string | null | undefined;
  readonly initialSession?: ActiveRetrievalSession | null | undefined;
  readonly membershipId?: string | null | undefined;
  readonly onAuthorizationLoss?: (() => void) | undefined;
  readonly sessionId?: string | null | undefined;
  readonly taskId?: string | null | undefined;
  readonly taskStatus?: "ACCEPTED" | "IN_PROGRESS" | null | undefined;
  readonly taskVersion?: number | null | undefined;
}

export interface UseRetrievalResult {
  readonly activeSession: ActiveRetrievalSession | null;
  readonly confirmKey: (inputKeySlotCode: string) => boolean;
  readonly error: string | null;
  readonly isHydrating: boolean;
  readonly isSubmitting: boolean;
  readonly markReady: () => Promise<void>;
  readonly retry: () => Promise<void>;
  readonly setStep: (step: RetrievalFlowStep) => void;
  readonly startRetrieval: () => Promise<void>;
  readonly step: RetrievalFlowStep;
}

function getInitialStep(
  session?: ActiveRetrievalSession | null,
): RetrievalFlowStep {
  if (!session) return "key-checkout";
  if (session.state === "RETRIEVING") return "in-progress";
  if (session.state === "READY") return "vehicle-ready";
  if (session.state === "HANDOFF_PENDING") return "handoff";
  return "key-checkout";
}

export function useRetrieval(options: UseRetrievalOptions): UseRetrievalResult {
  const {
    actorRole,
    initialSession,
    sessionId,
    taskId,
    taskVersion,
    taskStatus,
    currentAssigneeMembershipId,
    membershipId,
    client: customClient,
    onAuthorizationLoss,
  } = options;
  const auth = useOptionalStaffAuth();
  const authClient = auth?.client;

  const apiClient = useMemo(
    () =>
      customClient ??
      new EmployeeApiClient({
        authClient: authClient ?? getDefaultStaffAuthClient(),
        onAuthorizationLoss,
      }),
    [customClient, authClient, onAuthorizationLoss],
  );

  const [controllerState, setControllerState] = useState<RetrievalState>({
    activeSession: initialSession ?? null,
    error: null,
    isHydrating: !initialSession && Boolean(sessionId && taskId),
    isSubmitting: false,
    step: getInitialStep(initialSession),
  });

  const [controller] = useState(
    () =>
      new RetrievalController(
        apiClient,
        (nextState) => {
          setControllerState(nextState);
        },
        membershipId,
        initialSession,
      ),
  );

  useEffect(() => {
    controller.setApiClient(apiClient);
  }, [controller, apiClient]);

  useEffect(() => {
    controller.setMembershipId(membershipId);
  }, [controller, membershipId]);

  useEffect(() => {
    if (initialSession) {
      controller.setActiveSession(initialSession);
    } else if (sessionId && taskId) {
      if (
        taskVersion !== null && taskVersion !== undefined &&
        taskStatus &&
        (currentAssigneeMembershipId || actorRole === "VALET_SUPERVISOR")
      ) {
        void controller.hydrateSession(
          sessionId,
          taskId,
          taskVersion,
          taskStatus,
          currentAssigneeMembershipId ?? "",
          actorRole,
        );
      } else {
        controller.setHydrationError(
          "Retrieval task assignment details are incomplete. Reload the task from the Task Queue.",
        );
      }
    }
  }, [
    actorRole, controller, initialSession, sessionId, taskId,
    taskVersion, taskStatus, currentAssigneeMembershipId, membershipId,
  ]);

  const confirmKey = useCallback(
    (inputKeySlotCode: string) => controller.confirmKey(inputKeySlotCode),
    [controller],
  );

  const startRetrieval = useCallback(
    async () => { await controller.startRetrieval(); },
    [controller],
  );

  const markReady = useCallback(
    async () => { await controller.markReady(); },
    [controller],
  );

  const retry = useCallback(async () => {
    if (sessionId && taskId) {
      if (
        taskVersion !== null && taskVersion !== undefined &&
        taskStatus &&
        (currentAssigneeMembershipId || actorRole === "VALET_SUPERVISOR")
      ) {
        await controller.hydrateSession(
          sessionId,
          taskId,
          taskVersion,
          taskStatus,
          currentAssigneeMembershipId ?? "",
          actorRole,
        );
      } else {
        controller.setHydrationError(
          "Retrieval task assignment details are incomplete. Reload the task from the Task Queue.",
        );
      }
    }
  }, [
    actorRole, controller, sessionId, taskId, taskVersion,
    taskStatus, currentAssigneeMembershipId,
  ]);

  const setStep = useCallback(
    (step: RetrievalFlowStep) => { controller.setStep(step); },
    [controller],
  );

  return {
    activeSession: controllerState.activeSession,
    confirmKey,
    error: controllerState.error,
    isHydrating: controllerState.isHydrating,
    isSubmitting: controllerState.isSubmitting,
    markReady,
    retry,
    setStep,
    startRetrieval,
    step: controllerState.step,
  };
}
