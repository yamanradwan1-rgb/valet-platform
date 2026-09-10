import { EmployeeApiError, employeeNetworkError } from "@valet/employee-client";
import { describe, expect, it, vi } from "vitest";
import { NativeIdentityStateBoundary } from "../src/auth/identity-state-boundary";
import { NativeGuestAccessSession } from "../src/guest-access/native-guest-access-session";
import {
  deferred,
  detail,
  issuePayload,
  queueSession,
  sessionId,
  target,
  tokenA,
  validOrigin,
} from "./native-guest-access-runtime-test-support";

describe("Native Guest Access recovery and lifecycle", () => {
  it("recovers an issue intent conflict with one GET and no POST replay", async () => {
    const conflict = new EmployeeApiError({
      code: "GUEST_ACCESS_INTENT_CONFLICT",
      message: "safe conflict",
      status: 409,
    });
    const h = queueSession([detail("REVOKED"), conflict, detail("EXPIRED")]);
    await h.session.open(target);
    await h.session.issue();
    expect(h.requests.map(({ method }) => method)).toEqual([
      "GET",
      "POST",
      "GET",
    ]);
    expect(h.session.current()).toMatchObject({
      credentialFresh: false,
      error: "INTENT_CONFLICT",
      status: "EXPIRED",
    });
  });

  it("recovers a lost issue response without replay or token recovery", async () => {
    const h = queueSession([
      detail("NOT_ISSUED"),
      employeeNetworkError(),
      detail("ACTIVE"),
    ]);
    await h.session.open(target);
    await h.session.issue();
    expect(h.requests.map(({ method }) => method)).toEqual([
      "GET",
      "POST",
      "GET",
    ]);
    expect(h.session.current()).toMatchObject({
      credentialFresh: false,
      error: "OUTCOME_UNKNOWN",
      status: "ACTIVE",
    });
    expect(h.session.freshCredentialUrl()).toBeNull();
  });

  it("purges the credential before publishing REVOKED", async () => {
    const h = queueSession([
      detail("NOT_ISSUED"),
      issuePayload(tokenA),
      {
        revokedAt: "2026-09-10T10:30:00.000Z",
        valetSessionId: sessionId,
      },
    ]);
    const revokedCredentials: Array<string | null> = [];
    h.session.subscribe((snapshot) => {
      if (snapshot.status === "REVOKED") {
        revokedCredentials.push(h.session.freshCredentialUrl());
      }
    });
    await h.session.open(target);
    await h.session.issue();
    expect(h.session.freshCredentialUrl()).toContain(tokenA);
    expect(await h.session.revoke()).toBe(true);
    expect(revokedCredentials).toEqual([null]);
    expect(h.session.current()).toMatchObject({
      credentialFresh: false,
      status: "REVOKED",
    });
  });

  it("rehydrates an ambiguous revoke and never replays it", async () => {
    const h = queueSession([
      detail("ACTIVE"),
      employeeNetworkError(),
      detail("REVOKED"),
    ]);
    await h.session.open(target);
    await h.session.revoke();
    expect(h.requests.map(({ method }) => method)).toEqual([
      "GET",
      "POST",
      "GET",
    ]);
    expect(h.session.current()).toMatchObject({
      credentialFresh: false,
      error: "OUTCOME_UNKNOWN",
      status: "REVOKED",
    });
  });

  it("synchronously blocks rapid duplicate Revoke taps", async () => {
    const pending = deferred<unknown>();
    const request = vi
      .fn()
      .mockResolvedValueOnce(detail("ACTIVE"))
      .mockReturnValueOnce(pending.promise);
    const session = new NativeGuestAccessSession(() => ({ request }) as never, {
      customerOrigin: validOrigin,
      isOnline: () => true,
    });
    await session.open(target);
    const first = session.revoke();
    expect(await session.revoke()).toBe(false);
    pending.resolve({
      revokedAt: "2026-09-10T11:00:00.000Z",
      valetSessionId: sessionId,
    });
    expect(await first).toBe(true);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("blocks every mutation offline without transport or replay intent", async () => {
    let online = true;
    const h = queueSession([detail("NOT_ISSUED"), detail("ACTIVE")], {
      isOnline: () => online,
    });
    await h.session.open(target);
    online = false;
    expect(await h.session.issue()).toBe(false);
    expect(h.session.current().error).toBe("OFFLINE");
    expect(h.requests).toHaveLength(1);

    online = true;
    await h.session.open(target);
    online = false;
    expect(await h.session.issue()).toBe(false);
    expect(await h.session.revoke()).toBe(false);
    expect(h.requests).toHaveLength(2);
  });

  it("purges held credentials on the logout/identity purge boundary", async () => {
    const identity = new NativeIdentityStateBoundary();
    const h = queueSession([detail("NOT_ISSUED"), issuePayload(tokenA)]);
    identity.register(() => h.session.clear());
    await h.session.open(target);
    await h.session.issue();
    expect(h.session.freshCredentialUrl()).toContain(tokenA);

    await identity.purge();

    expect(h.session.current().phase).toBe("inactive");
    expect(h.session.freshCredentialUrl()).toBeNull();
  });

  it("clear purges credential and fences a stale issue response", async () => {
    const pending = deferred<unknown>();
    const request = vi
      .fn()
      .mockResolvedValueOnce(detail("NOT_ISSUED"))
      .mockReturnValueOnce(pending.promise);
    const session = new NativeGuestAccessSession(() => ({ request }) as never, {
      customerOrigin: validOrigin,
      isOnline: () => true,
    });
    await session.open(target);
    const issue = session.issue();
    session.clear();
    pending.resolve(issuePayload(tokenA));
    expect(await issue).toBe(false);
    expect(session.current()).toMatchObject({
      credentialFresh: false,
      phase: "inactive",
      target: null,
    });
    expect(session.freshCredentialUrl()).toBeNull();
  });
});
