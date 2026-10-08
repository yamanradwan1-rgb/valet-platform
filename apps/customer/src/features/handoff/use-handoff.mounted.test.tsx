import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  GuestHandoffMaterial,
  GuestSafeSession,
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

const VISIT_A = "11111111-1111-4111-8111-111111111111";
const VISIT_B = "22222222-2222-4222-8222-222222222222";
let offlineListener: (() => void) | null = null;

function session(valetSessionId: string): GuestSafeSession {
  return {
    valetSessionId,
    state: "HANDOFF_PENDING",
    readyAt: null,
    vehicle: { make: "Toyota", model: "Camry", color: "White" },
  };
}

function pickupMaterial(
  valetSessionId: string,
  pickupCode: string,
  expiresAt = "2099-01-01T00:00:00.000Z",
): GuestHandoffMaterial {
  return {
    valetSessionId,
    state: "HANDOFF_PENDING",
    method: "PICKUP_CODE",
    pickupCode,
    expiresAt,
  };
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
    addEventListener: (type: string, listener: () => void) => {
      if (type === "offline") offlineListener = listener;
    },
    removeEventListener: (type: string, listener: () => void) => {
      if (type === "offline" && offlineListener === listener)
        offlineListener = null;
    },
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

function mutationTicket() {
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
  isFresh: boolean,
  beginMutation: () => MutationTicketStub = () => mutationTicket(),
) {
  mockedContext.auth.current = { client };
  mockedContext.session.current = { session: value, isFresh, beginMutation };
  return beginMutation;
}

describe("useHandoff mounted trust fences", () => {
  let root: Root | null = null;
  let latest: ReturnType<typeof useHandoff> | null = null;
  const renderHistory: Array<GuestHandoffMaterial | null> = [];

  function Probe() {
    latest = useHandoff();
    renderHistory.push(latest.material);
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

  function renderProbeSync() {
    if (!root) root = createRoot(fakeContainer());
    act(() => root!.render(<Probe />));
  }

  beforeEach(() => {
    latest = null;
    renderHistory.length = 0;
    offlineListener = null;
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root!.unmount());
      root = null;
    }
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("clears proof on trust loss and does not auto-issue again after reconnect", async () => {
    const issue = vi.fn(async () => pickupMaterial(VISIT_A, "1234"));
    const rotate = vi.fn();
    const client = { issueHandoff: issue, rotateHandoff: rotate };
    setContext(client, session(VISIT_A), true);
    await renderProbe();

    expect(latest?.material).toMatchObject({ pickupCode: "1234" });
    expect(issue).toHaveBeenCalledTimes(1);

    const beginMutation = setContext(client, session(VISIT_A), false);
    const beforeLossRender = renderHistory.length;
    renderProbeSync();
    expect(renderHistory[beforeLossRender]).toBeNull();
    expect(latest?.material).toBeNull();

    setContext(client, session(VISIT_A), true, beginMutation);
    renderProbeSync();
    expect(latest?.material).toBeNull();
    expect(issue).toHaveBeenCalledTimes(1);
    expect(rotate).not.toHaveBeenCalled();
    await act(async () => Promise.resolve());
  });

  it("accepts a new proof across the expected mutation false-to-true freshness gap", async () => {
    const issueResponse = deferred<GuestHandoffMaterial>();
    const finish = deferred<void>();
    const issue = vi.fn(() => issueResponse.promise);
    const rotate = vi.fn();
    const client = { issueHandoff: issue, rotateHandoff: rotate };
    const beginMutation = vi.fn(() => ({
      isCurrent: () => true,
      finish: () => finish.promise,
    }));
    setContext(client, session(VISIT_A), true, beginMutation);
    await renderProbe();
    expect(issue).toHaveBeenCalledTimes(1);

    setContext(client, session(VISIT_A), false, beginMutation);
    await renderProbe();
    await act(async () =>
      issueResponse.resolve(pickupMaterial(VISIT_A, "5678")),
    );

    setContext(client, session(VISIT_A), true, beginMutation);
    await renderProbe();
    await act(async () => finish.resolve());
    expect(latest?.material).toMatchObject({ pickupCode: "5678" });
    expect(issue).toHaveBeenCalledTimes(1);
    expect(rotate).not.toHaveBeenCalled();
  });

  it("drops a late ISSUE response after offline loss and reconnect", async () => {
    const issueResponse = deferred<GuestHandoffMaterial>();
    const finish = deferred<void>();
    const client = {
      issueHandoff: vi.fn(() => issueResponse.promise),
      rotateHandoff: vi.fn(),
    };
    const beginMutation = () => ({
      isCurrent: () => true,
      finish: () => finish.promise,
    });
    setContext(client, session(VISIT_A), true, beginMutation);
    await renderProbe();

    act(() => offlineListener?.());
    setContext(client, session(VISIT_A), false, beginMutation);
    await renderProbe();
    await act(async () =>
      issueResponse.resolve(pickupMaterial(VISIT_A, "9999")),
    );
    setContext(client, session(VISIT_A), true, beginMutation);
    await renderProbe();
    await act(async () => finish.resolve());

    expect(latest?.material).toBeNull();
    expect(client.issueHandoff).toHaveBeenCalledTimes(1);
    expect(client.rotateHandoff).not.toHaveBeenCalled();
  });

  it("keeps the new generation proof when an old client resolves late", async () => {
    const oldIssue = deferred<GuestHandoffMaterial>();
    const clientA = {
      issueHandoff: vi.fn(() => oldIssue.promise),
      rotateHandoff: vi.fn(),
    };
    const clientB = {
      issueHandoff: vi.fn(async () => pickupMaterial(VISIT_B, "2222")),
      rotateHandoff: vi.fn(),
    };
    setContext(clientA, session(VISIT_A), true);
    await renderProbe();

    setContext(clientB, session(VISIT_B), true);
    await renderProbe();
    expect(latest?.material).toMatchObject({ pickupCode: "2222" });

    await act(async () => oldIssue.resolve(pickupMaterial(VISIT_A, "1111")));
    expect(latest?.material).toMatchObject({ pickupCode: "2222" });
  });

  it("clears expired proof without issuing or rotating another one", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-08T16:00:00.000Z"));
    const issue = vi.fn(async () =>
      pickupMaterial(VISIT_A, "1234", "2026-10-08T16:00:02.000Z"),
    );
    const rotate = vi.fn();
    setContext(
      { issueHandoff: issue, rotateHandoff: rotate },
      session(VISIT_A),
      true,
    );
    await renderProbe();
    expect(latest?.material).not.toBeNull();

    await act(async () => vi.advanceTimersByTime(2_100));
    expect(latest?.material).toBeNull();
    expect(latest?.isExpired).toBe(true);
    expect(issue).toHaveBeenCalledTimes(1);
    expect(rotate).not.toHaveBeenCalled();
  });
});
