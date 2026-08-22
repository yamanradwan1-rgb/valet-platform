import type { StartParkingPayload } from "../../features/check-in";

export interface ActiveParkingTarget {
  readonly sessionId: string;
  readonly taskId: string;
  readonly taskVersion: number;
}

export interface ActiveRetrievalTarget {
  readonly currentAssigneeMembershipId?: string | null | undefined;
  readonly sessionId: string;
  readonly taskId: string;
  readonly taskStatus: "ACCEPTED" | "IN_PROGRESS";
  readonly taskVersion: number;
}

/**
 * Identity-bound transient workflow targets. Every stored value is stamped
 * with the auth identity it was created under; readers treat any value whose
 * stamp does not match the current identity as absent, so Employee B can
 * never inherit Employee A's in-memory operational workflow.
 */
export interface EmployeeWorkspaceTargets {
  readonly activeParkingPayload: StartParkingPayload | null;
  readonly activeParkingTarget: ActiveParkingTarget | null;
  readonly activeRetrievalTarget: ActiveRetrievalTarget | null;
  readonly screenOverride: string | null;
}

export interface ScopedEmployeeWorkspace {
  readonly identityStamp: string;
  readonly targets: EmployeeWorkspaceTargets;
}

export interface WorkspaceIdentityInput {
  readonly authenticated: boolean;
  readonly sessionGeneration: number;
}

export function makeWorkspaceStamp(
  identity: WorkspaceIdentityInput,
): string {
  return identity.authenticated ? `gen:${String(identity.sessionGeneration)}` : "anonymous";
}

export function emptyWorkspaceTargets(): EmployeeWorkspaceTargets {
  return {
    activeParkingPayload: null,
    activeParkingTarget: null,
    activeRetrievalTarget: null,
    screenOverride: null,
  };
}

export function initialScopedWorkspace(): ScopedEmployeeWorkspace {
  return {
    identityStamp: "anonymous",
    targets: emptyWorkspaceTargets(),
  };
}

/**
 * Returns the workspace re-stamped for `identity`. When the identity changed,
 * all prior targets are discarded so they can never be reached again.
 */
export function rescopeWorkspace(
  workspace: ScopedEmployeeWorkspace,
  identity: WorkspaceIdentityInput,
): ScopedEmployeeWorkspace {
  const nextStamp = makeWorkspaceStamp(identity);
  if (workspace.identityStamp === nextStamp) return workspace;
  return { identityStamp: nextStamp, targets: emptyWorkspaceTargets() };
}

export function isWorkspaceCurrent(
  workspace: ScopedEmployeeWorkspace,
  identity: WorkspaceIdentityInput,
): boolean {
  return workspace.identityStamp === makeWorkspaceStamp(identity);
}
