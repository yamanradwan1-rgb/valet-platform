import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

describe("Native production entry contract", () => {
  it("uses the production shell instead of the foundation POC composition", () => {
    const entry = read("app/index.tsx");
    expect(entry).toContain("NativeProductionShell");
    expect(entry).not.toContain("FoundationShell");
  });

  it("does not expose development panels as a production destination", () => {
    const shell = read("src/shell/native-production-shell.tsx");
    const controller = read("src/shell/production-shell-controller.ts");
    expect(shell).not.toContain("NativePocPanel");
    expect(shell).not.toContain("NativeQrPanel");
    expect(controller).not.toContain('"development-poc" |');
  });

  it("keeps the Scan Hub a launcher with no camera or scanner architecture", () => {
    const screen = read("src/scan/native-scan-hub-screen.tsx");
    const gates = read("src/scan/native-scan-hub-gates.ts");
    for (const forbidden of [
      "expo-camera",
      "../scanner",
      "BarcodeDetector",
      "getUserMedia",
      "Simulate",
    ]) {
      expect(`${screen}\n${gates}`).not.toContain(forbidden);
    }
  });

  it("reuses the existing check-in workflow without duplicating intake", () => {
    const route = read("src/shell/native-check-in-route.tsx");
    expect(route).toContain("NativeCheckInWorkflow");
    expect(route).toContain("checkIn.activate(");
    expect(route).toContain("identityGeneration,");
    expect(route).toContain("scope.locationId,");
    expect(route).toContain("workflowOwner");
  });

  it("activates truthful Vehicles and the real Scan destination", () => {
    const navigation = read("src/shell/native-production-navigation.tsx");
    expect(navigation).toContain("nativeProductionDestinationAvailability");
    expect(navigation).toMatch(/scan:\s*true/);
    expect(navigation).toMatch(/vehicles:\s*true/);
    expect(navigation).toContain("disabled={!enabled}");
  });

  it("does not expose active-shell logout or placeholder future routes", () => {
    const workspace = read("src/shell/native-production-workspace.tsx");
    const detachedShift = read("src/shift/native-shift-detached-screen.tsx");
    const controller = read("src/shell/production-shell-controller.ts");

    expect(workspace).not.toContain("NativeAuthPanel");
    expect(detachedShift).not.toContain("NativeAuthPanel");
    expect(workspace).not.toContain("NativeLocaleButton");
    expect(detachedShift).not.toContain("NativeLocaleButton");
    expect(controller).not.toContain('case "vehicles"');
    expect(controller).not.toContain('case "scan"');
    expect(workspace).toContain('destination === "vehicles"');
    expect(workspace).toContain('destination === "scan"');
    expect(workspace).toContain("NativeScanHubScreen");
    expect(workspace.indexOf('destination === "scan"')).toBeLessThan(
      workspace.indexOf("<NativeTasksPanel"),
    );
  });

  it("matches the Employee Web dark-gate logo without a white capsule", () => {
    const gate = read("src/shell/native-gate-shell.tsx");
    const sharedLogo = read("src/employee-ui/employee-brand-logo.tsx");
    const nativeLogo = readFileSync(
      resolve(root, "assets/brand/VAYLET_Logo_Dark_Background.png"),
    );
    const webLogo = readFileSync(
      resolve(root, "../valet/public/brand/VAYLET_Logo_Dark_Background.png"),
    );
    expect(gate).toContain("EmployeeBrandLogo");
    expect(gate).toContain('surface="dark"');
    expect(sharedLogo).toContain("VAYLET_Logo_Dark_Background.png");
    expect(sharedLogo).toContain("VAYLET_Logo_Light_Background.png");
    expect(sharedLogo).toContain("fadeDuration={0}");
    expect(gate).not.toContain("VAYLET_Logo_Light_Background.png");
    expect(gate).not.toContain("logoSurface");
    expect(nativeLogo.equals(webLogo)).toBe(true);
  });

  it("leaves check-in purge ownership with the production shell", () => {
    const route = read("src/shell/native-check-in-route.tsx");
    const shell = read("src/shell/native-production-shell.tsx");
    const retirement = read("src/shell/native-workflow-scope-retirement.ts");
    expect(route).not.toContain("return () => checkIn.clear()");
    expect(shell).toContain("currentWorkflowPurgeRevision");
    expect(shell).toContain("retireNativeWorkflowScope(runtime)");
    expect(retirement).toContain("runtime.checkIn.clear()");
    expect(retirement).toContain("runtime.guestAccess.clear()");
  });
});
