import type { StartParkingPayload } from "../../features/check-in";

export interface ActiveParkingTarget {
  readonly sessionId: string;
  readonly taskId: string;
  readonly taskVersion: number;
}

export interface ActiveIncidentTarget {
  readonly returnScreen: import("../../types/employee-ui").Screen;
  readonly sessionId: string;
}

export interface ActiveRetrievalTarget {
  readonly currentAssigneeMembershipId?: string | null | undefined;
  readonly sessionId: string;
  readonly taskId: string;
  readonly taskStatus: "ACCEPTED" | "IN_PROGRESS";
  readonly taskVersion: number;
}

/**
 * Narrow Guest Access navigation target. It carries only safe operational
 * reference data — never credential material such as a raw guest token or a
 * generated shareable URL; those live only inside the mounted flow.
 */
export interface GuestAccessTarget {
  readonly returnScreen: import("../../types/employee-ui").Screen;
  readonly sessionId: string;
}

/**
 * Identity-bound transient workflow targets. Every stored value is stamped
 * with the authenticated identity epoch it was created under; readers treat
 * any value whose stamp does not match the current epoch as absent, so
 * Employee B can never inherit Employee A's in-memory operational workflow.
 *
 * The stamp MUST use the stable identityGeneration (session-presence
 * transitions), NOT sessionGeneration: a same-user access-token refresh bumps
 * sessionGeneration but must keep in-flight workflows intact.
 */
export interface EmployeeWorkspaceTargets {
  readonly activeIncidentTarget: ActiveIncidentTarget | null;

  readonly activeParkingPayload: StartParkingPayload | null;
  readonly activeParkingTarget: ActiveParkingTarget | null;
  readonly activeRetrievalTarget: ActiveRetrievalTarget | null;
  readonly guestAccessTarget: GuestAccessTarget | null;
  readonly screenOverride: string | null;
}

export interface ScopedEmployeeWorkspace {
  readonly identityStamp: string;
  /** Scope of the operational targets, absent in legacy identity-only workspaces. */
  readonly operationalStamp?: string | null | undefined;
  readonly targets: EmployeeWorkspaceTargets;
}

export interface WorkspaceIdentityInput {
  /** Stable epoch from StaffAuthContext (identity-presence transitions). */
  readonly identityGeneration: number;
  readonly authenticated: boolean;
}

export interface WorkspaceOperationalScope {
  readonly organizationId: string;
  readonly membershipId: string;
  readonly locationId: string;
  readonly shiftId: string;
  readonly role: string;
}

export type WorkspaceAuthority =
  | { readonly kind: "RESOLVED"; readonly scope: WorkspaceOperationalScope }
  | { readonly kind: "RETIRED" }
  | { readonly kind: "PENDING" };

/** Pending context is unknown, not evidence that the previous scope ended. */
export function makeOperationalScopeStamp(
  authority: WorkspaceAuthority,
): string | null | undefined {
  if (authority.kind === "PENDING") return undefined;
  if (authority.kind === "RETIRED") return null;
  const { organizationId, membershipId, locationId, shiftId, role } =
    authority.scope;
  return [
    "scope",
    organizationId,
    membershipId,
    locationId,
    shiftId,
    role,
  ].join(":");
}

export function makeWorkspaceStamp(identity: WorkspaceIdentityInput): string {
  return identity.authenticated
    ? `identity:${String(identity.identityGeneration)}`
    : "anonymous";
}

export function emptyWorkspaceTargets(): EmployeeWorkspaceTargets {
  return {
    activeIncidentTarget: null,
    activeParkingPayload: null,
    activeParkingTarget: null,
    activeRetrievalTarget: null,
    guestAccessTarget: null,
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
  authority?: WorkspaceAuthority,
): ScopedEmployeeWorkspace {
  return rescopeWorkspaceStamps(
    workspace,
    makeWorkspaceStamp(identity),
    authority ? makeOperationalScopeStamp(authority) : undefined,
  );
}

/** Synchronous read fence, also used by React to commit authoritative changes. */
export function rescopeWorkspaceStamps(
  workspace: ScopedEmployeeWorkspace,
  identityStamp: string,
  operationalStamp: string | null | undefined,
): ScopedEmployeeWorkspace {
  if (workspace.identityStamp !== identityStamp) {
    return {
      identityStamp,
      operationalStamp,
      targets: emptyWorkspaceTargets(),
    };
  }
  if (
    operationalStamp === undefined ||
    workspace.operationalStamp === operationalStamp
  ) {
    return workspace;
  }
  return { identityStamp, operationalStamp, targets: emptyWorkspaceTargets() };
}

export function isWorkspaceCurrent(
  workspace: ScopedEmployeeWorkspace,
  identity: WorkspaceIdentityInput,
  authority?: WorkspaceAuthority,
): boolean {
  return isWorkspaceCurrentStamps(
    workspace,
    makeWorkspaceStamp(identity),
    authority ? makeOperationalScopeStamp(authority) : undefined,
  );
}

export function isWorkspaceCurrentStamps(
  workspace: ScopedEmployeeWorkspace,
  identityStamp: string,
  operationalStamp: string | null | undefined,
): boolean {
  return (
    workspace.identityStamp === identityStamp &&
    (operationalStamp === undefined ||
      workspace.operationalStamp === operationalStamp)
  );
}
