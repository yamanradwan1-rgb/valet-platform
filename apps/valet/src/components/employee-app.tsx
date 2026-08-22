"use client";

import { useEffect, useState, type JSX } from "react";

import type { Screen, Tab } from "../types/employee-ui";
import {
  createEmployeeAccessActions,
} from "./shell/employee-access-actions";
import { buildEmployeeAccessGateProps } from "./shell/employee-access-view";
import {
  EmployeeAccessGate,
} from "./shell/employee-access-gate";
import {
  EmployeeOperationalGate,
  type OperationalGateModel,
} from "./shell/employee-operational-gate";
import { EmployeeLiveRouter } from "./shell/employee-live-router";
import { EmployeePrototypeFrame } from "./shell/employee-prototype-frame";
import {
  emptyWorkspaceTargets,
  initialScopedWorkspace,
  isWorkspaceCurrent,
  makeWorkspaceStamp,
  rescopeWorkspace,
  type ActiveParkingTarget,

  type ActiveRetrievalTarget,
  type EmployeeWorkspaceTargets,
  type WorkspaceIdentityInput,
} from "./shell/employee-workspace";
import { AppHeader } from "./shell/app-header";
import { BottomNav } from "./shell/bottom-nav";
import { useStaffOperationalContext } from "../features/staff-operational-context";
import { useOptionalStaffAuth } from "../lib/auth/staff-auth-context";
import type { StartParkingPayload } from "../features/check-in";

function getActiveTab(s: Screen): Tab {
  if (s === "vehicles-list") return "vehicles";
  if (s === "scan-hub") return "scan";
  if (s === "shift-summary") return "shift";
  return "home";
}

const livePermittedScreens = new Set<Screen>([
  "task-queue",
  "check-in",
  "parking",
  "incident",
  "retrieval",
]);

export interface EmployeeAppProps {
  /**
   * Prototype rendering is an explicit opt-in. The production app never
   * falls back to prototype screens because auth expired, context is
   * loading, no active shift exists, or the context API failed.
   */
  readonly mode?: "live" | "prototype" | undefined;
}

