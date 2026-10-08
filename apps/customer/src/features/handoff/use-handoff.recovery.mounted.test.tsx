import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GuestApiError } from "../../lib/api/api-error";
import type {
  GuestHandoffMaterial,
  GuestSafeSession,
  HandoffStandardMethod,
} from "../../lib/api/guest-api-types";

const mockedContext = vi.hoisted(() => ({
  auth: { current: null as unknown },
  session: { current: null as unknown },
}));

vi.mock("../auth/guest-auth-context", () => ({
  useGuestAuth: () => mockedContext.auth.current,
}));
vi.mock("../session/use-guest-session", () => ({
  useGuestSession: () => mockedContext.session.current,
}));
vi.mock("../../i18n/use-translation", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { useHandoff } from "./use-handoff";

const VISIT = "11111111-1111-4111-8111-111111111111";

function session(
  state: GuestSafeSession["state"] = "HANDOFF_PENDING",
): GuestSafeSession {
  return {
    valetSessionId: VISIT,
    state,
    readyAt: null,
    vehicle: { make: "Toyota", model: "Camry", color: "White" },
  };
}

function material(
  method: HandoffStandardMethod,
  secret: string,
): GuestHandoffMaterial {
  const base = {
    valetSessionId: VISIT,
    state: "HANDOFF_PENDING" as const,
    method,
    expiresAt: "2099-01-01T00:00:00.000Z",
  };
  return method === "PICKUP_CODE"
    ? { ...base, method, pickupCode: secret }
    : { ...base, method, qrPayload: secret };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function fakeContainer(): HTMLElement {
  class FakeElement {}
  class FakeHtmlElement extends FakeElement {}
  class FakeIframeElement extends FakeHtmlElement {}
  const windowValue = {
    Element: FakeElement,
    HTMLElement: FakeHtmlElement,
    HTMLIFrameElement: FakeIframeElement,
    getSelection: () => null,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  const documentValue = {
    nodeType: 9,
    defaultView: windowValue,
    activeElement: null,
    body: {},
    documentElement: { namespaceURI: "http://www.w3.org/1999/xhtml" },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  const container = {
    nodeType: 1,
    ownerDocument: documentValue,
    namespaceURI: "http://www.w3.org/1999/xhtml",
    tagName: "DIV",
    textContent: "",
    addEventListener: () => {},
    removeEventListener: () => {},
    appendChild: () => {},
    insertBefore: () => {},
    removeChild: () => {},
  };
  vi.stubGlobal("window", windowValue);
  vi.stubGlobal("document", documentValue);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  return container as unknown as HTMLElement;
}

function beginMutation() {
  return { isCurrent: () => true, finish: vi.fn(async () => {}) };
}

interface ClientStub {
  readonly issueHandoff: ReturnType<typeof vi.fn>;
  readonly rotateHandoff: ReturnType<typeof vi.fn>;
}

interface MutationTicketStub {
  readonly isCurrent: () => boolean;
  readonly finish: () => Promise<void>;
}

function setContext(
  client: ClientStub,
  value: GuestSafeSession,
  startMutation: () => MutationTicketStub | null = beginMutation,
) {
  mockedContext.auth.current = { client };
  mockedContext.session.current = {
    session: value,
    isFresh: true,
    beginMutation: startMutation,
  };
}

describe("useHandoff mounted recovery", () => {
  let root: Root | null = null;
  let latest: ReturnType<typeof useHandoff> | null = null;

  function Probe() {
    latest = useHandoff();
    return null;
  }

  async function renderProbe() {
    if (!root) root = createRoot(fakeContainer());
    await act(async () => {
      root!.render(<Probe />);
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  beforeEach(() => {
    latest = null;
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root!.unmount());
      root = null;
    }
    vi.unstubAllGlobals();
  });

  it("rotates PIN to QR and back while rapid duplicate rotation is single-flight", async () => {
    const pendingQr = deferred<GuestHandoffMaterial>();
    const issue = vi.fn(async () => material("PICKUP_CODE", "1234"));
    const rotate = vi
      .fn()
      .mockImplementationOnce(() => pendingQr.promise)
      .mockResolvedValueOnce(material("PICKUP_CODE", "5678"));
    let locked = false;
    const startMutation = vi.fn(() => {
      if (locked) return null;
      locked = true;
      return {
        isCurrent: () => true,
        finish: async () => {
          locked = false;
        },
      };
    });
    setContext(
      { issueHandoff: issue, rotateHandoff: rotate },
      session(),
      startMutation,
    );
    await renderProbe();

    let first!: Promise<void>;
    let duplicate!: Promise<void>;
    act(() => {
      first = latest!.switchMethod("DYNAMIC_QR");
      duplicate = latest!.switchMethod("DYNAMIC_QR");
    });
    await duplicate;
    expect(rotate).toHaveBeenCalledTimes(1);
    expect(latest?.material).toBeNull();

    await act(async () =>
      pendingQr.resolve(material("DYNAMIC_QR", "vhq1.test")),
    );
    await first;
    expect(latest?.material).toMatchObject({ method: "DYNAMIC_QR" });

    await act(async () => latest!.switchMethod("PICKUP_CODE"));
    expect(rotate).toHaveBeenCalledTimes(2);
    expect(latest?.material).toMatchObject({ pickupCode: "5678" });
  });

  it("hides proof on completed lifecycle and never reuses the cached secret", async () => {
    const issue = vi.fn(async () => material("PICKUP_CODE", "1234"));
    const client = { issueHandoff: issue, rotateHandoff: vi.fn() };
    setContext(client, session());
    await renderProbe();
    expect(latest?.material).toMatchObject({ pickupCode: "1234" });

    setContext(client, session("COMPLETED"));
    await renderProbe();
    expect(latest?.material).toBeNull();
    expect(issue).toHaveBeenCalledTimes(1);
  });

  it("requires explicit rotation after ALREADY_ISSUED and blocks it after ALREADY_VERIFIED", async () => {
    const alreadyIssued = new GuestApiError({
      status: 409,
      code: "HANDOFF_VERIFICATION_ALREADY_ISSUED",
      message: "already issued",
    });
    const rotate = vi.fn(async () => material("PICKUP_CODE", "5678"));
    const client = {
      issueHandoff: vi.fn().mockRejectedValue(alreadyIssued),
      rotateHandoff: rotate,
    };
    setContext(client, session());
    await renderProbe();
    expect(latest?.recoveryState).toBe("ALREADY_ISSUED");
    expect(rotate).not.toHaveBeenCalled();

    await act(async () => latest!.rotateCurrent());
    expect(rotate).toHaveBeenCalledTimes(1);
    expect(latest?.material).toMatchObject({ pickupCode: "5678" });

    const verified = new GuestApiError({
      status: 409,
      code: "HANDOFF_VERIFICATION_ALREADY_VERIFIED",
      message: "already verified",
    });
    client.issueHandoff.mockRejectedValue(verified);
    setContext(client, session("READY"));
    await renderProbe();
    setContext(client, session());
    await renderProbe();
    expect(latest?.recoveryState).toBe("ALREADY_VERIFIED");
    await act(async () => latest!.rotateCurrent());
    expect(rotate).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      "ambiguous network",
      new GuestApiError({
        status: 0,
        code: "NETWORK_ERROR",
        message: "offline",
        isNetworkError: true,
      }),
    ],
    [
      "temporary 503",
      new GuestApiError({
        status: 503,
        code: "SERVICE_UNAVAILABLE",
        message: "temporary",
      }),
    ],
    [
      "rate limited 429",
      new GuestApiError({
        status: 429,
        code: "GUEST_ACCESS_RATE_LIMITED",
        message: "slow down",
        retryAfter: 7,
      }),
    ],
  ])("does not replay a %s failed issue", async (_label, failure) => {
    const issue = vi.fn().mockRejectedValue(failure);
    const rotate = vi.fn();
    const finish = vi.fn(async () => {});
    const client = { issueHandoff: issue, rotateHandoff: rotate };
    setContext(client, session(), () => ({ isCurrent: () => true, finish }));
    await renderProbe();

    expect(issue).toHaveBeenCalledTimes(1);
    expect(finish).toHaveBeenCalledWith(undefined, failure);
    expect(latest?.material).toBeNull();
    expect(latest?.error).not.toBeNull();
    await renderProbe();
    expect(issue).toHaveBeenCalledTimes(1);
    expect(rotate).not.toHaveBeenCalled();
  });
});
