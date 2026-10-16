/**
 * Cold-start bootstrap telemetry tests (MOB-024A review fix #5).
 *
 * The closed vocabulary contains "cold-start" but nothing emitted it.
 * The truthful boundary is createNativeProductionBootstrap(): it runs
 * ONCE for the mounted production root because NativeProductionShell uses
 * a React useState LAZY INITIALIZER (verified: native-production-shell.tsx
 * `const [bootstrap] = useState(createNativeProductionBootstrap)`), which
 * it to own one bootstrap value — never recreating it on a re-render.
 *
 * That boundary is DISTINCT from the foreground/background events of
 * useNativeProductionLifecycle, which observe AppState transitions during
 * an already-running process. The test asserts ONE event per bootstrap
 * call; NO dedup state was added (a second direct call wires a fresh ring
 * and records its own single event).
 */
import { EMPLOYEE_TELEMETRY_CLASSIFICATIONS } from "@valet/employee-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The bootstrap imports the foreground location adapters, whose real Expo
// native module cannot initialize in Vitest's Node environment.
vi.mock("expo-location", () => ({ Accuracy: { High: 4 } }));

vi.mock("expo-application", () => ({
  get nativeApplicationVersion() {
    return "2.1.0";
  },
  get nativeBuildVersion() {
    return "321";
  },
}));
vi.mock("react-native", () => ({
  Platform: {
    get OS() {
      return "android";
    },
  },
  AppState: {
    currentState: "active",
    addEventListener: () => ({ remove: vi.fn() }),
  },
  StyleSheet: { create: (value: unknown) => value },
  Text: "Text",
  View: "View",
}));
vi.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: "WHEN_UNLOCKED_THIS_DEVICE_ONLY",
  deleteItemAsync: vi.fn(async () => undefined),
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => undefined),
}));
vi.mock("expo-file-system", () => ({
  File: class {
    get exists() {
      return false;
    }
    async text() {
      return "";
    }
    write() {}
  },
  Paths: { document: {} },
}));
vi.mock("expo-network", () => ({
  NetworkStateType: { CELLULAR: 2, NONE: 0, UNKNOWN: -1, WIFI: 1 },
  addNetworkStateListener: vi.fn(),
  getNetworkStateAsync: vi.fn(async () => ({ isConnected: true })),
}));

const { getNativeTelemetry, resetNativeTelemetryRegistryForTests } =
  await import("../src/telemetry/native-telemetry-owner");
const { nativeSupportDiagnosticsView } =
  await import("../src/telemetry/native-support-diagnostics");
const { createNativeProductionBootstrap } =
  await import("../src/shell/native-production-bootstrap");

const COLD_START = {
  classification: "cold-start",
  outcome: "success",
  source: "lifecycle",
} as const;

beforeEach(() => {
  resetNativeTelemetryRegistryForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
  resetNativeTelemetryRegistryForTests();
});

describe("cold-start bootstrap telemetry", () => {
  it("records exactly ONE lifecycle cold-start event per bootstrap call", () => {
    // createNativeProductionBootstrap wires its OWN bounded ring via
    // createNativeTelemetry() (installing the registry), so the event is
    // observed through the ambient registry — exactly like production.
    expect(() => createNativeProductionBootstrap()).not.toThrow();
    expect(getNativeTelemetry().snapshot().events).toEqual([COLD_START]);

    // The mounted production root owns one bootstrap and does not recreate
    // it on re-render. A second direct call inside this test wires a fresh ring and
    // records its own single event into it — exactly one per call, never
    // more than one per call, and never blocked by fake dedup state.
    expect(() => createNativeProductionBootstrap()).not.toThrow();
    expect(getNativeTelemetry().snapshot().events).toEqual([COLD_START]);
  });

  it("cold-start is in the closed vocabulary and the view renders it", () => {
    expect(EMPLOYEE_TELEMETRY_CLASSIFICATIONS.lifecycle).toContain(
      "cold-start",
    );
    const bootstrap = createNativeProductionBootstrap();
    // Without EXPO_PUBLIC_API_ORIGIN the runtime fails open to the
    // fatal-configuration bootstrap — cold-start is recorded BEFORE that,
    // proving the event is never gated on runtime construction.
    expect(bootstrap.auth).toBeDefined();
    expect(bootstrap.auth.phase).toBe("fatal");
    const view = nativeSupportDiagnosticsView(getNativeTelemetry().snapshot());
    expect(view.eventRows).toContain("lifecycle cold-start success");
  });
});
