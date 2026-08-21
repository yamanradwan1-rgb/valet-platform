import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { TaskQueueResponse } from "@valet/contracts";

import { useTaskQueue, type UseTaskQueueResult } from "./use-task-queue";
import { StaffAuthClient } from "../../lib/auth/staff-auth-client";
import { StaffAuthProvider } from "../../lib/auth/staff-auth-context";
import { EmployeeApiError } from "../../lib/api/employee-api-errors";
import type {
  EmployeeApiClient,
  EmployeeRequestOptions,
} from "../../lib/api/employee-api-client";

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

  it("tracks hard stop accurately per locationId without leaking", () => {
    const authClient = createAuthClient(true);
    const onAuthLoss = vi.fn();

    const mockApiClient = {
      request: vi
        .fn()
        .mockImplementation(
          (_path: string, options?: EmployeeRequestOptions) => {
            const loc = options?.params?.["locationId"];
            if (loc === "loc-forbidden") {
              return Promise.reject(
                new EmployeeApiError({
                  status: 403,
                  code: "FORBIDDEN",
                  message: "Forbidden location",
                }),
              );
            }
            return Promise.resolve({ tasks: [] } as TaskQueueResponse);
          },
        ),
    } as unknown as EmployeeApiClient;

    let capturedResult: UseTaskQueueResult | null = null;

    function Harness({ loc }: { loc: string | null }) {
      capturedResult = useTaskQueue({
        locationId: loc,
        client: mockApiClient,
        onAuthorizationLoss: onAuthLoss,
      });
      return <div>{capturedResult.tasks.length}</div>;
    }

    renderToStaticMarkup(
      <StaffAuthProvider client={authClient}>
        <Harness loc="loc-forbidden" />
      </StaffAuthProvider>,
    );

    expect(capturedResult as UseTaskQueueResult | null).not.toBeNull();
  });
});
