import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  findElement,
  installTestDom,
  invokeReactClick,
  type TestElement,
} from "../../app/guest-refresh-mounted.test-host";
import { GuestApiError } from "../../lib/api/api-error";
import type { GuestWebPushTransport } from "./guest-web-push-client";
import {
  guestPushFeedbackCopy,
  type GuestPushFeedbackKind,
} from "./guest-web-push-feedback";
import {
  GuestWebPushStageError,
  GuestWebPushTimeoutError,
} from "./guest-web-push-stage";

const client = vi.hoisted(() => ({
  enable: vi.fn(),
  capability: "AVAILABLE",
  secure: true,
  locale: "en" as "en" | "ar",
}));
vi.mock("./guest-web-push-client", () => ({
  detectGuestWebPushCapability: () => client.capability,
  readGuestWebPushCapability: () => ({ isSecureContext: client.secure }),
  enableGuestWebPush: client.enable,
}));
vi.mock("../../i18n/use-translation", () => ({
  useTranslation: () => ({
    locale: client.locale,
    direction: client.locale === "ar" ? "rtl" : "ltr",
  }),
}));
import { GuestWebPushPermissionCard } from "./guest-web-push-permission-card";

describe("mounted truthful activation feedback", () => {
  let root: Root;
  let container: TestElement;
  let transport: GuestWebPushTransport;
  beforeEach(() => {
    const { document } = installTestDom();
    Object.assign(document, { cookie: "" });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container as unknown as Element);
    transport = {
      loadVapidPublicKey: vi.fn(async () => "key"),
      registerSubscription: vi.fn(),
    };
    client.enable.mockReset();
    client.capability = "AVAILABLE";
    client.secure = true;
    client.locale = "en";
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    vi.useRealTimers();
  });
  const mount = async () =>
    act(async () =>
      root.render(<GuestWebPushPermissionCard transport={transport} />),
    );
  const click = async () =>
    act(async () =>
      invokeReactClick(
        findElement(
          container,
          "button",
          client.locale === "en" ? "Enable notifications" : "تفعيل الإشعارات",
        ),
      ),
    );
  const feedback = (kind: GuestPushFeedbackKind) =>
    expect(container.textContent).toContain(
      guestPushFeedbackCopy(client.locale, kind),
    );

  it.each(["en", "ar"] as const)(
    "shows dismissed permission feedback and allows an explicit retry in %s",
    async (locale) => {
      client.locale = locale;
      client.enable.mockResolvedValue("AVAILABLE");
      await mount();
      await click();
      feedback("DISMISSED");
      expect(client.enable).toHaveBeenCalledTimes(1);
      expect(transport.registerSubscription).not.toHaveBeenCalled();
      client.enable.mockResolvedValue("ENABLED");
      await click();
      expect(container.textContent).toBe("");
    },
  );
  it.each([
    [new GuestWebPushTimeoutError("service worker"), "WORKER_TIMEOUT"],
    [new GuestWebPushStageError("public key", new Error("secret")), "CONFIG"],
    [
      new GuestWebPushStageError("subscribe", new Error("secret")),
      "SUBSCRIPTION",
    ],
    [new GuestWebPushTimeoutError("permission"), "TIMEOUT"],
    [
      new GuestApiError({
        status: 0,
        code: "NETWORK_ERROR",
        isNetworkError: true,
        message: "secret",
      }),
      "OFFLINE",
    ],
    [
      new GuestApiError({
        status: 401,
        code: "GUEST_ACCESS_INVALID",
        message: "secret",
      }),
      "AUTH",
    ],
    [
      new GuestApiError({
        status: 403,
        code: "REQUEST_FAILED",
        message: "secret",
      }),
      "AUTH",
    ],
    [
      new GuestApiError({
        status: 409,
        code: "REQUEST_FAILED",
        message: "secret",
      }),
      "CONFLICT",
    ],
    [
      new GuestApiError({
        status: 500,
        code: "SERVICE_UNAVAILABLE",
        message: "secret",
      }),
      "SERVER",
    ],
    [
      new GuestApiError({
        status: 0,
        code: "MUTATION_OUTCOME_UNKNOWN",
        message: "secret",
      }),
      "UNKNOWN",
    ],
    [new GuestWebPushTimeoutError("server registration"), "UNKNOWN"],
  ] as const)(
    "renders %s as truthful %s without raw errors or automatic retry",
    async (error, kind) => {
      client.enable.mockRejectedValue(error);
      await mount();
      await click();
      feedback(kind);
      expect(container.textContent).not.toContain("secret");
      expect(client.enable).toHaveBeenCalledTimes(1);
      expect(transport.registerSubscription).not.toHaveBeenCalled();
      expect(container.textContent).toContain("Not now");
      if (kind === "AUTH" || kind === "CONFLICT") {
        expect(
          findElement(container, "button", "Enable notifications").getAttribute(
            "disabled",
          ),
        ).not.toBeNull();
      }
    },
  );
  it("keeps unconfirmed feedback and makes reconciliation an explicit gesture", async () => {
    client.enable.mockRejectedValueOnce(
      new GuestApiError({
        status: 0,
        code: "MUTATION_OUTCOME_UNKNOWN",
        message: "",
      }),
    );
    await mount();
    await click();
    feedback("UNKNOWN");
    client.enable.mockResolvedValue("ENABLED");
    await click();
    expect(client.enable).toHaveBeenCalledTimes(2);
    expect(container.textContent).toBe("");
  });
  it("honors server Retry-After without automatically retrying", async () => {
    vi.useFakeTimers();
    client.enable.mockRejectedValue(
      new GuestApiError({
        status: 429,
        code: "GUEST_ACCESS_RATE_LIMITED",
        retryAfter: 30,
        message: "",
      }),
    );
    await mount();
    await click();
    feedback("RATE_LIMITED");
    expect(
      findElement(container, "button", "Enable notifications").getAttribute(
        "disabled",
      ),
    ).not.toBeNull();
    await click();
    expect(client.enable).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(
      findElement(container, "button", "Enable notifications").getAttribute(
        "disabled",
      ),
    ).toBeNull();
    expect(client.enable).toHaveBeenCalledTimes(1);
  });
  it.each([
    ["DENIED", true, "DENIED"],
    ["UNSUPPORTED", true, "UNSUPPORTED"],
    ["UNSUPPORTED", false, "INSECURE"],
  ] as const)(
    "explains initial %s securely",
    async (capability, secure, kind) => {
      client.capability = capability;
      client.secure = secure;
      await mount();
      feedback(kind);
      expect(client.enable).not.toHaveBeenCalled();
      expect(transport.loadVapidPublicKey).not.toHaveBeenCalled();
    },
  );
});
