import React, { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findElement, installTestDom, invokeReactClick, type TestElement } from "../../app/guest-refresh-mounted.test-host";
import { GUEST_CONTEXT_CHANGED_EVENT } from "../../lib/api/guest-browser-context-marker";
import { GuestWebPushPermissionCard } from "./guest-web-push-permission-card";

vi.mock("../../i18n/use-translation", () => ({
  useTranslation: () => ({ locale: "en", direction: "ltr" }),
}));

const endpoint = "https://fcm.googleapis.com/fcm/send/synthetic";
const subscription = {
  endpoint,
  options: { applicationServerKey: new Uint8Array(65).buffer },
  toJSON: () => ({ endpoint, keys: { p256dh: "A".repeat(87), auth: "B".repeat(22) } }),
  unsubscribe: vi.fn(async () => true),
};

describe("mounted Guest Push verification", () => {
  let root: Root | undefined;
  let container: TestElement;
  let dom: ReturnType<typeof installTestDom>;
  let permission: NotificationPermission;
  let local: typeof subscription | null;
  let status: () => Promise<Response>;
  let register: () => Promise<Response>;
  let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
  const prompt = vi.fn();
  const subscribe = vi.fn();
  const registerWorker = vi.fn();
  const paths = () => fetcher.mock.calls.map(([path]) => String(path).split("/push/")[1]);
  const click = (text: string) => act(async () => invokeReactClick(findElement(container, "button", text)));
  const dispatch = (event: string) => act(async () => {
    (dom.window as unknown as Window).dispatchEvent(new Event(event));
  });
  const setMarker = (letter: string) => Object.assign(dom.document, {
    cookie: `__Host-vaylet_guest_context=vgc1.${letter.repeat(32)}`,
  });

  async function mount() {
    if (root) await act(async () => root?.unmount());
    container = dom.document.createElement("div");
    dom.document.body.appendChild(container);
    root = createRoot(container as unknown as Element);
    await act(async () => root?.render(<StrictMode><GuestWebPushPermissionCard /></StrictMode>));
  }

  beforeEach(() => {
    dom = installTestDom();
    dom.window.isSecureContext = true;
    dom.window.location = { href: "https://guest.example.test/" };
    dom.window.matchMedia = () => ({ matches: false });
    setMarker("a");
    permission = "default";
    local = subscription;
    subscribe.mockReset();
    subscription.unsubscribe.mockReset().mockResolvedValue(true);
    status = async () => Response.json({ active: true });
    register = async () => new Response(null, { status: 204 });
    vi.stubGlobal("Notification", { get permission() { return permission; }, requestPermission: prompt });
    vi.stubGlobal("PushManager", class {});
    const worker = { active: {}, pushManager: { getSubscription: async () => local, subscribe } };
    Object.assign(dom.navigator, { serviceWorker: Object.assign(new EventTarget(), {
      getRegistration: async () => worker,
      ready: Promise.resolve(worker),
      register: registerWorker,
    }) });
    fetcher = vi.fn<typeof fetch>(async (url) => {
      if (String(url).endsWith("/config")) return Response.json({ enabled: true, publicKey: "A".repeat(87) });
      if (String(url).endsWith("/registration/status")) return status();
      if (String(url).endsWith("/registration")) return register();
      throw new Error("Unexpected test request");
    });
    vi.stubGlobal("fetch", fetcher);
  });

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    root = undefined;
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("verifies the exact existing subscription after each mount and keeps the card hidden", async () => {
    permission = "granted";
    await mount();
    expect(container.textContent).toBe("");
    await mount();
    expect(container.textContent).toBe("");
    const checks = fetcher.mock.calls.filter(([url]) => String(url).endsWith("/registration/status"));
    expect(checks).toHaveLength(2);
    expect(JSON.parse(String(checks[0]?.[1]?.body))).toEqual({ endpoint });
    expect(paths()).not.toContain("registration");
    expect(prompt).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
    expect(registerWorker).not.toHaveBeenCalled();
  });

  it("never treats an ACTIVE server endpoint as enabled after a VAPID key rotation", async () => {
    permission = "granted";
    local = { ...subscription, options: { applicationServerKey: new Uint8Array(65).fill(1).buffer } };
    await mount();
    expect(container.textContent).toContain("Notifications aren't fully enabled");
    expect(paths()).not.toContain("registration/status");
    expect(paths()).not.toContain("registration");
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("repairs an old VAPID subscription only after explicit Enable and verifies the new ACTIVE binding", async () => {
    permission = "granted";
    local = {
      ...subscription,
      options: { applicationServerKey: new Uint8Array(65).fill(1).buffer },
      unsubscribe: vi.fn(async () => { local = null; return true; }),
    };
    subscribe.mockImplementation(async () => { local = subscription; return subscription; });
    await mount();
    expect(container.textContent).toContain("Notifications aren't fully enabled");
    expect(subscribe).not.toHaveBeenCalled();
    await click("Enable notifications");
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(paths().filter(path => path === "registration")).toHaveLength(1);
    expect(paths().filter(path => path === "registration/status")).toHaveLength(1);
    expect(container.textContent).toBe("");
  });

  it("keeps Not now dismissed across mounts within the same document without registering", async () => {
    await mount();
    expect(container.textContent).toContain("Enable notifications");
    await click("Not now");
    await dispatch("focus");
    expect(container.textContent).toBe("");
    await mount();
    expect(container.textContent).toBe("");
    expect(prompt).not.toHaveBeenCalled();
    expect(paths().filter(path => path !== "config")).toEqual([]);
  });

  it("re-arms Not now after a same-document switch to a new browser context", async () => {
    await mount();
    await click("Not now");
    expect(container.textContent).toBe("");

    setMarker("b");
    await mount();
    expect(container.textContent).toContain("Enable notifications");
    expect(paths().filter(path => path !== "config")).toEqual([]);
    expect(prompt).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();

    await click("Not now");
    await mount();
    expect(container.textContent).toBe("");
  });

  it("does not let a stale visit's Not now suppress the promoted browser context", async () => {
    await mount();
    setMarker("b");
    await click("Not now");
    await mount();
    expect(container.textContent).toContain("Enable notifications");
    expect(paths().filter(path => path === "registration")).toHaveLength(0);
  });

  it.each(["denied", "missing", "mismatch"] as const)("shows the permitted warning for %s", async (kind) => {
    permission = kind === "denied" ? "denied" : "granted";
    if (kind === "missing") local = null;
    status = async () => Response.json({ active: false });
    await mount();
    expect(container.textContent).toContain(kind === "denied" ? "Notifications are blocked" : "Notifications aren't fully enabled");
    expect(container.textContent.includes("Enable notifications")).toBe(kind !== "denied");
    expect(paths().includes("registration/status")).toBe(kind === "mismatch");
    expect(prompt).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("checks status on explicit retry of an ambiguous bind and avoids a second write when active", async () => {
    permission = "granted";
    let active = false;
    status = async () => Response.json({ active });
    register = async () => {
      active = true;
      throw new TypeError("response lost");
    };
    await mount();
    await click("Enable notifications");
    expect(container.textContent).toContain("Activation unconfirmed");
    await click("Enable notifications");
    expect(container.textContent).toBe("");
    expect(paths().filter(path => path === "registration")).toHaveLength(1);
  });

  it("ignores an old in-flight active result after browser context changes", async () => {
    permission = "granted";
    let finish!: (response: Response) => void;
    status = () => new Promise(resolve => { finish = resolve; });
    await mount();
    setMarker("b");
    await dispatch(GUEST_CONTEXT_CHANGED_EVENT);
    finish(Response.json({ active: true }));
    await act(async () => {});
    status = async () => Response.json({ active: false });
    await mount();
    expect(container.textContent).toContain("Notifications aren't fully enabled");
  });
});
