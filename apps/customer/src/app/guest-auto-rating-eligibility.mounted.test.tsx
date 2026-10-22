import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GuestApiClient } from "../lib/api/guest-api-client";
import { GuestAppRoot } from "./guest-app-root";
import {
  installTestDom,
  type TestElement,
} from "./guest-refresh-mounted.test-host";

const host = vi.hoisted(() => ({
  auth: {} as Record<string, unknown>,
  session: {} as Record<string, unknown>,
}));
vi.mock("../features/auth/guest-auth-context", () => ({
  useGuestAuth: () => host.auth,
}));
vi.mock("../features/session/use-guest-session", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useGuestSession: () => host.session,
}));
vi.mock("../features/retrieval/use-retrieval", () => ({
  useRetrieval: () => ({}),
}));
vi.mock("../features/handoff/use-handoff", () => ({
  useHandoff: () => ({ activeMethod: "PICKUP_CODE" }),
}));
vi.mock("../features/demo/dev-preview-controls", () => ({
  DevPreviewControls: () => null,
}));
vi.mock("./guest-web-push-mount", () => ({ GuestWebPushMount: () => null }));
vi.mock("../i18n/use-translation", () => ({
  useTranslation: () => ({
    locale: "en",
    isRtl: false,
    t: (key: string) => key,
  }),
}));
vi.mock("../theme/use-theme", () => ({
  useTheme: () => ({ theme: "light", isDark: false }),
}));

describe("#312 root eligibility wiring", () => {
  let root: Root;
  let container: TestElement;
  let api: GuestApiClient;
  beforeEach(() => {
    const dom = installTestDom();
    container = dom.document.createElement("div");
    dom.document.body.appendChild(container);
    root = createRoot(container as unknown as Element);
    const session = {
      valetSessionId: "123e4567-e89b-12d3-a456-426614174000",
      state: "COMPLETED",
      readyAt: null,
      vehicle: { make: "Toyota", model: "Camry", color: "Black" },
    };
    api = {
      loadSession: vi.fn(async () => session),
      submitRating: vi.fn(),
    } as unknown as GuestApiClient;
    host.auth = {
      client: api,
      token: "memory-only-test",
      isTokenBootstrapComplete: true,
      isBootstrapTemporarilyUnavailable: false,
      isContextSwitching: false,
      isContextSwitchOutcomeAmbiguous: false,
      contextConflictScope: null,
    };
    host.session = {
      session,
      isFresh: true,
      isExpired: false,
      isNetworkError: false,
      isLoading: false,
      isStale: false,
      isRefreshing: false,
      isMutating: false,
      cooldownSeconds: 0,
    };
  });
  afterEach(async () => {
    await act(async () => root.unmount());
  });
  async function render() {
    await act(async () => {
      root.render(<GuestAppRoot />);
      for (let i = 0; i < 15; i++) await Promise.resolve();
    });
  }
  it("opens the existing rating route only after latest authority revalidation", async () => {
    await render();
    expect(api.loadSession).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("rating.submit");
    expect(api.submitRating).not.toHaveBeenCalled();
  });
  it.each([
    ["client", null],
    ["isTokenBootstrapComplete", false],
    ["isBootstrapTemporarilyUnavailable", true],
    ["isContextSwitching", true],
    ["isContextSwitchOutcomeAmbiguous", true],
    ["contextConflictScope", "POST_VISIT"],
  ])("blocks auth condition %s=%s", async (key, value) => {
    host.auth[key as string] = value;
    await render();
    expect(container.textContent).not.toContain("rating.submit");
    expect(api.loadSession).not.toHaveBeenCalled();
    expect(api.submitRating).not.toHaveBeenCalled();
  });
  it.each(["isExpired", "isNetworkError", "isStale"])(
    "blocks invalid session condition %s",
    async (key) => {
      host.session[key] = true;
      host.session.isFresh = false;
      await render();
      expect(container.textContent).not.toContain("rating.submit");
      expect(api.loadSession).not.toHaveBeenCalled();
    },
  );
});
