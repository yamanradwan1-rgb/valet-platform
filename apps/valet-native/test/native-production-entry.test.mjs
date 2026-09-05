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

  it("reuses the existing check-in workflow without duplicating intake", () => {
    const route = read("src/shell/native-check-in-route.tsx");
    expect(route).toContain("NativeCheckInWorkflow");
    expect(route).toContain(
      "checkIn.activate(identityGeneration, scope.locationId)",
    );
  });

  it("keeps unavailable future tabs disabled in this slice", () => {
    const navigation = read("src/shell/native-production-navigation.tsx");
    expect(navigation).toContain('item.destination === "tasks"');
    expect(navigation).toContain("disabled={!enabled}");
  });
});
