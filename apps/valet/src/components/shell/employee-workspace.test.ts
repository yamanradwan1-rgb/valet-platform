import { describe, expect, it } from "vitest";

import {
  emptyWorkspaceTargets,
  isWorkspaceCurrent,
  makeWorkspaceStamp,
  rescopeWorkspace,
} from "./employee-workspace";

const employeeA = { authenticated: true, sessionGeneration: 1 };
const employeeB = { authenticated: true, sessionGeneration: 2 };
const anonymous = { authenticated: false, sessionGeneration: 1 };

const populatedTargets = () => ({
  ...emptyWorkspaceTargets(),
  screenOverride: "retrieval",
});

describe("employee workspace identity scoping", () => {
  it("stamps anonymous identities identically regardless of generation", () => {
    expect(makeWorkspaceStamp(anonymous)).toBe("anonymous");
    expect(makeWorkspaceStamp({ authenticated: false, sessionGeneration: 9 })).toBe(
      "anonymous",
    );
    expect(makeWorkspaceStamp(employeeA)).toBe("gen:1");
    expect(makeWorkspaceStamp(employeeB)).toBe("gen:2");
  });

  it("keeps the same object when identity is unchanged", () => {
    const workspace = {
      identityStamp: makeWorkspaceStamp(employeeA),
      targets: populatedTargets(),
    };
    expect(rescopeWorkspace(workspace, employeeA)).toBe(workspace);
    expect(isWorkspaceCurrent(workspace, employeeA)).toBe(true);
  });

  it("discards every transient target when the authenticated identity changes", () => {
    const workspaceA = {
      identityStamp: makeWorkspaceStamp(employeeA),
      targets: {
        ...populatedTargets(),
        activeParkingTarget: { sessionId: "s", taskId: "t", taskVersion: 3 },
        activeRetrievalTarget: {
          currentAssigneeMembershipId: "m1",
          sessionId: "s",
          taskId: "t",
          taskStatus: "ACCEPTED" as const,
          taskVersion: 4,
        },
      },
    };

    // Employee B logs in on the same app instance.
    const workspaceB = rescopeWorkspace(workspaceA, employeeB);
    expect(isWorkspaceCurrent(workspaceA, employeeB)).toBe(false);
    expect(workspaceB.targets).toEqual(emptyWorkspaceTargets());
    expect(workspaceB.targets.activeRetrievalTarget).toBeNull();
    expect(workspaceB.targets.screenOverride).toBeNull();
  });

  it("discards targets immediately on logout and keeps them cleared after a new login", () => {
    const workspaceA = {
      identityStamp: makeWorkspaceStamp(employeeA),
      targets: { ...populatedTargets(), activeRetrievalTarget: null },
    };

    // Logout flips to anonymous without waiting for any effect.
    const loggedOut = rescopeWorkspace(workspaceA, anonymous);
    expect(loggedOut.targets).toEqual(emptyWorkspaceTargets());

    // Employee B signs in and still finds no inherited workflow.
    const employeeBWorkspace = rescopeWorkspace(loggedOut, employeeB);
    expect(isWorkspaceCurrent(employeeBWorkspace, employeeB)).toBe(true);
    expect(employeeBWorkspace.targets).toEqual(emptyWorkspaceTargets());
  });
});