export function EmployeeApp({ mode }: EmployeeAppProps): JSX.Element {
  const isPrototypeMode = mode === "prototype";
  const auth = useOptionalStaffAuth();
  const {
    resolution,
    response: operationalResponse,
    error: contextError,
    refresh: refreshContext,
    revalidateOnAuthLoss,
  } = useStaffOperationalContext();
  const [isPrototypeOffline, setIsPrototypeOffline] = useState(false);
  const [workspace, setWorkspace] = useState(initialScopedWorkspace);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isRetryingRestore, setIsRetryingRestore] = useState(false);

  // Headless access actions keep SYNCHRONOUS duplicate-submit guards; the
  // latest auth methods are bound from an effect, never captured in render.
  const [accessActions] = useState(createEmployeeAccessActions);
  useEffect(() => {
    return accessActions.subscribe((state) => {
      setSignInError(state.loginError);
      setIsSigningIn(state.isSigningIn);
      setIsRetryingRestore(state.isRetryingRestore);
    });
  }, [accessActions]);
  useEffect(() => {
    accessActions.bind({
      login: async (credentials) => {
        await auth?.login(credentials);
      },
      restoreSession: async () => {
        await auth?.restoreSession();
      },
    });
  }, [accessActions, auth]);

  const authStatus = auth?.status ?? "initializing";
  // Workspace scoping keys on the STABLE identity epoch, not
  // sessionGeneration: a same-user token refresh must keep workflows alive.
  const identity: WorkspaceIdentityInput = {
    authenticated: authStatus === "authenticated",
    identityGeneration: auth?.identityGeneration ?? 0,
  };
  // An identity change (logout/login/generation bump) synchronously
  // discards every transient target so no workflow can leak across users.
  const scoped = rescopeWorkspace(workspace, identity);
  const targets = isWorkspaceCurrent(workspace, identity)
    ? workspace.targets
    : scoped.targets;

  const patchTargets = (patch: Partial<EmployeeWorkspaceTargets>): void => {
    setWorkspace({
      identityStamp: makeWorkspaceStamp(identity),
      targets: { ...targets, ...patch },
    });
  };

  const nav = (s: Screen) => {
    if (!isPrototypeMode && !livePermittedScreens.has(s)) return;
    patchTargets({ screenOverride: s });
  };

  const handleStartParkingSuccess = (payload: StartParkingPayload) => {
    patchTargets({
      activeParkingPayload: payload,
      activeParkingTarget: null,
      activeRetrievalTarget: null,
      screenOverride: "parking",
    });
  };

  const handleSelectParkingTaskFromQueue = (target: ActiveParkingTarget) => {
    patchTargets({
      activeParkingPayload: null,
      activeParkingTarget: target,
      screenOverride: "parking",
    });
  };

  const handleParkingComplete = () => {
    patchTargets({ ...emptyWorkspaceTargets(), screenOverride: "task-queue" });
  };

  const handleSelectRetrievalTaskFromQueue = (
    target: ActiveRetrievalTarget,
  ) => {
    patchTargets({ activeRetrievalTarget: target, screenOverride: "retrieval" });
  };

  const handleRetrievalComplete = () => {
    patchTargets({ activeRetrievalTarget: null, screenOverride: "task-queue" });
  };

  const handleOpenIncident = (sessionId: string, from: Screen) => {
    patchTargets({
      activeIncidentTarget: { returnScreen: from, sessionId },
      screenOverride: "incident",
    });
  };


  const handleSignOut = async (): Promise<void> => {
    await auth?.logout();
  };

  if (isPrototypeMode) {
    return (
      <EmployeePrototypeFrame
        isOffline={isPrototypeOffline}
        nav={nav}
        onToggleOffline={() => setIsPrototypeOffline((o) => !o)}
        screen={(targets.screenOverride as Screen | null) ?? "shift-start"}
      />
    );
  }

  const liveScope = resolution.kind === "RESOLVED" ? resolution.scope : null;

  if (authStatus !== "authenticated") {
    const gateProps = buildEmployeeAccessGateProps({
      actionsState: {
        isRetryingRestore,
        isSigningIn,
        loginError: signInError,
      },
      handlers: {
        retryRestore: () => accessActions.retryRestore(),
        signIn: (credentials) => accessActions.signIn(credentials),
      },
      phase: authStatus,
    });
    return (
      <div className="min-h-screen bg-navy-2 flex items-center justify-center">
        <div className="w-full max-w-[390px] h-screen md:h-[844px] bg-navy overflow-hidden md:rounded-[44px] md:shadow-2xl flex flex-col">
          <EmployeeAccessGate {...gateProps} />
        </div>
      </div>
    );
  }

  if (liveScope === null) {
    let gateModel: OperationalGateModel;
    if (contextError !== null && contextError !== undefined) {
      gateModel = { kind: "CONTEXT_ERROR", message: contextError.message };
    } else if (operationalResponse === null) {
      gateModel = { kind: "LOADING" };
    } else if (resolution.kind === "AMBIGUOUS_ACTIVE_SHIFTS") {
      gateModel = { kind: "AMBIGUOUS_ACTIVE_SHIFTS", count: resolution.count };
    } else {
      gateModel = { kind: "NO_ACTIVE_SHIFT" };
    }

    return (
      <div className="min-h-screen bg-navy-2 flex items-center justify-center">
        <div className="w-full max-w-[390px] h-screen md:h-[844px] bg-navy overflow-hidden md:rounded-[44px] md:shadow-2xl flex flex-col">
          <EmployeeOperationalGate
            model={gateModel}
            onRetry={() => void refreshContext()}
            onSignOut={() => void handleSignOut()}
          />
        </div>
      </div>
    );
  }

  const effectiveScreen: Screen =
    targets.screenOverride !== null &&
    livePermittedScreens.has(targets.screenOverride as Screen)
      ? (targets.screenOverride as Screen)
      : "task-queue";

  return (
    <div className="min-h-screen bg-navy-3 flex items-start justify-center md:items-center">
      <div className="relative w-full max-w-[390px] h-screen md:h-[844px] bg-warm flex flex-col overflow-hidden md:rounded-[44px] md:shadow-2xl">
        <AppHeader
          locationCode={liveScope.locationCode}
          locationName={liveScope.locationName}
          mode="live"
          role={liveScope.role}
        />

        <main className="flex-1 overflow-y-auto">
          <EmployeeLiveRouter
            activeScope={liveScope}
            effectiveScreen={effectiveScreen}
            incidentTarget={targets.activeIncidentTarget}
            nav={nav}
            onAuthorizationLoss={revalidateOnAuthLoss}
            onOpenIncident={handleOpenIncident}
            onParkingComplete={handleParkingComplete}
            onRetrievalComplete={handleRetrievalComplete}
            onSelectParkingTask={handleSelectParkingTaskFromQueue}
            onSelectRetrievalTask={handleSelectRetrievalTaskFromQueue}
            onStartParkingSuccess={handleStartParkingSuccess}
            parkingPayload={targets.activeParkingPayload}
            parkingTarget={targets.activeParkingTarget}
            retrievalTarget={targets.activeRetrievalTarget}
          />
        </main>

        <BottomNav
          active={getActiveTab(effectiveScreen)}
          onTab={(t) => {
            if (t === "home") nav("task-queue");
          }}
        />
      </div>
    </div>
  );
}
