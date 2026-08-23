import { describe, expect, it } from "vitest";

import { EmployeeApiError } from "../../lib/api/employee-api-errors";
import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import { GuestAccessController } from "./guest-access-controller";
import type { GuestAccessView } from "./guest-access-types";
import {
  TOKEN_A,
  active,
  expired,
  issueBody,
  makeHarness,
  notIssued,
  revoked,
  sessionId,
} from "./guest-access-controller-test-support";

describe("GuestAccessController recovery and boundaries", () => {
  it("reissues REVOKED access with the exact authoritative expectedRevokedAt", async () => {
    const exactRevokedAt = "2026-08-21T19:30:00.456Z";
    const h = makeHarness([revoked(exactRevokedAt), issueBody(TOKEN_A)]);

    await h.controller.load(sessionId);
    await h.controller.create(sessionId);

    expect(h.requestBodies[1]).toEqual({
      expectedRevokedAt: exactRevokedAt,
      intent: "REISSUE_REVOKED",
    });
    expect(h.controller.getState().status).toBe("ACTIVE");
    expect(h.controller.getState().revokedAt).toBeNull();
  });

  it("rehydrates authoritative state after an intent conflict", async () => {
    const conflict = new EmployeeApiError({
      code: "GUEST_ACCESS_INTENT_CONFLICT",
      message: "conflict",
      status: 409,
    });
    const h = makeHarness([notIssued(), conflict, expired()]);

    await h.controller.load(sessionId);
    await h.controller.create(sessionId);

    expect(h.controller.getState().status).toBe("EXPIRED");
    expect(h.controller.getState().isMutating).toBe(false);
    expect(h.controller.getState().mutationError).not.toBeNull();
    expect(h.controller.getState().shareableUrl).toBeNull();
  });

  it("rehydrates after a lost issue response instead of replaying the POST", async () => {
    const networkFailure = new EmployeeApiError({
      code: "NETWORK_ERROR",
      isNetworkError: true,
      message: "Network connection unavailable.",
      status: 0,
    });
    const h = makeHarness([active(), networkFailure, active()]);

    await h.controller.load(sessionId);
    await h.controller.create(sessionId);

    // load + original create + authorized rehydrate; no automatic POST replay.
    expect(h.requestPaths).toHaveLength(3);
    expect(h.controller.getState().status).toBe("ACTIVE");
    expect(h.controller.getState().shareableUrl).toBeNull();
    expect(h.controller.getState().mutationError).not.toBeNull();
  });

  it("refuses mutations while offline without queue or sync wording", async () => {
    const h = makeHarness([], { isOnline: () => false });
    (
      h.controller as unknown as {
        patch: (partial: Partial<GuestAccessView>) => void;
      }
    ).patch({ phase: "ready", status: "NOT_ISSUED" });

    await h.controller.create(sessionId);
    await h.controller.revoke(sessionId);

    expect(h.requestPaths).toHaveLength(0);
    const message = (h.controller.getState().mutationError ?? "").toLowerCase();
    expect(message).toContain("offline");
    expect(message).not.toContain("queued");
    expect(message).not.toContain("sync");
  });

  it("blocks mutations when the customer origin configuration fails closed", async () => {
    const h = makeHarness([notIssued()], {
      getOrigin: () => ({ ok: false as const, reason: "MISSING" }),
    });

    await h.controller.load(sessionId);
    await h.controller.create(sessionId);

    expect(h.requestPaths).toHaveLength(1); // only the authoritative load
    expect(h.controller.getState().mutationError).toMatch(/configuration/i);
  });

  it("discards the credential before any REVOKED state becomes visible", async () => {
    const views: GuestAccessView[] = [];
    const revokedResult = {
      revokedAt: "2026-08-21T20:00:00.123Z",
      valetSessionId: sessionId,
    };
    const client = {
      request: () => Promise.resolve(revokedResult),
    } as unknown as EmployeeApiClient;
    const controller = new GuestAccessController((view) => views.push(view), {
      getOrigin: () => ({ ok: true as const, origin: "https://customer.example.com" }),
      isOnline: () => true,
    });
    controller.setApiClient(client);
    // Drive state to fresh ACTIVE without server round trips.
    (
      controller as unknown as {
        patch: (partial: Partial<GuestAccessView>) => void;
      }
    ).patch({
      expiresAt: "2026-08-22T18:05:00.000Z",
      phase: "ready",
      shareableUrl: `https://customer.example.com/#guestToken=${TOKEN_A}`,
      status: "ACTIVE",
    });
    void client;

    await controller.revoke(sessionId);

    expect(controller.getState().status).toBe("REVOKED");
    expect(controller.getState().shareableUrl).toBeNull();
    expect(controller.getState().revokedAt).toBe("2026-08-21T20:00:00.123Z");
    for (const view of views) {
      if (view.status === "REVOKED") {
        expect(view.shareableUrl).toBeNull();
      }
    }
  });
});
