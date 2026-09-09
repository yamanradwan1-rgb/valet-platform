import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path) => readFileSync(resolve(import.meta.dirname, path), "utf8");
const shell = read("../src/foundation/foundation-shell.tsx");

describe("Employee shell composition contract", () => {
  it("keeps protected operational owners behind authenticated runtime gates", () => {
    expect(
      shell.match(/snapshot\.phase === "authenticated"/g)?.length,
    ).toBeGreaterThanOrEqual(3);
    expect(shell).toContain("<NativeQrPanel");
    expect(shell).toContain("<NativeTasksPanel");
    expect(shell).toContain("<NativeCheckInPanel");
    expect(shell).toContain("key={snapshot.authGeneration}");
    expect(shell).toContain(
      "snapshot.authGeneration}:${operationalSnapshot.scope?.membershipId}",
    );
  });

  it("uses server-derived scope and the production Tasks/New vehicle hierarchy", () => {
    expect(shell).toContain("scope={operationalSnapshot.scope}");
    expect(shell).toContain("heading={presentation.copy.tasks}");
    expect(shell).toContain("headerAction={");
    expect(read("../src/check-in/native-check-in-panel.tsx")).toContain(
      "leading={<EmployeePlusIcon />}",
    );
  });

  it("keeps account, locale, scanner, and developer diagnostics reachable", () => {
    expect(shell).toContain("<LocaleButton");
    expect(shell).toContain("<NativeAuthPanel");
    expect(shell).toContain("<NativeQrPanel");
    expect(shell).toMatch(/__DEV__\s*\?\s*\(\s*<NativePocPanel/);
    expect(read("../src/auth/native-poc-panel.tsx")).toContain(
      'testID="native-poc-diagnostics-toggle"',
    );
  });

  it("does not fabricate unavailable Web navigation destinations", () => {
    for (const unsupported of [
      "EmployeeBottomNav",
      "ParkingTab",
      "RetrievalTab",
      "VehiclesTab",
      "ScanHubTab",
    ]) {
      expect(shell).not.toContain(unsupported);
    }
  });

  it("retains the reviewed modal and live close guard ownership", () => {
    const panel = read("../src/check-in/native-check-in-panel.tsx");
    expect(panel).toContain("onRequestClose={close}");
    expect(panel).toContain("const current = checkIn.current();");
    expect(panel).toContain(
      "checkInBackBlocked(current.phase, current.continuation?.mode)",
    );
    expect(panel).toContain(
      '<EmployeeFrame direction={locale === "ar" ? "rtl" : "ltr"}>',
    );
    expect(panel).toContain("<EmployeeAppHeader");
    expect(panel).toContain("scope={scope}");
    expect(panel).toContain("utilities={null}");
    expect(panel.indexOf("<EmployeeAppHeader")).toBeLessThan(
      panel.indexOf("<NativeCheckInWorkflow"),
    );
    expect(read("../src/check-in/native-check-in-primitives.tsx")).toContain(
      "<EmployeeBackHeader",
    );
  });

  it("uses one compact alternate-locale control without duplicating locale state", () => {
    expect(shell).toContain('locale === "en" ? "ar" : "en"');
    expect(shell.match(/<LocaleButton/g)).toHaveLength(1);
    expect(shell).not.toContain("FOUNDATION_LOCALES.map");
  });

  it("replaces the production facts card with the focused shift strip", () => {
    const tasks = read("../src/tasks/native-tasks-panel.tsx");
    const strip = read("../src/tasks/native-task-shift-strip.tsx");
    expect(tasks).toContain("<NativeTaskShiftStrip");
    expect(tasks).not.toContain("nativeOperationalFacts");
    expect(tasks).not.toContain("<Fact");
    expect(strip).toContain("scope.locationName");
    expect(strip).toContain("shiftStartedAt");
    expect(strip).toContain("nowLabel");
    for (const forbidden of [
      "organizationName",
      "role",
      "shiftId",
      "locationCode",
    ]) {
      expect(strip).not.toContain(forbidden);
    }
  });
});
