import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { useTaskQueue, type UseTaskQueueResult } from "./use-task-queue";
import { StaffAuthClient } from "../../lib/auth/staff-auth-client";
import { StaffAuthProvider } from "../../lib/auth/staff-auth-context";

describe("Task Queue Scoping & Hard-Stop Invariants", () => {
  const createAuthClient = (authenticated = true) => {
    const client = new StaffAuthClient();
    if (authenticated) {
      vi.spyOn(client, "getSession").mockReturnValue({
        accessToken: "vsa1_test_token",
        tokenType: "Bearer",
        accessExpiresAt: new Date(Date.now() + 3600000).toISOString(),
        sessionExpiresAt: new Date(Date.now() + 86400000).toISOString(),
      });
    } else {
      vi.spyOn(client, "getSession").mockReturnValue(null);
    }
    vi.spyOn(client, "tryRefresh").mockResolvedValue(null);
    return client;
  };

  it("never exposes tasks when rendered unauthenticated", () => {
    const unauthClient = createAuthClient(false);
    let capturedResult: UseTaskQueueResult | null = null;

    function Harness() {
      capturedResult = useTaskQueue({
        locationId: "loc-A",
      });
      return <div>{capturedResult.tasks.length}</div>;
    }

    const html = renderToStaticMarkup(
      <StaffAuthProvider client={unauthClient}>
        <Harness />
      </StaffAuthProvider>,
    );

    expect(html).toContain("0");
    expect(capturedResult as UseTaskQueueResult | null).not.toBeNull();
    expect((capturedResult as unknown as UseTaskQueueResult).tasks).toEqual([]);
  });

  it("synchronously clears tasks when locationId is null", () => {
    const authClient = createAuthClient(true);
    let capturedResult: UseTaskQueueResult | null = null;

    function Harness() {
      capturedResult = useTaskQueue({
        locationId: null,
      });
      return <div>{capturedResult.tasks.length}</div>;
    }

    renderToStaticMarkup(
      <StaffAuthProvider client={authClient}>
        <Harness />
      </StaffAuthProvider>,
    );

    expect(capturedResult as UseTaskQueueResult | null).not.toBeNull();
    expect((capturedResult as unknown as UseTaskQueueResult).tasks).toEqual([]);
  });
});
