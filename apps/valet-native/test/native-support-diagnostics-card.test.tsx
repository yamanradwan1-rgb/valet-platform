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

const detailedRotationCode =
  "OCR_CAPTURE_METADATA_ROTATION_MISMATCH_SEQ_PR90_EO6_ET1_ER0_CX90_P4032x3024_J4032x3024_O4032x3024_RQ0_JQ1";

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

  it("renders the complete bounded one-shot rotation diagnostic on one event line", () => {
    wiredRing();
    getNativeTelemetry().record({
      classification: "capture-unavailable",
      errorCode: detailedRotationCode,
      outcome: "error",
      source: "ocr",
    });

    const nodes = elements(
      NativeShiftDiagnosticsCard({ locale: "en", textAlign: "left" }),
    );
    expect(visibleText(nodes[0])).toContain(
      `ocr capture-unavailable error ${detailedRotationCode}`,
    );
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

  it("pins three independent last-completed summaries above build and all 200 event rows", () => {
    const ring = wiredRing();
    const owner = getNativeTelemetry();
    const incident = owner.pinned.begin("incident");
    owner.pinned.stage("incident", incident, "secure-uuid", "error");
    owner.pinned.complete("incident", incident, "failed", "not-attempted");
    const photo = owner.pinned.begin("photo");
    owner.pinned.stage("photo", photo, "photo-handle-uuid", "error");
    owner.pinned.complete("photo", photo, "failed", "not-attempted");
    const crypto = owner.pinned.begin("crypto");
    owner.pinned.stage("crypto", crypto, "get-random-values", "missing");
    owner.pinned.complete("crypto", crypto, "failed", "not-attempted");
    for (let n = 0; n < 260; n += 1)
      owner.record({ source: "http", operation: "task-queue",
        classification: "response", outcome: "success" });
    expect(ring.size).toBe(200);

    const en = visibleText(elements(NativeShiftDiagnosticsCard({
      locale: "en", textAlign: "left",
    }))[0]);
    for (const title of ["Last incident diagnostic", "Last condition photo diagnostic",
      "Native crypto capability"])
      expect(en).toContain(title);
    expect(en.indexOf("Last incident diagnostic")).toBeLessThan(en.indexOf("App version"));
    expect(en.indexOf("Last condition photo diagnostic")).toBeLessThan(en.indexOf("Event count"));
    expect(en.indexOf("Native crypto capability")).toBeLessThan(en.indexOf("Event count"));
    expect(en).toContain("secure-uuid");
    expect(en).toContain("photo-handle-uuid");
    const ar = visibleText(elements(NativeShiftDiagnosticsCard({
      locale: "ar", textAlign: "right",
    }))[0]);
    expect(ar).toContain("آخر تشخيص للحوادث");
    expect(ar).toContain("آخر تشخيص لصورة الحالة");
    expect(ar).toContain("قدرات التشفير الأصلية");
  });
});
