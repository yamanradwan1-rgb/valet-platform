import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  findElement,
  installTestDom,
  invokeReactClick,
  type TestElement,
} from "../../app/guest-refresh-mounted.test-host";
import { GuestWebPushPermissionCard } from "./guest-web-push-permission-card";

vi.mock("../../i18n/use-translation", () => ({
  useTranslation: () => ({ locale: "en", direction: "ltr" }),
}));

const endpoint = "https://push.example.test/current";
const publicVapidKey = "A".repeat(87);
const firstContext = `vgc1.${"1".repeat(32)}`;
const secondContext = `vgc1.${"2".repeat(32)}`;
const subscription = {
  endpoint,
  // The 87-character unpadded VAPID key decodes to exactly 65 zero bytes.
  options: { applicationServerKey: new Uint8Array(65).buffer, userVisibleOnly: true },
  toJSON: () => ({ endpoint, keys: { auth: "auth-key", p256dh: "p256dh-key" } }),
};

describe("Issue 435 mounted refresh races and passive wakeups", () => {
  let root: Root | undefined;
  let container: TestElement;
  let dom: ReturnType<typeof installTestDom>;
  let permission: NotificationPermission;
  let active: boolean;
  let status: () => Promise<Response>;
  let register: () => Promise<Response>;
  let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
  let prompt: ReturnType<typeof vi.fn>;
  let subscribe: ReturnType<typeof vi.fn>;
  let paths: () => string[];

  async function mount() {
    if (root) await act(async () => root?.unmount());
    container = dom.document.createElement("div");
    dom.document.body.appendChild(container);
    root = createRoot(container as unknown as Element);
    await act(async () => root?.render(<GuestWebPushPermissionCard />));
  }

  async function click(text: string) {
    await act(async () => invokeReactClick(findElement(container, "button", text)));
  }

  function installBrowserDocument() {
    dom = installTestDom();
    dom.window.isSecureContext = true;
    dom.window.matchMedia = () => ({ matches: false });
    Object.assign(dom.document, { cookie: `__Host-vaylet_guest_context=${firstContext}` });
    const worker = { active: {}, pushManager: { getSubscription: async () => subscription, subscribe } };
    Object.assign(dom.navigator, { serviceWorker: Object.assign(new EventTarget(), {
      getRegistration: async () => worker,
      ready: Promise.resolve(worker),
      register: vi.fn(),
    }) });
  }

  beforeEach(() => {
    permission = "granted";
    active = true;
    prompt = vi.fn();
    subscribe = vi.fn();
    vi.stubGlobal("Notification", { get permission() { return permission; }, requestPermission: prompt });
    vi.stubGlobal("PushManager", class {});
    installBrowserDocument();
    status = async () => Response.json({ active });
    register = async () => new Response(null, { status: 204 });
    fetcher = vi.fn<typeof fetch>(async (url) => {
      if (String(url).endsWith("/push/config")) {
        return Response.json({ enabled: true, publicKey: publicVapidKey });
      }
      if (String(url).endsWith("/push/registration/status")) return status();
      if (String(url).endsWith("/push/registration")) return register();
      throw new Error("Unexpected Guest Web Push request");
    });
    paths = () => fetcher.mock.calls.map(([url]) => String(url).split("/push/")[1] ?? "");
    vi.stubGlobal("fetch", fetcher);
  });

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    root = undefined;
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("coalesces focus and online wakeups into a single passive check", async () => {
    await mount();
    expect(container.textContent).toBe("");
    expect(paths().filter((path) => path === "registration/status")).toHaveLength(1);
    vi.useFakeTimers();
    await act(async () => {
      (dom.window as unknown as Window).dispatchEvent(new Event("focus"));
      (dom.window as unknown as Window).dispatchEvent(new Event("online"));
    });
    await act(async () => vi.advanceTimersByTimeAsync(2_000));
    expect(paths().filter((path) => path === "registration/status")).toHaveLength(2);
    expect(paths()).not.toContain("registration");
    expect(prompt).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("rejects an active response from a replaced browser context without an explicit event", async () => {
    let resolveStatus!: (response: Response) => void;
    status = () => new Promise((resolve) => { resolveStatus = resolve; });
    await mount();
    expect(paths()).toContain("registration/status");
    Object.assign(dom.document, { cookie: `__Host-vaylet_guest_context=${secondContext}` });
    await act(async () => resolveStatus(Response.json({ active: true })));
    expect(container.textContent).toContain("Visit changed. Refresh before enabling alerts.");
    expect(container.textContent).toContain("Enable notifications");
    await click("Enable notifications");
    expect(paths()).not.toContain("registration");
    expect(prompt).not.toHaveBeenCalled();
  });

  it("does not repeat an uncertain registration POST when refreshed status proves it active", async () => {
    active = false;
    register = async () => {
      active = true;
      throw new TypeError("lost response after commit");
    };
    await mount();
    expect(container.textContent).toContain("Notifications aren't fully enabled");
    await click("Enable notifications");
    expect(container.textContent).toContain("Activation unconfirmed");
    expect(paths().filter((path) => path === "registration")).toHaveLength(1);
    await mount();
    expect(container.textContent).toBe("");
    expect(paths().filter((path) => path === "registration")).toHaveLength(1);
    expect(prompt).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("keeps Not now scoped to the current document and refresh remains read-only", async () => {
    active = false;
    await mount();
    await click("Not now");
    expect(container.textContent).toBe("");
    await act(async () => (dom.window as unknown as Window).dispatchEvent(new Event("focus")));
    expect(container.textContent).toBe("");
    await mount();
    expect(container.textContent).toBe("");
    expect(paths().filter((path) => path === "registration/status")).toHaveLength(1);

    // A real reload creates a new Document. The in-memory dismissal must expire.
    await act(async () => root?.unmount());
    root = undefined;
    installBrowserDocument();
    await mount();
    expect(container.textContent).toContain("Notifications aren't fully enabled");
    expect(paths().filter((path) => path === "registration/status")).toHaveLength(2);
    expect(paths()).not.toContain("registration");
    expect(prompt).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
  });
});
