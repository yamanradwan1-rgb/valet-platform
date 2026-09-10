import { describe, expect, it, vi } from "vitest";

vi.mock("react", () => ({
  useCallback: (callback: unknown) => callback,
  useEffect: (callback: () => void) => callback(),
  useState: (initial: unknown) => [
    typeof initial === "function" ? (initial as () => unknown)() : initial,
    vi.fn(),
  ],
  useSyncExternalStore: (_subscribe: unknown, current: () => unknown) =>
    current(),
}));
vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Linking: { openSettings: vi.fn() },
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  StyleSheet: { create: (value: unknown) => value },
  Text: "Text",
  TextInput: "TextInput",
  View: "View",
}));
vi.mock("expo-router", () => ({ useFocusEffect: vi.fn() }));
vi.mock("expo-camera", () => ({
  Camera: {
    getCameraPermissionsAsync: vi.fn(),
    requestCameraPermissionsAsync: vi.fn(),
  },
  CameraView: "CameraView",
}));

const { content, elements, style } =
  await import("./native-check-in-condition-test-support");
const { NativeRetrievalPanel } =
  await import("../src/retrieval/native-retrieval-panel");
const fixture = await import("./native-retrieval-panel-test-fixture");
const render = fixture.renderRetrieval;
const snapshot = fixture.retrievalSnapshot;
const session = fixture.retrievalSessionFixture;
const action = fixture.retrievalAction;

describe("MOB-013 Native Retrieval", () => {
  it.each([
    ["en", "Key Checkout", "K-9"],
    ["ar", "استلام المفتاح", "K-9"],
  ] as const)(
    "renders the key-checkout stage with the authoritative expected Key Slot in %s",
    (locale, title, key) => {
      const { nodes } = render("key-checkout", locale);
      expect(content(nodes)).toContain(title);
      expect(content(nodes)).toContain(key);
      const hero = nodes.find((node) => node.props.children === key)!;
      expect(style(hero)).toMatchObject({
        fontFamily: "Space Grotesk",
        fontSize: 48,
        textAlign: "center",
        writingDirection: "ltr",
      });
      expect(content(nodes)).toContain(
        locale === "ar" ? "أدخل رمز خانة المفتاح" : "Enter Key Slot Code",
      );
    },
  );

  it("requires Key Slot verification before exposing Start Retrieval", () => {
    const { nodes, retrieval } = render("key-checkout");
    expect(action(nodes, "Start Retrieval")).toBeUndefined();
    expect(retrieval.confirmKeySlot).not.toHaveBeenCalled();
  });

  it("treats key input as a candidate and keeps confirmation explicit", () => {
    const { nodes, retrieval } = render("key-checkout");
    const input = nodes.find((node) => node.type === "TextInput")!;
    (input.props.onChangeText as (value: string) => void)("K-9");
    expect(retrieval.enterKeySlot).toHaveBeenCalledWith("K-9");
    expect(retrieval.confirmKeySlot).not.toHaveBeenCalled();
    const explicit = render("key-checkout", "en", { keySlotCandidate: "K-9" });
    const verify = action(explicit.nodes, "Verify Key Slot")!;
    (verify.props.onPress as () => void)();
    expect(explicit.retrieval.confirmKeySlot).toHaveBeenCalledOnce();
  });

  it("exposes Start Retrieval only after the Key Slot is confirmed", () => {
    const { nodes, retrieval } = render("key-checkout", "en", {
      keyConfirmed: true,
    });
    const start = action(nodes, "Start Retrieval")!;
    (start.props.onPress as () => void)();
    expect(retrieval.startRetrieval).toHaveBeenCalledOnce();
  });

  it("blocks Back while Start Retrieval is in flight", () => {
    const { nodes } = render("submitting-start", "en", { keyConfirmed: true });
    expect(action(nodes, "Back")?.props).toMatchObject({ disabled: true });
    expect(action(nodes, "Starting Retrieval…")?.props).toMatchObject({
      disabled: true,
    });
  });

  it("sends Mark Ready from the retrieving stage and blocks Back while busy", () => {
    const { nodes, onBack } = render("submitting-ready");
    expect(action(nodes, "Marking Ready...")?.props).toMatchObject({
      disabled: true,
    });
    expect(action(nodes, "Back")).toBeUndefined();
    expect(content(nodes)).toContain("Retrieving");
    expect(onBack).not.toHaveBeenCalled();
  });

  it("keeps the plate in an LTR identifier island under Arabic RTL", () => {
    const { nodes } = render("key-checkout", "ar");
    expect(
      nodes.find((node) => node.type === "ScrollView")?.props
        .contentContainerStyle,
    ).toContainEqual({ direction: "rtl" });
    const plate = nodes.find(
      (node) => node.props.children === "Toyota Camry · 12-34567",
    )!;
    expect(style(plate)).toMatchObject({
      textAlign: "left",
      writingDirection: "ltr",
    });
  });

  it.each([
    ["ambiguous", "Retrieval result unknown"],
    ["conflict", "Retrieval work changed"],
    ["unavailable", "Unable to load Retrieval Task"],
  ] as const)(
    "presents the %s recovery state without a protected retry",
    (phase, title) => {
      const { nodes, retrieval } = render(phase);
      expect(content(nodes)).toContain(title);
      const check = action(nodes, "Check server state")!;
      (check.props.onPress as () => void)();
      expect(retrieval.checkServerState).toHaveBeenCalledOnce();
      expect(action(nodes, "Start Retrieval")).toBeUndefined();
    },
  );

  it("renders the elapsed card only for an authoritative retrievalStartedAt", () => {
    expect(content(render("retrieving").nodes)).not.toContain("Elapsed");
    const withStartedAt = render("retrieving", "en", {
      retrievalStartedAt: new Date(Date.now() - 65_000).toISOString(),
    });
    expect(content(withStartedAt.nodes)).toContain("Elapsed");
    expect(content(withStartedAt.nodes)).toMatch(/01:0[45]/);
  });

  it("renders Vehicle, Key and conditional Location rows", () => {
    const withLocation = content(render("retrieving").nodes);
    expect(withLocation).toContain("Vehicle");
    expect(withLocation).toContain("Key");
    expect(withLocation).toContain("Location");
    const withoutLocation = render("retrieving", "en", {
      session: {
        ...snapshot("retrieving").session!,
        parking: {
          ...session.parking,
          parkingSpotCode: null,
          parkingZoneCode: null,
        },
      },
      task: {
        ...snapshot("retrieving").task!,
        parkingSpot: null,
        parkingZone: null,
      },
    });
    expect(content(withoutLocation.nodes)).not.toContain("Location");
  });

  it("invokes the bounded Report Issue callback with session context", () => {
    const onReportIssue = vi.fn();
    const snap = snapshot("retrieving");
    const nodes = elements(
      NativeRetrievalPanel({
        auth: {} as never,
        locale: "en",
        onBack: vi.fn(),
        onReportIssue,
        retrieval: render("retrieving").retrieval as never,
        snapshot: snap,
      }),
    );
    (action(nodes, "Report Issue")!.props.onPress as () => void)();
    expect(onReportIssue).toHaveBeenCalledWith(snap.session!.sessionId);
  });
});
