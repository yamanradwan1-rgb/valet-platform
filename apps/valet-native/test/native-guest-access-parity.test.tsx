import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({ states: [] as unknown[] }));
vi.mock("react", () => ({
  useState: (initial: unknown) => [
    hooks.states.length
      ? hooks.states.shift()
      : typeof initial === "function"
        ? (initial as () => unknown)()
        : initial,
    vi.fn(),
  ],
}));
vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Modal: "Modal",
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  StyleSheet: { create: (value: unknown) => value },
  Text: "Text",
  View: "View",
}));

const { content, elements } =
  await import("./native-check-in-condition-test-support");
const { NativeGuestAccessScreen } =
  await import("../src/guest-access/native-guest-access-screen");
const { NativeGuestAccessSession } =
  await import("../src/guest-access/native-guest-access-session");
const { getNativeGuestAccessCopy } =
  await import("../src/guest-access/native-guest-access-copy");
const { nativeGuestAccessActions } =
  await import("../src/guest-access/native-guest-access-types");
const { nativeContextualRoute } =
  await import("../src/shell/native-contextual-route");
const fixture = await import("./native-parity-11-test-fixture");

function render(
  phase: Parameters<typeof fixture.guestSnapshot>[0],
  status: Parameters<typeof fixture.guestSnapshot>[1] = null,
  options: {
    configInvalid?: boolean;
    credentialFresh?: boolean;
    locale?: "en" | "ar";
    online?: boolean;
    patch?: Parameters<typeof fixture.guestSnapshot>[2];
  } = {},
) {
  const session = { retry: vi.fn(), revoke: vi.fn() };
  const onClose = vi.fn();
  const onCopy = vi.fn().mockResolvedValue(true);
  const onIssue = vi.fn();
  const nodes = elements(
    NativeGuestAccessScreen({
      configInvalid: options.configInvalid ?? false,
      credentialFresh: options.credentialFresh,
      locale: options.locale ?? "en",
      onClose,
      onCopy,
      onIssue,
      online: options.online,
      session: session as never,
      snapshot: fixture.guestSnapshot(phase, status, options.patch),
    }),
  );
  return { nodes, onClose, onCopy, onIssue, session };
}

function action(nodes: ReturnType<typeof elements>, label: string) {
  return nodes.find(
    (node) =>
      node.type === "Pressable" && node.props.accessibilityLabel === label,
  );
}

