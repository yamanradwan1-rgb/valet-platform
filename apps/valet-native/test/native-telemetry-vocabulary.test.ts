/**
 * Native telemetry wired-vocabulary acceptance tests (MOB-024A).
 *
 * Split from native-telemetry-surfaces.test.ts to respect the 300-line
 * authored-file ceiling. These cases prove every classification the wired
 * surfaces emit is accepted by the closed portable vocabulary and lands in
 * the bounded ring.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EmployeeTelemetrySource } from "@valet/employee-client";

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
}));

const ownerModule = await import("../src/telemetry/native-telemetry-owner");

const {
  BoundedTelemetryBuffer,
  NativeTelemetryOwner,
  getNativeTelemetry,
  installNativeTelemetry,
  resetNativeTelemetryRegistryForTests,
} = ownerModule;

const provenance = {
  appBuild: "101",
  appVersion: "1.4.0",
  platform: "android",
} as const;

function wiredBuffer(): InstanceType<typeof BoundedTelemetryBuffer> {
  const buffer = new BoundedTelemetryBuffer();
  installNativeTelemetry(new NativeTelemetryOwner(buffer, provenance));
  return buffer;
}

beforeEach(() => {
  resetNativeTelemetryRegistryForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
  resetNativeTelemetryRegistryForTests();
});

describe("Native telemetry wired surfaces", () => {
  it("accepts every lifecycle/network classification from the closed vocabulary", () => {
    const buffer = wiredBuffer();
    const owner = getNativeTelemetry();
    for (const classification of ["foreground", "background", "cold-start"]) {
      owner.record({ classification, outcome: "success", source: "lifecycle" });
    }
    for (const status of ["offline", "online", "unknown"]) {
      owner.record({
        classification: status,
        outcome: status === "offline" ? "error" : "success",
        source: "network",
      });
    }
    expect(buffer.size).toBe(6);
    expect(buffer.current().map((value) => value.source)).toEqual([
      "lifecycle",
      "lifecycle",
      "lifecycle",
      "network",
      "network",
      "network",
    ]);
  });

  it("accepts the wired push, recovery and auth classifications", () => {
    const buffer = wiredBuffer();
    const owner = getNativeTelemetry();
    const groups: ReadonlyArray<
      readonly [EmployeeTelemetrySource, readonly string[]]
    > = [
      [
        "push",
        [
          "registration-confirmed",
          "registration-unavailable",
          "permission-denied",
          "channel-unavailable",
        ],
      ],
      [
        "recovery",
        [
          "reserved",
          "found",
          "retired",
          "unknown",
          "unavailable",
          "invalidated",
        ],
      ],
      ["auth", ["login", "refresh", "logout", "restore", "invalidated"]],
    ];
    let expected = 0;
    for (const [source, classifications] of groups) {
      for (const classification of classifications) {
        owner.record({ classification, outcome: "error", source });
        expected += 1;
      }
    }
    expect(buffer.size).toBe(expected);
  });

  it("sanitizes an unsafe errorCode before it can reach the ring", () => {
    const buffer = wiredBuffer();
    getNativeTelemetry().record({
      classification: "login",
      errorCode: "code with spaces\nand newline",
      outcome: "error",
      source: "auth",
    });
    expect(buffer.current()).toEqual([
      { classification: "login", outcome: "error", source: "auth" },
    ]);
  });
});
