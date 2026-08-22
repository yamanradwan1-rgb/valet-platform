import { describe, expect, it } from "vitest";

import {
  emptyWorkspaceTargets,
  isWorkspaceCurrent,
  makeWorkspaceStamp,
  rescopeWorkspace,
} from "./employee-workspace";

// Identity epochs come from StaffAuthContext.identityGeneration:
// presence transitions only. sessionGeneration (token refreshes) is NOT
// part of workspace identity.
const employeeA = { authenticated: true, identityGeneration: 1 };
const employeeB = { authenticated: true, identityGeneration: 2 };
const anonymous = { authenticated: false, identityGeneration: 1 };

const retrievalTargets = () => ({
  ...emptyWorkspaceTargets(),
  screenOverride: "retrieval",
  activeRetrievalTarget: {
    currentAssigneeMembershipId: "membership-a",
    sessionId: "session-1",
    taskId: "task-1",
    taskStatus: "ACCEPTED" as const,
    taskVersion: 4,
  },
});

describe("employee workspace identity scoping", () => {
  it("stamps anonymous identities identically regardless of epoch number", () => {
    expect(makeWorkspaceStamp(anonymous)).toBe("anonymous");
    expect(
      makeWorkspaceStamp({ authenticated: false, identityGeneration: 9 }),
    ).toBe("anonymous");
    expect(makeWorkspaceStamp(employeeA)).toBe("identity:1");
    expect(makeWorkspaceStamp(employeeB)).toBe("identity:2");
  });

  it("SCENARIO A: same-user token refresh (new sessionGeneration, SAME identityGeneration) keeps targets intact", () => {
    const beforeRefresh = {
      identityStamp: makeWorkspaceStamp(employeeA),
      targets: retrievalTargets(),
    };
    // A normal access-token refresh bumps sessionGeneration but NOT
    // identityGeneration; the workspace input below is what EmployeeApp
    // derives after such a refresh.
    const afterSameUserRefresh = { authenticated: true, identityGeneration: 1 };

    expect(rescopeWorkspace(beforeRefresh, afterSameUserRefresh)).toBe(
      beforeRefresh,
    );
    expect(isWorkspaceCurrent(beforeRefresh, afterSameUserRefresh)).toBe(true);
    expect(
      rescopeWorkspace(beforeRefresh, afterSameUserRefresh).targets
        .activeRetrievalTarget?.sessionId,
    ).toBe("session-1");
  });

  it("SCENARIO B: logout makes every target synchronously unavailable", () => {
    const authenticated = {
      identityStamp: makeWorkspaceStamp(employeeA),
      targets: retrievalTargets(),
    };
    const loggedOut = rescopeWorkspace(authenticated, anonymous);

    expect(isWorkspaceCurrent(authenticated, anonymous)).toBe(false);
    expect(loggedOut.targets).toEqual(emptyWorkspaceTargets());
  });

  it("SCENARIO C: Employee A logout then Employee B login cannot inherit A's targets", () => {
    const workspaceA = {
      identityStamp: makeWorkspaceStamp(employeeA),
      targets: {
        ...retrievalTargets(),
        activeParkingTarget: { sessionId: "s", taskId: "t", taskVersion: 3 },
        activeParkingPayload: null,
      },
    };

    const loggedOut = rescopeWorkspace(workspaceA, anonymous);
    const workspaceB = rescopeWorkspace(loggedOut, employeeB);

    expect(workspaceB.targets).toEqual(emptyWorkspaceTargets());
    expect(workspaceB.targets.activeRetrievalTarget).toBeNull();
    expect(workspaceB.targets.activeParkingTarget).toBeNull();
    expect(isWorkspaceCurrent(workspaceA, employeeB)).toBe(false);
  });

  it("SCENARIO D: definitive refresh invalidation revokes old workspace access", () => {
    // Definitive invalidation clears the session -> presence flips to
    // anonymous even though no explicit logout occurred.
    const authenticated = {
      identityStamp: makeWorkspaceStamp(employeeA),
      targets: retrievalTargets(),
    };
    const invalidated = rescopeWorkspace(authenticated, anonymous);

    expect(invalidated.targets).toEqual(emptyWorkspaceTargets());
    // And a subsequent re-login creates a NEW epoch with no inherited state.
    const reAuthenticated = rescopeWorkspace(
      invalidated,
      employeeB,
    );
    expect(reAuthenticated.targets).toEqual(emptyWorkspaceTargets());
  });

  it("SCENARIO E: bootstrap establishes a new authenticated identity epoch from anonymous", () => {
    const bootstrappedEpoch = { authenticated: true, identityGeneration: 1 };
    const bootstrapWorkspace = {
      identityStamp: makeWorkspaceStamp(anonymous),
      targets: emptyWorkspaceTargets(),
    };

    expect(makeWorkspaceStamp(anonymous)).not.toBe(
      makeWorkspaceStamp(bootstrappedEpoch),
    );
    const scoped = rescopeWorkspace(bootstrapWorkspace, bootstrappedEpoch);
    expect(scoped.identityStamp).toBe(makeWorkspaceStamp(bootstrappedEpoch));
    expect(isWorkspaceCurrent(scoped, bootstrappedEpoch)).toBe(true);
  });
});
