"use client";

import { useEffect, useMemo, useState, type JSX } from "react";

import type { Screen } from "../types/employee-ui";
import {
  createEmployeeAccessActions,
} from "./shell/employee-access-actions";
import { buildEmployeeAccessGateProps } from "./shell/employee-access-view";
import {
  EmployeeAccessGate,
} from "./shell/employee-access-gate";
import { EmployeeLiveRouter } from "./shell/employee-live-router";
import {
  EmployeeOperationalScreen,
} from "./shell/employee-operational-screen";
import { EmployeePrototypeFrame } from "./shell/employee-prototype-frame";
import {
  initialScopedWorkspace,
  isWorkspaceCurrent,
  makeWorkspaceStamp,
  rescopeWorkspace,
  type EmployeeWorkspaceTargets,
  type WorkspaceIdentityInput,
} from "./shell/employee-workspace";
import {
  createEmployeeWorkspaceHandlers,
} from "./shell/employee-workspace-handlers";
import {
  livePermittedScreens,
} from "./shell/employee-navigation";
import { EmployeeActiveShell } from "./shell/employee-active-shell";
import {
  selectStartableLocations,
  useStaffOperationalContext,
} from "../features/staff-operational-context";
import {
  shouldReconcileUncertainStart,
  useEndShift,
  useStartShift,
} from "../features/shift";
import { useOptionalStaffAuth } from "../lib/auth/staff-auth-context";
import { useTaskQueue } from "../features/task-queue/use-task-queue";

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
  const liveScope = resolution.kind === "RESOLVED" ? resolution.scope : null;
  const taskQueue = useTaskQueue({
    locationId: liveScope?.locationId ?? null,
    onAuthorizationLoss: revalidateOnAuthLoss,
  });
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

  // VUI-011D: startable Locations come exclusively from the authoritative
  // operational-context eligibleLocations projection (server-derived,
  // membership-scoped per DEC-033), deduplicated across memberships by ID.
  const startableLocations = useMemo(
    () => selectStartableLocations(operationalResponse),
    [operationalResponse],
  );

  const patchTargets = (patch: Partial<EmployeeWorkspaceTargets>): void => {
    setWorkspace((current) => {
      const currentScope = rescopeWorkspace(current, identity);
      return {
        identityStamp: makeWorkspaceStamp(identity),
        targets: { ...currentScope.targets, ...patch },
      };
    });
  };

  const handlers = createEmployeeWorkspaceHandlers({
    isPrototypeMode,
    patchTargets,
  });

  const handleSignOut = async (): Promise<void> => {
    await auth?.logout();
  };

  // DEC-066 §4: the End Shift controller lives at app level so an ambiguous
  // outcome's transient same-command retry intent survives authoritative
  // context revalidation (including a NO_ACTIVE_SHIFT result) and identity
  // changes discard it with the rest of the workspace.
  const {
    endShift,
    phase: endShiftPhase,
    resetEndShift,
    retryUncertain: retryUncertainEndShift,
  } = useEndShift({
    // Same Staff auth-loss recovery semantics as every other live flow:
    // missing token and 401/403/404 End Shift responses route through the
    // authoritative revalidation boundary. Transport/network ambiguity is
    // handled separately as DEC-066 §4 uncertainty, never as auth loss.
    onAuthorizationLoss: () => {
      void revalidateOnAuthLoss();
    },
    onEnded: () => void refreshContext(),
  });
  useEffect(() => {
    resetEndShift();
  }, [resetEndShift, identity.authenticated, identity.identityGeneration]);

  // VUI-011D: Live Start Shift shares the app-level controller pattern so an
  // ambiguous outcome's same-command retry intent also survives revalidation.
  const {
    phase: startShiftPhase,
    resetStartShift,
    retryUncertain: retryUncertainStartShift,
    startShift,
  } = useStartShift({
    onAuthorizationLoss: () => {
      void revalidateOnAuthLoss();
    },
    onStarted: () => void refreshContext(),
  });
  useEffect(() => {
    resetStartShift();
  }, [resetStartShift, identity.authenticated, identity.identityGeneration]);

  // VUI-011D reconciliation: an authoritative context proving an ACTIVE
  // Shift at the SAME retained target Location resolves the ambiguous Start
  // outcome, so a later End Shift cannot resurface the stale retry panel.
  // Nothing else clears it: NO_ACTIVE_SHIFT, reconnects, refreshes and
  // unrelated-location contexts all leave the retained intent untouched.
  const shouldReconcileStaleStartIntent = shouldReconcileUncertainStart(
    startShiftPhase,
    resolution,
  );
  useEffect(() => {
    if (shouldReconcileStaleStartIntent) {
      resetStartShift();
    }
  }, [shouldReconcileStaleStartIntent, resetStartShift]);

  if (isPrototypeMode) {
    return (
      <EmployeePrototypeFrame
        isOffline={isPrototypeOffline}
        nav={handlers.nav}
        onToggleOffline={() => setIsPrototypeOffline((o) => !o)}
        screen={(targets.screenOverride as Screen | null) ?? "shift-start"}
      />
    );
  }

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
    return (
      <EmployeeOperationalScreen
        contextError={contextError}
        endShiftPhase={endShiftPhase}
        hasContextResponse={operationalResponse !== null}
        onDismissStartIntent={() => resetStartShift()}
        onRefreshContext={() => void refreshContext()}
        onRetryEndShift={retryUncertainEndShift}
        onRetryStartShift={retryUncertainStartShift}
        onSignOut={() => void handleSignOut()}
        onStartShift={startShift}
        resolution={resolution}
        startPhase={startShiftPhase}
        startableLocations={startableLocations}
      />
    );
  }

  const effectiveScreen: Screen =
    targets.screenOverride !== null &&
    livePermittedScreens.has(targets.screenOverride as Screen)
      ? (targets.screenOverride as Screen)
      : "task-queue";

  return (
    <EmployeeActiveShell
      effectiveScreen={effectiveScreen}
      key={`${identity.identityGeneration}:${liveScope.membershipId}:${liveScope.locationId}:${liveScope.shiftId}`}
      nav={handlers.nav}
      onReconnect={() => void refreshContext()}
      scope={liveScope}
      taskQueue={taskQueue}
    >
      <EmployeeLiveRouter
          activeScope={liveScope}
          effectiveScreen={effectiveScreen}
          endShift={endShift}
          endShiftPhase={endShiftPhase}
          guestAccessTarget={targets.guestAccessTarget}
          incidentTarget={targets.activeIncidentTarget}
          nav={handlers.nav}
          onAuthorizationLoss={revalidateOnAuthLoss}
          onGuestAccessClose={handlers.closeGuestAccess}
          onOpenGuestAccess={handlers.openGuestAccess}
          onOpenIncident={handlers.openIncident}
          onParkingComplete={handlers.completeParking}
          onRetrievalComplete={handlers.completeRetrieval}
          onSelectParkingTask={handlers.selectParkingTask}
          onSelectRetrievalTask={handlers.selectRetrievalTask}
          onStartParkingSuccess={handlers.startParkingSuccess}
          parkingPayload={targets.activeParkingPayload}
          parkingTarget={targets.activeParkingTarget}
          retrievalTarget={targets.activeRetrievalTarget}
          onRetryUncertainEndShift={retryUncertainEndShift}
          taskQueue={taskQueue}
      />
    </EmployeeActiveShell>
  );
}
