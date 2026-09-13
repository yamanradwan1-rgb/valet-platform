/**
 * Shift diagnostics CARD tests (MOB-024A review fix #4).
 *
 * Proves the sanitized snapshot has a real production access path: the
 * card mounts at the bottom of the shift screen, pulls the snapshot itself
 * through the ambient registry, renders bounded rows, and records nothing.
 * Pure view-builder cases live in native-support-diagnostics.test.ts.
 *
 * Component pattern: the established repo approach (see
 * employee-ui-feedback.test.tsx / native-active-shift-panel.test.tsx) —
 * mock react-native primitives, invoke the component as a function, and
 * walk the element tree, expanding function components by invocation.
 */
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  StyleSheet: { create: (value: unknown) => value },
  Text: "Text",
  View: "View",
}));

const {
  BoundedTelemetryBuffer,
  NativeTelemetryOwner,
  getNativeTelemetry,
  installNativeTelemetry,
  resetNativeTelemetryRegistryForTests,
} = await import("../src/telemetry/native-telemetry-owner");
const { NativeShiftDiagnosticsCard } =
  await import("../src/shift/native-shift-diagnostics-card");

const provenance = {
  appBuild: "321",
  appVersion: "2.1.0",
  platform: "android",
} as const;

type Element = ReactElement<Record<string, unknown>>;

function elements(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element;
  if (typeof node.type === "function") {
    return elements((node.type as (props: unknown) => unknown)(node.props));
  }
  return [node, ...elements(node.props.children)];
}

function visibleText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number")
    return String(value);
  if (Array.isArray(value)) return value.map(visibleText).join(" ");
  if (!value || typeof value !== "object" || !("props" in value)) return "";
  const node = value as Element;
  if (typeof node.type === "function") {
    return visibleText((node.type as (props: unknown) => unknown)(node.props));
  }
  return visibleText(node.props.children);
}

function wiredRing() {
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

describe("shift diagnostics card", () => {
  it("renders bounded provenance rows and recent events with a testID", () => {
    wiredRing();
    getNativeTelemetry().record({
      classification: "response",
      operation: "task-queue",
      outcome: "success",
      requestId: "request-id-abc",
      source: "http",
    });
    const nodes = elements(
      NativeShiftDiagnosticsCard({ locale: "en", textAlign: "left" }),
    );
    const text = visibleText(nodes[0]);
    expect(text).toContain("Support diagnostics");
    expect(text).toContain("App version");
    expect(text).toContain("2.1.0");
    expect(text).toContain("App build");
    expect(text).toContain("321");
    expect(text).toContain("Platform");
    expect(text).toContain("android");
    expect(text).toContain("Event count");
    expect(text).toContain("http response task-queue success request-id-abc");
    expect(
      nodes.some(
        (node) => node.props.testID === "native-shift-diagnostics-events",
      ),
    ).toBe(true);
    // No timestamps exist in events; none are invented.
    expect(text).not.toMatch(/20\d\d-\d\d-\d\dT/);
  });

  it("renders bounded rows with an unwired (noop) registry and no events block", () => {
    const nodes = elements(
      NativeShiftDiagnosticsCard({ locale: "en", textAlign: "left" }),
    );
    const text = visibleText(nodes[0]);
    expect(text).toContain("Event count");
    expect(text).toContain("0");
    expect(
      nodes.some(
        (node) => node.props.testID === "native-shift-diagnostics-events",
      ),
    ).toBe(false);
    expect(text).not.toContain("undefined");
  });

  it("is read-only: rendering records no telemetry and mutates no ring", () => {
    const buffer = wiredRing();
    const before = buffer.current().length;
    elements(NativeShiftDiagnosticsCard({ locale: "ar", textAlign: "right" }));
    expect(buffer.current().length).toBe(before);
    expect(buffer.size).toBe(before);
  });

  it("renders the narrow support surface in Arabic on an Arabic shift", () => {
    wiredRing();
    const text = visibleText(
      elements(
        NativeShiftDiagnosticsCard({ locale: "ar", textAlign: "right" }),
      )[0],
    );
    expect(text).toContain("تشخيصات الدعم");
    expect(text).toContain("إصدار التطبيق");
    expect(text).toContain("عدد الأحداث");
    expect(text).not.toContain("Support diagnostics");
  });
});
