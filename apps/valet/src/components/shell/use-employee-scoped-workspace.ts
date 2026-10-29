"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";

import type { OperationalScopeResolution } from "../../features/staff-operational-context";
import { EmployeeApiError } from "../../lib/api/employee-api-errors";
import {
  initialScopedWorkspace,
  emptyWorkspaceTargets,
  makeOperationalScopeStamp,
  makeWorkspaceStamp,
  type EmployeeWorkspaceTargets,
  type WorkspaceAuthority,
  type WorkspaceIdentityInput,
} from "./employee-workspace";

interface ScopedWorkspaceOptions {
  readonly identity: WorkspaceIdentityInput;
  readonly isPrototypeMode: boolean;
  readonly resolution: OperationalScopeResolution;
  readonly hasContextResponse: boolean;
  readonly contextError: Error | null;
}

function authoritativeWorkspaceScope({
  identity,
  resolution,
  hasContextResponse,
  contextError,
}: ScopedWorkspaceOptions): WorkspaceAuthority {
  if (!identity.authenticated) return { kind: "PENDING" };
  if (resolution.kind === "RESOLVED") {
    return { kind: "RESOLVED", scope: resolution.scope };
  }
  // A missing response during token rotation/revalidation is not a
  // server-authoritative NO_ACTIVE_SHIFT. Keep the prior scope until proven.
  if (hasContextResponse && resolution.kind === "NO_ACTIVE_SHIFT") {
    return { kind: "RETIRED" };
  }
  if (
    contextError instanceof EmployeeApiError &&
    (contextError.status === 401 ||
      contextError.status === 403 ||
      contextError.status === 404)
  ) {
    return { kind: "RETIRED" };
  }
  return { kind: "PENDING" };
}

/** Retain targets across transient reconnect; discard incompatible authority. */
export function useEmployeeScopedWorkspace(options: ScopedWorkspaceOptions): {
  readonly targets: EmployeeWorkspaceTargets;
  readonly patchTargets: (patch: Partial<EmployeeWorkspaceTargets>) => void;
} {
  const [snapshot, setWorkspace] = useState(() => ({
    workspace: initialScopedWorkspace(),
    sourceToken: null as { identityStamp: string; authorityKey: string } | null,
  }));
  const { workspace } = snapshot;
  const identityStamp = makeWorkspaceStamp(options.identity);
  const authority = authoritativeWorkspaceScope(options);
  const operationalStamp = makeOperationalScopeStamp(authority);
  // An in-flight command may be the FIRST event that would create targets.
  // Remember verified authority independently from stored targets, so an
  // A -> PENDING -> A token refresh does not invalidate that A callback.
  const [lastAuthority, setLastAuthority] = useState({
    identityStamp,
    authorityKey: "pending",
  });
  const observedKey =
    operationalStamp === undefined
      ? undefined
      : operationalStamp === null
        ? "retired"
        : operationalStamp;
  const authorityKey =
    observedKey ??
    (lastAuthority.identityStamp === identityStamp
      ? lastAuthority.authorityKey
      : "pending");
  if (
    lastAuthority.identityStamp !== identityStamp ||
    (observedKey !== undefined && observedKey !== lastAuthority.authorityKey)
  ) {
    // React's guarded same-component state adjustment commits authority
    // before children can receive callbacks for the new resolved scope.
    setLastAuthority({ identityStamp, authorityKey });
  }

  // Each committed authority transition receives a distinct callback token.
  // Even if A later regains the exact same scope, an old A promise completion
  // cannot navigate or repopulate targets after A -> revoked -> A.
  const sourceToken = useMemo(
    () => ({ identityStamp, authorityKey }),
    [identityStamp, authorityKey],
  );
  const currentSourceToken = useRef(sourceToken);
  useLayoutEffect(() => {
    currentSourceToken.current = sourceToken;
  }, [sourceToken]);

  // The saved targets belong to a particular committed authority token.
  // A -> revoked -> A creates a *new* token even when all scope IDs match:
  // former targets cannot revive, without synchronizing state from an effect.
  const targets =
    snapshot.sourceToken === sourceToken
      ? workspace.targets
      : emptyWorkspaceTargets();

  const patchTargets = (patch: Partial<EmployeeWorkspaceTargets>): void => {
    if (!options.isPrototypeMode && operationalStamp == null) return;
    if (currentSourceToken.current !== sourceToken) return;
    setWorkspace((current) => {
      // Fence both the event and its queued state update: an async response
      // from the previous shell must not stamp A data with B's authority.
      if (currentSourceToken.current !== sourceToken) return current;
      const currentScoped =
        current.sourceToken === sourceToken
          ? current.workspace
          : {
              identityStamp,
              operationalStamp,
              targets: emptyWorkspaceTargets(),
            };
      return {
        sourceToken,
        workspace: {
          ...currentScoped,
          targets: { ...currentScoped.targets, ...patch },
        },
      };
    });
  };

  return { targets, patchTargets };
}
