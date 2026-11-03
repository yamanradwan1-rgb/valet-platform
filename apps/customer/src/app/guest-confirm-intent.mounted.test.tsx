import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invokeReactClick } from "./guest-refresh-mounted.test-host";
import {
  confirmationHarness,
  deferred,
  json,
  retainClick,
  snapshot,
  VISIT_A,
  VISIT_B,
} from "./guest-confirm-intent.test-support";

vi.mock("../i18n/use-translation", () => ({
  useTranslation: () => ({
    locale: "en",
    direction: "ltr",
    isRtl: false,
    setLocale: vi.fn(),
    toggleLocale: vi.fn(),
    t: (key: string) => key,
  }),
}));
vi.mock("../features/demo/dev-preview-controls", () => ({
  DevPreviewControls: () => null,
}));
vi.mock("../theme/use-theme", () => ({
  useTheme: () => ({
    theme: "light",
    isDark: false,
    setTheme: vi.fn(),
    toggleTheme: vi.fn(),
  }),
}));

describe("mounted Request Vehicle intent with real Guest authority", () => {
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

  it("never transfers A confirmation to B after explicit shared-browser promotion", async () => {
    await h.mount();
    const clientA = h.client;
    await h.click("parked.requestButton");
    expect(h.container.textContent).toContain("confirmRequest.title");
    expect(h.posts).toEqual([]);
    const oldConfirm = retainClick(h.button("confirmRequest.confirmButton"));

    await h.promoteFromOtherTab();
    const pendingB = deferred<Response>();
    h.setGet(() => pendingB.promise);
    await h.wake();
    expect(h.client).not.toBe(clientA);
    expect(h.session.session).toBeNull();
    expect(h.container.textContent).not.toContain("confirmRequest.title");

    h.setGet(null);
    await h.settle(() => pendingB.resolve(json(snapshot(VISIT_B))));
    expect(h.container.textContent).toContain("Visit B");
    expect(h.session.isFresh).toBe(true);
    // Retained callback must also fail closed, even after effects have run.
    await h.settle(oldConfirm);
    // Pre-fix: the newly rendered B confirm is the inherited A intent.
    if (h.container.textContent.includes("confirmRequest.title")) {
      await h.click("confirmRequest.confirmButton");
    }
    expect(h.posts, "A intent must not POST request-retrieval for B").toEqual(
      [],
    );
    expect(h.container.textContent).not.toContain("confirmRequest.title");

    await h.click("parked.requestButton");
    await h.click("confirmRequest.confirmButton");
    expect(h.posts).toEqual([VISIT_B]);
  });

  it("keeps normal A request/cancel/reopen and single-flight confirmation", async () => {
    await h.mount();
    await h.click("parked.requestButton");
    await h.click("confirmRequest.cancelButton");
    expect(h.posts).toEqual([]);
    await h.click("parked.requestButton");
    const confirm = h.button("confirmRequest.confirmButton");
    await h.settle(() => {
      invokeReactClick(confirm);
      invokeReactClick(confirm);
    });
    expect(h.posts).toEqual([VISIT_A]);
    expect(h.session.session?.state).toBe("REQUESTED");
    await h.click("requested.cancelButton");
    expect(h.session.session?.state).toBe("PARKED");
    await h.click("parked.requestButton");
    expect(h.container.textContent).toContain("confirmRequest.title");
  });

  it("rejects a retained confirm immediately after cookie promotion, before a React render", async () => {
    await h.mount();
    await h.click("parked.requestButton");
    const confirm = retainClick(h.button("confirmRequest.confirmButton"));
    await h.promoteFromOtherTab();
    await h.settle(confirm);
    expect(h.posts).toEqual([]);
    expect(h.container.textContent).not.toContain("confirmRequest.title");
    await h.wake();
    expect(h.container.textContent).toContain("Visit B");
    expect(h.posts).toEqual([]);
  });

  it("discards a delayed A GET and cannot revive its confirmation on B", async () => {
    await h.mount();
    await h.click("parked.requestButton");
    const lateA = deferred<Response>();
    h.setGet(() => lateA.promise);
    await h.wake();
    await h.promoteFromOtherTab();
    h.setGet(null);
    // The old GET detects marker promotion after its response body settles.
    await h.settle(() => lateA.resolve(json(snapshot())));
    expect(h.container.textContent).toContain("Visit B");
    expect(h.container.textContent).not.toContain("Visit A");
    expect(h.container.textContent).not.toContain("confirmRequest.title");
    expect(h.posts).toEqual([]);
  });

  it("rejects an implicit same-client visit change at the coordinator boundary", async () => {
    await h.mount();
    const client = h.client;
    await h.click("parked.requestButton");
    h.setSnapshot(snapshot(VISIT_B));
    await h.wake();
    expect(h.client).toBe(client);
    expect(h.session.session?.valetSessionId).toBe(VISIT_A);
    expect(h.session.isFresh).toBe(false);
    expect(
      h.button("confirmRequest.confirmButton").getAttribute("disabled"),
    ).not.toBeNull();
    await h.settle(retainClick(h.button("confirmRequest.confirmButton")));
    expect(h.posts).toEqual([]);
  });

  it.each(["invalid", "revoked", "expired"])(
    "clears confirmation on the non-disclosing %s authority response",
    async () => {
      await h.mount();
      await h.click("parked.requestButton");
      const confirm = retainClick(h.button("confirmRequest.confirmButton"));
      h.setGet(async () =>
        json({ code: "GUEST_ACCESS_INVALID", message: "Denied" }, 401),
      );
      await h.wake();
      expect(h.session.isExpired).toBe(true);
      expect(h.session.session).toBeNull();
      expect(h.container.textContent).not.toContain("confirmRequest.title");
      await h.settle(confirm);
      expect(h.posts).toEqual([]);
    },
  );

  it("invalidates on leaving PARKED and requires a new click after returning", async () => {
    await h.mount();
    await h.click("parked.requestButton");
    const confirm = retainClick(h.button("confirmRequest.confirmButton"));
    h.setSnapshot(snapshot(VISIT_A, "REQUESTED"));
    await h.wake();
    expect(h.container.textContent).not.toContain("confirmRequest.title");
    await h.settle(confirm);
    expect(h.posts).toEqual([]);
    await h.click("requested.cancelButton");
    expect(h.session.session?.state).toBe("PARKED");
    expect(h.container.textContent).not.toContain("confirmRequest.title");
    await h.click("parked.requestButton");
    await h.click("confirmRequest.confirmButton");
    expect(h.posts).toEqual([VISIT_A]);
  });

  it("reconciles an ambiguous POST without replay, then needs a new deliberate request", async () => {
    await h.mount();
    await h.click("parked.requestButton");
    h.setPost(async () => {
      throw new TypeError("Response lost");
    });
    const readsBefore = h.fetchSpy.mock.calls.filter(([url]) =>
      String(url).endsWith("/session"),
    ).length;
    await h.click("confirmRequest.confirmButton");
    expect(h.posts).toEqual([VISIT_A]);
    expect(
      h.fetchSpy.mock.calls.filter(([url]) => String(url).endsWith("/session")),
    ).toHaveLength(readsBefore + 1);
    await h.settle(() => {});
    expect(h.posts).toEqual([VISIT_A]);
    await h.click("confirmRequest.cancelButton");
    h.setPost(null);
    await h.click("parked.requestButton");
    await h.click("confirmRequest.confirmButton");
    expect(h.posts).toEqual([VISIT_A, VISIT_A]);
  });

  it("does not let an old successful POST continuation close a new B confirmation", async () => {
    await h.mount();
    await h.click("parked.requestButton");
    const latePost = deferred<Response>();
    h.setPost(() => latePost.promise);
    await h.click("confirmRequest.confirmButton");
    await h.promoteFromOtherTab();
    // A pending mutation suppresses wake reads. Normal browser marker detection
    // occurs when the outstanding POST settles, then installs B's coordinator.
    await h.settle(() =>
      latePost.resolve(json(snapshot(VISIT_A, "REQUESTED"))),
    );
    expect(h.container.textContent).toContain("Visit B");
    expect(h.container.textContent).not.toContain("confirmRequest.title");
    await h.click("parked.requestButton");
    await h.settle(() => {});
    expect(h.container.textContent).toContain("confirmRequest.title");
    expect(h.posts).toEqual([VISIT_A]);
  });

  it.each(["success", "ambiguous", "invalid"] as const)(
    "fails closed through the real conflict gate and a pending/%s explicit switch",
    async (outcome) => {
      await h.unmount();
      h = confirmationHarness(`#guestToken=${"B".repeat(43)}`);
      await h.mount();
      expect(h.auth.contextConflictScope).toBe("ACTIVE");
      expect(h.container.textContent).toContain("contextConflict.title");
      // There is no reachable Request tap behind the modal. Also attack the
      // underlying callback directly to prove its fail-closed boundary.
      await h.click("parked.requestButton");
      expect(h.container.textContent).not.toContain("confirmRequest.title");
      const switchResponse = deferred<Response>();
      h.setSwitch(() => switchResponse.promise);
      await h.click("contextConflict.openNew");
      expect(h.auth.isContextSwitching).toBe(true);
      await h.click("parked.requestButton");
      expect(h.container.textContent).not.toContain("confirmRequest.title");
      if (outcome === "success") {
        h.setSnapshot(snapshot(VISIT_B));
        h.document.cookie =
          "__Host-vaylet_guest_context=vgc1." + "b".repeat(32);
        await h.settle(() =>
          switchResponse.resolve(json({ result: "SWITCHED" })),
        );
        expect(h.container.textContent).toContain("Visit B");
        expect(h.container.textContent).not.toContain("confirmRequest.title");
        await h.click("parked.requestButton");
        await h.click("confirmRequest.confirmButton");
        expect(h.posts).toEqual([VISIT_B]);
      } else {
        await h.settle(() =>
          switchResponse.resolve(
            json(
              {
                code:
                  outcome === "invalid"
                    ? "GUEST_ACCESS_INVALID"
                    : "SERVICE_UNAVAILABLE",
                message: "Denied",
              },
              outcome === "invalid" ? 401 : 503,
            ),
          ),
        );
        expect(h.auth.isContextSwitching).toBe(false);
        expect(h.auth.isContextSwitchOutcomeAmbiguous).toBe(
          outcome === "ambiguous",
        );
        expect(h.posts).toEqual([]);
        expect(h.container.textContent).not.toContain("confirmRequest.title");
        if (outcome === "ambiguous") {
          expect(h.session.isFresh).toBe(false);
          expect(
            h
              .button("contextConflict.continueCurrent")
              .getAttribute("disabled"),
          ).not.toBeNull();
        } else {
          expect(h.auth.contextConflictScope).toBeNull();
          await h.click("parked.requestButton");
          await h.click("confirmRequest.confirmButton");
          expect(h.posts).toEqual([VISIT_A]);
        }
      }
    },
  );
});
