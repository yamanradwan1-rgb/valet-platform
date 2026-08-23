import { describe, expect, it } from "vitest";

import { EmployeeApiError } from "../../lib/api/employee-api-errors";
import {
  TOKEN_A,
  TOKEN_B,
  active,
  issueBody,
  makeHarness,
  notIssued,
  sessionId,
} from "./guest-access-controller-test-support";

describe("GuestAccessController state", () => {
  it("loads NOT_ISSUED authoritatively without any shareable URL", async () => {
    const h = makeHarness([notIssued()]);

    await h.controller.load(sessionId);

    expect(h.controller.getState().status).toBe("NOT_ISSUED");
    expect(h.controller.getState().shareableUrl).toBeNull();
    expect(h.controller.getState().phase).toBe("ready");
  });

  it("shows ACTIVE without a link when loaded without a fresh token", async () => {
    const h = makeHarness([active()]);

    await h.controller.load(sessionId);

    expect(h.controller.getState().status).toBe("ACTIVE");
    expect(h.controller.getState().shareableUrl).toBeNull();
  });

  it("creates a fresh canonical shareable URL from the issue response", async () => {
    const h = makeHarness([notIssued(), issueBody(TOKEN_A)]);

    await h.controller.load(sessionId);
    await h.controller.create(sessionId);

    expect(h.requestPaths[1]).toBe(
      `/v1/staff/check-in/sessions/${sessionId}/guest-access/issue`,
    );
    expect(h.requestBodies[1]).toEqual({ intent: "ISSUE_OR_ROTATE" });
    expect(h.controller.getState().status).toBe("ACTIVE");
    expect(h.controller.getState().shareableUrl).toBe(
      `https://customer.example.com/#guestToken=${TOKEN_A}`,
    );
  });

  it("blocks synchronous duplicate submissions while one is in flight", async () => {
    let releaseIssue!: (value: unknown) => void;
    const pendingIssue = new Promise((resolve) => {
      releaseIssue = resolve;
    });
    const h = makeHarness([notIssued(), pendingIssue]);

    await h.controller.load(sessionId);
    const first = h.controller.create(sessionId);
    await h.controller.create(sessionId);

    expect(h.requestPaths).toHaveLength(2); // load + exactly one create
    releaseIssue(issueBody(TOKEN_A));
    await first;
  });

  it("replaces a previously generated URL atomically on reissue", async () => {
    const h = makeHarness([
      notIssued(),
      issueBody(TOKEN_A),
      issueBody(TOKEN_B),
    ]);

    await h.controller.load(sessionId);
    await h.controller.create(sessionId);
    await h.controller.create(sessionId);

    expect(h.controller.getState().shareableUrl).toBe(
      `https://customer.example.com/#guestToken=${TOKEN_B}`,
    );
  });

  it("discards a held link before rehydrating after an ambiguous rotation", async () => {
    const networkFailure = new EmployeeApiError({
      code: "NETWORK_ERROR",
      isNetworkError: true,
      message: "Network connection unavailable.",
      status: 0,
    });
    const h = makeHarness([
      notIssued(),
      issueBody(TOKEN_A),
      networkFailure,
      active(),
    ]);

    await h.controller.load(sessionId);
    await h.controller.create(sessionId);
    expect(h.controller.getState().shareableUrl).toBe(
      `https://customer.example.com/#guestToken=${TOKEN_A}`,
    );

    // Ambiguous rotation: the held TOKEN_A link must not survive rehydrate.
    await h.controller.create(sessionId);

    expect(h.controller.getState().status).toBe("ACTIVE");
    expect(h.controller.getState().shareableUrl).toBeNull();
    expect(h.controller.getState().mutationError).not.toBeNull();
  });
});
