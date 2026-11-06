import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { confirmationHarness, json, marker, snapshot, VISIT_A } from "./guest-confirm-intent.test-support";
import { invokeReactClick } from "./guest-refresh-mounted.test-host";

vi.mock("../i18n/use-translation", () => ({
  useTranslation: () => ({
    locale: "en",
    direction: "ltr",
    isRtl: false,
    t: (key: string) => key,
  }),
}));
vi.mock("../theme/use-theme", () => ({
  useTheme: () => ({ theme: "light", isDark: false }),
}));
vi.mock("../features/demo/dev-preview-controls", () => ({
  DevPreviewControls: () => null,
}));

describe("mounted Guest switch proof", () => {
  let h: ReturnType<typeof confirmationHarness>;

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_GUEST_BROWSER_SESSION_ENROLLMENT_ENABLED", "true");
    h = confirmationHarness();
  });

  afterEach(async () => {
    await h.unmount();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it.each(["NONE", "RECOVERED"] as const)(
    "keeps the intended target pending after an ambiguous switch, 401, and cookie-only %s",
    async (result) => {
      await h.mount();
      await h.reenter();
      const source = h.client!;
      const targetBearer = h.auth.token;
      const pendingRequests: string[] = [];
      const originalFetch = h.fetchSpy.getMockImplementation()!;
      h.setSwitch(vi.fn<() => Promise<Response>>()
        .mockRejectedValueOnce(new TypeError("response lost before commit"))
        .mockResolvedValueOnce(json({ code: "GUEST_ACCESS_INVALID" }, 401)));
      h.fetchSpy.mockImplementation(async (url, init) => {
        const path = String(url).split("/guest/")[1];
        if (path === "browser-session/switch" || path === "browser-session/switch/reconcile") {
          pendingRequests.push(path);
        }
        if (path === "browser-session/switch/reconcile" && result === "RECOVERED") {
          // A different tab's committed transition is recoverable using the
          // shared cookies. The response contains no proof for this bearer.
          h.document.cookie = marker("c");
          h.setSnapshot(snapshot("323e4567-e89b-12d3-a456-426614174000"));
          return json({ result: "RECOVERED" });
        }
        return originalFetch(url, init);
      });

      await h.click("contextConflict.openNew");

      expect(pendingRequests).toEqual([
        "browser-session/switch", "browser-session/switch", "browser-session/switch/reconcile",
      ]);
      if (result === "NONE") {
        // The first switch did not commit. The same source cookie still
        // authorizes Visit A with HTTP 200, even though Visit B was requested.
        await expect(source.loadSession()).resolves.toMatchObject({ valetSessionId: VISIT_A });
      }
      expect(h.auth).toMatchObject({
        token: targetBearer,
        contextConflictScope: "ACTIVE",
        isContextSwitchOutcomeAmbiguous: true,
        isContextSwitching: false,
      });
      expect(h.client).toBe(source);
      expect(h.session.isFresh).toBe(false);
      expect(h.session.beginMutation()).toBeNull();
      const requestButton = h.button("parked.requestButton");
      expect(requestButton.getAttribute("disabled")).not.toBeNull();
      await h.settle(() => invokeReactClick(requestButton));
      expect(h.container.textContent).not.toContain("confirmRequest.title");
      expect(h.posts).toEqual([]);
    },
  );

  it.each(["changed", "absent"] as const)("does not replay with a %s source marker", async (sourceMarker) => {
    if (sourceMarker === "absent") h.document.cookie = "";
    await h.mount();
    await h.reenter();
    const source = h.client;
    const targetBearer = h.auth.token;
    const switchRequest = vi.fn(async () => {
      if (sourceMarker === "changed") h.document.cookie = marker("c");
      throw new TypeError("response lost as the browser context changed");
    });
    h.setSwitch(switchRequest);

    await h.click("contextConflict.openNew");
    await h.click("contextConflict.openNew");

    expect(switchRequest).toHaveBeenCalledOnce();
    expect(h.client).toBe(source);
    expect(h.auth).toMatchObject({
      token: targetBearer,
      contextConflictScope: "ACTIVE",
      isContextSwitchOutcomeAmbiguous: true,
    });
    expect(h.session.beginMutation()).toBeNull();
  });
});
