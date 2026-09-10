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
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  StyleSheet: { create: (value: unknown) => value },
  Text: "Text",
  TextInput: "TextInput",
  View: "View",
}));

const { content, elements, style } =
  await import("./native-check-in-condition-test-support");
const { NativeIncidentScreen } =
  await import("../src/incident/native-incident-screen");
const { NativeIncidentSession } =
  await import("../src/incident/native-incident-session");
const { getNativeIncidentCopy } =
  await import("../src/incident/native-incident-copy");
const { nativeContextualRoute } =
  await import("../src/shell/native-contextual-route");
const { nativeIncidentSeverities, nativeIncidentTypes } =
  await import("../src/incident/native-incident-types");
const fixture = await import("./native-parity-11-test-fixture");

function render(
  phase: Parameters<typeof fixture.incidentSnapshot>[0],
  locale: "en" | "ar" = "en",
  patch = {},
) {
  const session = { retryContext: vi.fn(), submit: vi.fn() };
  const onClose = vi.fn();
  hooks.states = [];
  const nodes = elements(
    NativeIncidentScreen({
      locale,
      onClose,
      session: session as never,
      snapshot: fixture.incidentSnapshot(phase, patch),
    }),
  );
  return { nodes, onClose, session };
}

function action(nodes: ReturnType<typeof elements>, label: string) {
  return nodes.find(
    (node) =>
      node.type === "Pressable" && node.props.accessibilityLabel === label,
  );
}

describe("UI-PARITY-11 Native Incident", () => {
  beforeEach(() => {
    hooks.states = [];
  });

  it("keeps the canonical type/severity matrices and Web default", () => {
    expect(nativeIncidentTypes).toHaveLength(12);
    expect(nativeIncidentTypes).toContain("WRONG_VEHICLE_HANDOFF_ATTEMPT");
    expect(nativeIncidentSeverities).toEqual([
      "LOW",
      "MEDIUM",
      "HIGH",
      "CRITICAL",
    ]);
    const nodes = render("form").nodes;
    expect(action(nodes, "Low")?.props.accessibilityState).toEqual({
      selected: true,
    });
    expect(
      action(nodes, "Open Incident")?.props.accessibilityState,
    ).toMatchObject({ disabled: true });
  });

  it.each([
    ["en", "Report Incident", "Briefly describe what happened..."],
    ["ar", "الإبلاغ عن حادث", "صف بإيجاز ما حدث..."],
  ] as const)(
    "uses exact Web copy and RTL direction in %s",
    (locale, title, placeholder) => {
      const nodes = render("form", locale).nodes;
      expect(content(nodes)).toContain(title);
      expect(
        nodes.find((node) => node.type === "TextInput")?.props,
      ).toMatchObject({ maxLength: 500, multiline: true, placeholder });
      expect(
        nodes.find((node) => node.type === "ScrollView")?.props
          .contentContainerStyle,
      ).toContainEqual({ direction: locale === "ar" ? "rtl" : "ltr" });
      expect(content(nodes)).not.toContain("Add Photo");
    },
  );

  it("renders standalone loading without a Back header or card", () => {
    const { nodes } = render("loading");
    expect(content(nodes)).toContain("Loading session context…");
    expect(action(nodes, "Back")).toBeUndefined();
    expect(
      style(
        nodes.find((node) => node.props.accessibilityRole === "progressbar")!,
      ),
    ).toMatchObject({ minHeight: 400 });
  });

  it("renders context failure with Retry and exact contextual Back", () => {
    const { nodes, onClose, session } = render("context-error");
    (action(nodes, "Retry")?.props.onPress as () => void)();
    (action(nodes, "Back")?.props.onPress as () => void)();
    expect(session.retryContext).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
    expect(content(nodes)).toContain("Cannot establish session context");
  });

  it("shows authoritative vehicle/session, submission error and busy label", () => {
    const form = render("form", "en", { error: true }).nodes;
    expect(content(form)).toMatch(/Toyota Camry\s+·\s+12-34567/);
    expect(content(form)).toContain("44444444");
    expect(content(form)).toContain(
      "The operation failed. Refresh and try again.",
    );
    expect(
      action(render("submitting").nodes, "Opening…")?.props.accessibilityState,
    ).toMatchObject({ busy: true, disabled: true });
  });

  it("renders authoritative success summary and returns to its owner", () => {
    const { nodes, onClose } = render("success");
    const text = content(nodes);
    expect(text).toContain("Incident opened");
    expect(text).toContain("88888888-8888-4888-8888-888888888888");
    expect(text).toContain("Vehicle damage");
    expect(text).toContain("Low");
    expect(text).toMatch(/Toyota Camry\s+·\s+12-34567/);
    (action(nodes, "Return")?.props.onPress as () => void)();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("preserves every contextual origin without inventing workflow snapshots", () => {
    for (const origin of [
      "CHECK_IN",
      "PARKING",
      "RETRIEVAL",
      "HANDOFF",
    ] as const) {
      expect(
        nativeContextualRoute("incident", origin, fixture.sessionId),
      ).toEqual({ kind: "incident", origin, sessionId: fixture.sessionId });
    }
    expect(nativeContextualRoute("incident", "PARKING", " ")).toBeNull();
  });

  it("hydrates authority, rejects terminal sessions, and sends at most one in-flight submit", async () => {
    let resolvePost!: (value: unknown) => void;
    const request = vi.fn(({ method }: { method: string }) =>
      method === "GET"
        ? Promise.resolve(fixture.detail())
        : new Promise((resolve) => {
            resolvePost = resolve;
          }),
    );
    const session = new NativeIncidentSession(() => ({ request }) as never);
    await session.open({ origin: "PARKING", sessionId: fixture.sessionId });
    const first = session.submit({
      description: "Damage",
      severity: "HIGH",
      type: "VEHICLE_DAMAGE",
    });
    expect(
      await session.submit({
        description: "Again",
        severity: "LOW",
        type: "OTHER",
      }),
    ).toBe(false);
    resolvePost({
      createdAt: "2026-09-10T10:00:00.000Z",
      incidentId: request.mock.calls[1]![0].body.incidentId,
      reportedByMembershipId: "22222222-2222-4222-8222-222222222222",
      sessionId: fixture.sessionId,
      severity: "HIGH",
      status: "OPEN",
      type: "VEHICLE_DAMAGE",
    });
    expect(await first).toBe(true);
    expect(request).toHaveBeenCalledTimes(2);

    const terminal = new NativeIncidentSession(
      () =>
        ({
          request: vi
            .fn()
            .mockResolvedValue({ ...fixture.detail(), state: "COMPLETED" }),
        }) as never,
    );
    await terminal.open({ origin: "HANDOFF", sessionId: fixture.sessionId });
    expect(terminal.current().phase).toBe("context-error");
  });

  it("keeps exact Arabic server-failure presentation", () => {
    expect(getNativeIncidentCopy("ar").failure).toBe(
      "تعذر تنفيذ العملية. حدّث الصفحة وحاول مجدداً.",
    );
  });
});
