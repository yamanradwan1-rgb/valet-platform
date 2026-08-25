import type { Screen } from "../../types/employee-ui";
import type { StartParkingPayload } from "../../features/check-in";
import { livePermittedScreens } from "./employee-navigation";
import {
  emptyWorkspaceTargets,
  type ActiveParkingTarget,
  type ActiveRetrievalTarget,
  type EmployeeWorkspaceTargets,
  type GuestAccessTarget,
} from "./employee-workspace";

export interface EmployeeWorkspaceHandlers {
  readonly closeGuestAccess: (returnScreen: Screen) => void;
  readonly completeParking: () => void;
  readonly completeRetrieval: () => void;
  readonly nav: (screen: Screen) => void;
  readonly openGuestAccess: (sessionId: string, from: Screen) => void;
  readonly openIncident: (sessionId: string, from: Screen) => void;
  readonly selectParkingTask: (target: ActiveParkingTarget) => void;
  readonly selectRetrievalTask: (target: ActiveRetrievalTarget) => void;
  readonly startParkingSuccess: (payload: StartParkingPayload) => void;
}

/**
 * Workspace navigation/mutation handlers for the Live Employee app. Pure
 * closures over the identity-scoped workspace patcher; every target change
 * remains synchronously rescoped so nothing leaks across identity changes.
 */
export function createEmployeeWorkspaceHandlers(options: {
  readonly isPrototypeMode: boolean;
  readonly patchTargets: (
    patch: Partial<EmployeeWorkspaceTargets>,
  ) => void;
}): EmployeeWorkspaceHandlers {
  const { isPrototypeMode, patchTargets } = options;

  const nav = (s: Screen): void => {
    if (!isPrototypeMode && !livePermittedScreens.has(s)) return;
    patchTargets({ screenOverride: s });
  };

  return {
    closeGuestAccess: (returnScreen: Screen) => {
      patchTargets({
        guestAccessTarget: null,
        screenOverride: returnScreen,
      });
    },
    completeParking: () => {
      patchTargets({
        ...emptyWorkspaceTargets(),
        screenOverride: "task-queue",
      });
    },
    completeRetrieval: () => {
      patchTargets({
        activeRetrievalTarget: null,
        screenOverride: "task-queue",
      });
    },
    nav,
    openGuestAccess: (sessionId: string, from: Screen) => {
      const target: GuestAccessTarget = { returnScreen: from, sessionId };
      patchTargets({
        guestAccessTarget: target,
        screenOverride: "guest-access",
      });
    },
    openIncident: (sessionId: string, from: Screen) => {
      patchTargets({
        activeIncidentTarget: { returnScreen: from, sessionId },
        screenOverride: "incident",
      });
    },
    selectParkingTask: (target: ActiveParkingTarget) => {
      patchTargets({
        activeParkingPayload: null,
        activeParkingTarget: target,
        screenOverride: "parking",
      });
    },
    selectRetrievalTask: (target: ActiveRetrievalTarget) => {
      patchTargets({
        activeRetrievalTarget: target,
        screenOverride: "retrieval",
      });
    },
    startParkingSuccess: (payload: StartParkingPayload) => {
      patchTargets({
        activeParkingPayload: payload,
        activeParkingTarget: null,
        activeRetrievalTarget: null,
        screenOverride: "parking",
      });
    },
  };
}
