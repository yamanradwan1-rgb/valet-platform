import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Native active shell layering repair", () => {
  it("orders offline banner, header, whole-frame alert, content, then navigation", () => {
    const workspace = readFileSync(
      new URL("../src/shell/native-production-workspace.tsx", import.meta.url),
      "utf8",
    );
    const banner = workspace.indexOf("<NativeConnectivityBanner");
    const header = workspace.indexOf("<EmployeeAppHeader");
    const alert = workspace.indexOf("<NativeRetrievalAttention");
    const content = workspace.indexOf('testID="native-production-shell"');
    const navigation = workspace.indexOf("<NativeProductionNavigation");

    expect(banner).toBeGreaterThan(0);
    expect(banner).toBeLessThan(header);
    expect(header).toBeLessThan(alert);
    expect(alert).toBeLessThan(content);
    expect(content).toBeLessThan(navigation);
  });

  it("anchors top-80 alerts to an explicit relative EmployeeFrame", () => {
    const frame = readFileSync(
      new URL("../src/employee-ui/employee-frame.tsx", import.meta.url),
      "utf8",
    );
    const workspace = readFileSync(
      new URL("../src/shell/native-production-workspace.tsx", import.meta.url),
      "utf8",
    );
    const attention = readFileSync(
      new URL("../src/tasks/native-retrieval-attention.tsx", import.meta.url),
      "utf8",
    );

    expect(frame).toMatch(/frame:\s*\{[\s\S]*position: "relative"/u);
    expect(attention).toMatch(/stack:\s*\{[\s\S]*top: 80/u);
    expect(attention).toMatch(/left: space\.lg[\s\S]*right: space\.lg/u);
    expect(workspace.indexOf("<NativeRetrievalAttention")).toBeLessThan(
      workspace.indexOf('testID="native-production-shell"'),
    );
    expect(workspace).not.toMatch(
      /testID="native-production-shell"[\s\S]*<NativeRetrievalAttention/u,
    );
  });
});
