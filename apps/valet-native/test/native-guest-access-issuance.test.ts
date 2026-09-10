import { describe, expect, it, vi } from "vitest";
import { NativeGuestAccessSession } from "../src/guest-access/native-guest-access-session";
import {
  deferred,
  detail,
  issuePayload,
  queueSession,
  sessionId,
  target,
  tokenA,
  tokenB,
  validOrigin,
} from "./native-guest-access-runtime-test-support";

describe("Native Guest Access issuance", () => {
  it("issues NOT_ISSUED with ISSUE_OR_ROTATE and holds a fresh URL", async () => {
    const h = queueSession([detail("NOT_ISSUED"), issuePayload(tokenA)]);
    await h.session.open(target);

    expect(await h.session.issue()).toBe(true);

    expect(h.requests[1]).toMatchObject({
      body: { intent: "ISSUE_OR_ROTATE" },
      method: "POST",
      path: `/v1/staff/check-in/sessions/${sessionId}/guest-access/issue`,
    });
    expect(h.session.current()).toMatchObject({
      credentialFresh: true,
      mutation: null,
      status: "ACTIVE",
    });
    expect(h.session.freshCredentialUrl()).toBe(
      `https://customer.example.com/#guestToken=${tokenA}`,
    );
  });

  it("loads ACTIVE authority without reconstructing QR/copy material", async () => {
    const h = queueSession([detail("ACTIVE")]);
    await h.session.open(target);
    expect(h.session.current()).toMatchObject({
      credentialFresh: false,
      status: "ACTIVE",
    });
    expect(h.session.freshCredentialUrl()).toBeNull();
  });

  it("replaces a fresh credential atomically only after reissue success", async () => {
    const second = deferred<unknown>();
    const request = vi
      .fn()
      .mockResolvedValueOnce(detail("NOT_ISSUED"))
      .mockResolvedValueOnce(issuePayload(tokenA))
      .mockReturnValueOnce(second.promise);
    const session = new NativeGuestAccessSession(() => ({ request }) as never, {
      customerOrigin: validOrigin,
      isOnline: () => true,
    });
    await session.open(target);
    await session.issue();
    const reissue = session.issue();

    expect(session.current().mutation).toBe("reissuing");
    expect(session.freshCredentialUrl()).toContain(tokenA);
    second.resolve(issuePayload(tokenB, "ROTATED"));
    expect(await reissue).toBe(true);
    expect(session.freshCredentialUrl()).toBe(
      `https://customer.example.com/#guestToken=${tokenB}`,
    );
    expect(session.freshCredentialUrl()).not.toContain(tokenA);
  });

  it("uses exact authoritative revokedAt for REISSUE_REVOKED", async () => {
    const revokedAt = "2026-09-10T10:00:00.456Z";
    const h = queueSession([
      detail("REVOKED", revokedAt),
      issuePayload(tokenA, "ROTATED"),
    ]);
    await h.session.open(target);
    await h.session.issue();
    expect(h.requests[1]?.body).toEqual({
      expectedRevokedAt: revokedAt,
      intent: "REISSUE_REVOKED",
    });
  });

  it("rehydrates instead of fabricating a missing revokedAt", async () => {
    const h = queueSession([
      detail("REVOKED", null),
      detail("REVOKED", "2026-09-10T10:00:01.000Z"),
    ]);
    await h.session.open(target);
    expect(await h.session.issue()).toBe(false);
    expect(h.requests.map(({ method }) => method)).toEqual(["GET", "GET"]);
    expect(h.session.current()).toMatchObject({
      credentialFresh: false,
      error: "INTENT_CONFLICT",
      status: "REVOKED",
    });
  });

  it("rejects malformed generated credentials and adopts only a safe read", async () => {
    const h = queueSession([
      detail("NOT_ISSUED"),
      issuePayload("a".repeat(42)),
      detail("ACTIVE"),
    ]);
    await h.session.open(target);
    expect(await h.session.issue()).toBe(false);
    expect(h.requests.map(({ method }) => method)).toEqual([
      "GET",
      "POST",
      "GET",
    ]);
    expect(h.session.current()).toMatchObject({
      credentialFresh: false,
      error: "GENERATED_CREDENTIAL_INVALID",
      status: "ACTIVE",
    });
    expect(h.session.freshCredentialUrl()).toBeNull();
  });

  it("blocks issue when Customer origin is missing or invalid", async () => {
    for (const customerOrigin of [
      { ok: false as const, reason: "MISSING" as const },
      { ok: false as const, reason: "INVALID" as const },
    ]) {
      const request = vi.fn().mockResolvedValue(detail("NOT_ISSUED"));
      const session = new NativeGuestAccessSession(
        () => ({ request }) as never,
        { customerOrigin, isOnline: () => true },
      );
      await session.open(target);
      expect(await session.issue()).toBe(false);
      expect(request).toHaveBeenCalledOnce();
      expect(session.current().error).toBe("CONFIG_INVALID");
    }
  });

  it("synchronously blocks rapid duplicate Create and Reissue taps", async () => {
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
    const first = session.issue();
    expect(await session.issue()).toBe(false);
    pending.resolve(issuePayload(tokenA));
    expect(await first).toBe(true);

    const reissuePending = deferred<unknown>();
    request.mockReturnValueOnce(reissuePending.promise);
    const reissue = session.issue();
    expect(await session.issue()).toBe(false);
    reissuePending.resolve(issuePayload(tokenB, "ROTATED"));
    expect(await reissue).toBe(true);
    expect(request).toHaveBeenCalledTimes(3);
  });
});
