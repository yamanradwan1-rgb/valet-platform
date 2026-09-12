import { describe, expect, it, vi } from "vitest";
import { NativeIncidentSession } from "../src/incident/native-incident-session";
import {
  deferred,
  detail as guestDetail,
  issuePayload,
  queueSession,
  target,
} from "./native-guest-access-runtime-test-support";
import { detail as incidentDetail } from "./native-parity-11-test-fixture";

const incidentInput = {
  description: "Damage",
  severity: "HIGH" as const,
  type: "VEHICLE_DAMAGE" as const,
};

describe("Native contextual lifecycle fences", () => {
  it("fences a slow Guest Access GET and starts a fresh current read", async () => {
    const pending = deferred<unknown>();
    const { request, session } = queueSession([
      pending.promise,
      guestDetail("ACTIVE"),
    ]);
    const oldRead = session.open(target);
    session.suspendForBackground();
    pending.resolve(guestDetail("REVOKED"));
    await oldRead;
    expect(session.current().phase).toBe("loading");
    expect(session.freshCredentialUrl()).toBeNull();

    await session.revalidate();
    expect(session.current()).toMatchObject({
      phase: "ready",
      status: "ACTIVE",
    });
    expect(session.freshCredentialUrl()).toBeNull();
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls.every(([input]) => input.method === "GET")).toBe(
      true,
    );
  });

  it("fences a slow Incident GET and safely revalidates the current target", async () => {
    const pending = deferred<unknown>();
    const request = vi
      .fn()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(incidentDetail());
    const session = new NativeIncidentSession(() => ({ request }) as never);
    const oldRead = session.open(target);
    session.suspendForBackground();
    pending.resolve(incidentDetail());
    await oldRead;
    expect(session.current()).toMatchObject({ phase: "loading", report: null });

    await session.revalidate();
    expect(session.current()).toMatchObject({ phase: "form", report: null });
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls.every(([input]) => input.method === "GET")).toBe(
      true,
    );
  });

  it("purges Guest Access material and ignores a late issue response", async () => {
    const pending = deferred<unknown>();
    const { session } = queueSession([
      guestDetail("NOT_ISSUED"),
      pending.promise,
    ]);
    await session.open(target);
    const issue = session.issue();
    session.suspendForBackground();
    pending.resolve(
      issuePayload("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef012345678-_"),
    );
    await issue;
    expect(session.freshCredentialUrl()).toBeNull();
    expect(session.current()).toMatchObject({
      credentialFresh: false,
      error: "OUTCOME_UNKNOWN",
      mutation: null,
    });
  });

  it("fences a late incident response while preserving the stable retry id", async () => {
    const pending = deferred<unknown>();
    const request = vi
      .fn()
      .mockResolvedValueOnce(incidentDetail())
      .mockReturnValueOnce(pending.promise);
    const session = new NativeIncidentSession(
      () => ({ request }) as never,
      () => "11111111-1111-4111-8111-111111111111",
    );
    await session.open(target);
    const submit = session.submit(incidentInput);
    session.suspendForBackground();
    pending.resolve({
      createdAt: "2026-09-10T10:00:00.000Z",
      incidentId: "11111111-1111-4111-8111-111111111111",
      reportedByMembershipId: "33333333-3333-4333-8333-333333333333",
      sessionId: target.sessionId,
      severity: "HIGH",
      status: "OPEN",
      type: "VEHICLE_DAMAGE",
    });
    await submit;
    expect(session.current()).toMatchObject({ phase: "form", report: null });
    expect(request).toHaveBeenCalledTimes(2);
  });
});