describe("UI-PARITY-11 Native Guest Access", () => {
  beforeEach(() => {
    hooks.states = [];
  });

  it("maps every authoritative status to the exact Web actions", () => {
    expect(nativeGuestAccessActions("NOT_ISSUED")).toEqual({
      primary: { confirm: false, kind: "CREATE" },
      revoke: false,
    });
    expect(nativeGuestAccessActions("ACTIVE")).toEqual({
      primary: { confirm: true, kind: "REISSUE" },
      revoke: true,
    });
    expect(nativeGuestAccessActions("EXPIRED")).toEqual({
      primary: { confirm: false, kind: "REISSUE" },
      revoke: false,
    });
    expect(nativeGuestAccessActions("REVOKED")).toEqual({
      primary: { confirm: false, kind: "CREATE_NEW" },
      revoke: false,
    });
  });

  it.each([
    ["NOT_ISSUED", "Not created", "Create Guest Access"],
    ["ACTIVE", "previous link cannot be shown again", "Reissue Access"],
    ["EXPIRED", "Guest access expired", "Reissue Access"],
    ["REVOKED", "Access revoked", "Create New Access"],
  ] as const)("renders %s", (status, expected, primary) => {
    const { nodes } = render("ready", status);
    expect(content(nodes)).toContain(expected);
    expect(action(nodes, primary)).toBeDefined();
  });

  it("renders loading and load-error Retry without cached credential", () => {
    expect(content(render("loading").nodes)).toContain(
      "Loading session context…",
    );
    const failure = render("load-error");
    expect(content(failure.nodes)).toContain(
      "The guest access state could not be loaded.",
    );
    expect(
      failure.nodes.some(
        (node) => node.props.testID === "guest-access-safe-qr-fixture",
      ),
    ).toBe(false);
    (action(failure.nodes, "Retry")?.props.onPress as () => void)();
    expect(failure.session.retry).toHaveBeenCalledOnce();
  });

  it("shows a fresh credential fixture, expiry, copy, reissue, and revoke", () => {
    const { nodes, onCopy } = render("ready", "ACTIVE", {
      credentialFresh: true,
    });
    expect(content(nodes)).toContain("Guest access ready");
    expect(content(nodes)).toContain(
      "Let the guest scan this QR or share the copied link.",
    );
    expect(
      nodes.some(
        (node) => node.props.testID === "guest-access-safe-qr-fixture",
      ),
    ).toBe(true);
    (action(nodes, "Copy Guest Link")?.props.onPress as () => void)();
    expect(onCopy).toHaveBeenCalledOnce();
    expect(action(nodes, "Reissue Access")).toBeDefined();
    expect(action(nodes, "Revoke Access")).toBeDefined();
  });

  it.each([
    ["copied", "Guest link copied"],
    ["failed", "Copying failed. Try again."],
  ] as const)("renders %s copy feedback", (feedback, expected) => {
    hooks.states = [null, feedback];
    expect(
      content(render("ready", "ACTIVE", { credentialFresh: true }).nodes),
    ).toContain(expected);
  });

  it("suppresses credential surfaces and issuance under configuration failure but permits revoke", () => {
    const { nodes } = render("ready", "ACTIVE", {
      configInvalid: true,
      credentialFresh: true,
    });
    expect(content(nodes)).toContain(
      "Customer app address is not configured correctly",
    );
    expect(
      nodes.some(
        (node) => node.props.testID === "guest-access-safe-qr-fixture",
      ),
    ).toBe(false);
    expect(
      action(nodes, "Reissue Access")?.props.accessibilityState,
    ).toMatchObject({ disabled: true });
    expect(
      action(nodes, "Revoke Access")?.props.accessibilityState,
    ).toMatchObject({ disabled: false });
  });

  it("disables offline mutations while retaining local copy", () => {
    const { nodes } = render("ready", "ACTIVE", {
      credentialFresh: true,
      online: false,
    });
    expect(content(nodes)).toContain(
      "No network connection. Reconnect to refresh and continue.",
    );
    expect(
      action(nodes, "Copy Guest Link")?.props.accessibilityState,
    ).toMatchObject({ disabled: false });
    expect(
      action(nodes, "Reissue Access")?.props.accessibilityState,
    ).toMatchObject({ disabled: true });
    expect(
      action(nodes, "Revoke Access")?.props.accessibilityState,
    ).toMatchObject({ disabled: true });
  });

  it("renders mutation failure without converting it to success", () => {
    const nodes = render("ready", "ACTIVE", {
      patch: { error: "REVOKE_FAILED" },
    }).nodes;
    expect(content(nodes)).toContain("Revocation failed.");
  });

  it.each([
    [
      "reissue",
      "Reissue guest access?",
      "current guest access stops working immediately",
    ],
    [
      "revoke",
      "Revoke guest access?",
      "customer's current access stops working immediately",
    ],
  ] as const)("renders explicit %s confirmation", (kind, title, body) => {
    hooks.states = [kind, null];
    const nodes = render("ready", "ACTIVE", { credentialFresh: true }).nodes;
    expect(content(nodes)).toContain(title);
    expect(content(nodes)).toContain(body);
    expect(action(nodes, "Cancel")).toBeDefined();
  });

  it("supports Arabic RTL and exact task-local copy", () => {
    const nodes = render("ready", "REVOKED", { locale: "ar" }).nodes;
    expect(content(nodes)).toContain("إنشاء وصول جديد");
    expect(
      nodes.find((node) => node.type === "ScrollView")?.props
        .contentContainerStyle,
    ).toContainEqual({ direction: "rtl" });
    expect(getNativeGuestAccessCopy("ar").copyFailed).toBe(
      "فشل النسخ. حاول مرة أخرى.",
    );
  });

  it("closes to the held context for every supported origin", () => {
    const rendered = render("ready", "NOT_ISSUED");
    (action(rendered.nodes, "Back")?.props.onPress as () => void)();
    expect(rendered.onClose).toHaveBeenCalledOnce();
    for (const origin of [
      "CHECK_IN",
      "PARKING",
      "RETRIEVAL",
      "HANDOFF",
    ] as const) {
      expect(
        nativeContextualRoute("guest-access", origin, fixture.sessionId),
      ).toMatchObject({ kind: "guest-access", origin });
    }
  });

  it("loads safe authority and revokes through the existing endpoint", async () => {
    const request = vi.fn(({ method }: { method: string }) =>
      Promise.resolve(
        method === "GET"
          ? fixture.detail("ACTIVE")
          : {
              revokedAt: "2026-09-10T10:00:00.000Z",
              valetSessionId: fixture.sessionId,
            },
      ),
    );
    const session = new NativeGuestAccessSession(() => ({ request }) as never);
    await session.open({ origin: "CHECK_IN", sessionId: fixture.sessionId });
    expect(session.current().status).toBe("ACTIVE");
    expect(await session.revoke()).toBe(true);
    expect(session.current()).toMatchObject({
      status: "REVOKED",
      mutation: null,
    });
    expect(request.mock.calls[1]![0].path).toContain("/guest-access/revoke");
  });

  it("contains no credential persistence, navigation, logging, or telemetry path", () => {
    const source = globSync("src/guest-access/*.{ts,tsx}", {
      cwd: new URL("../", import.meta.url),
    })
      .map((path) =>
        readFileSync(new URL(`../${path}`, import.meta.url), "utf8"),
      )
      .join("\n");
    expect(source).not.toMatch(
      /AsyncStorage|SecureStore|navigation.*(?:url|token)|console\.|analytics|telemetry|rawToken|shareableUrl/iu,
    );
  });
});
