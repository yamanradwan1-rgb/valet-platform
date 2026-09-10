import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path) =>
  readFileSync(resolve(import.meta.dirname, `../src/${path}`), "utf8");

const productionPresentation = [
  "employee-ui/employee-back-header.tsx",
  "employee-ui/employee-feedback.tsx",
  "employee-ui/employee-frame.tsx",
  "shell/native-active-header-utilities.tsx",
  "shell/native-gate-primitives.tsx",
  "shell/native-production-navigation.tsx",
  "tasks/native-task-queue-row.tsx",
  "tasks/native-task-queue-row-styles.ts",
  "tasks/native-task-shift-strip.tsx",
  "tasks/native-retrieval-attention.tsx",
  "check-in/native-check-in-identity-context.tsx",
  "check-in/native-check-in-parking-task-step.tsx",
  "parking/native-active-parking-panel.tsx",
  "parking/native-parking-key-return-step.tsx",
  "parking/native-parking-success.tsx",
  "retrieval/native-retrieval-details.tsx",
  "incident/native-incident-screen.tsx",
  "guest-access/native-guest-access-status-card.tsx",
  "guest-access/native-guest-access-confirm-sheet.tsx",
  "shift/native-shift-summary-details.tsx",
];

describe("Native RTL structural closure", () => {
  it("uses locale direction at the Employee frame root", () => {
    const frame = read("employee-ui/employee-frame.tsx");
    expect(frame).toContain("{ direction }");
    expect(frame).toContain('testID="employee-frame"');
  });

  it("has no manual row reversal beneath the root direction owner", () => {
    for (const path of productionPresentation) {
      expect(read(path), path).not.toContain("row-reverse");
    }
  });

  it("keeps the fixed Web back and task chevron concepts", () => {
    expect(read("employee-ui/employee-action-icons.tsx")).toContain(
      "return <EmployeeChevronLeftIcon",
    );
    expect(read("tasks/native-task-queue-row.tsx")).toContain(
      "<EmployeeChevronRightIcon",
    );
  });

  it("keeps Web array order and lets root direction mirror shell rows", () => {
    const navigation = read("shell/native-production-navigation.tsx");
    expect(navigation.indexOf('destination: "tasks"')).toBeLessThan(
      navigation.indexOf('destination: "vehicles"'),
    );
    expect(navigation.indexOf('destination: "vehicles"')).toBeLessThan(
      navigation.indexOf('destination: "scan"'),
    );
    expect(navigation.indexOf('destination: "scan"')).toBeLessThan(
      navigation.indexOf('destination: "shift"'),
    );
  });

  it("isolates mixed operational identifiers from human text", () => {
    for (const path of [
      "employee-ui/employee-frame.tsx",
      "check-in/native-check-in-identity-context.tsx",
      "retrieval/native-retrieval-details.tsx",
      "handoff/native-handoff-vehicle.tsx",
      "incident/native-incident-screen.tsx",
      "shift/native-shift-summary-details.tsx",
    ]) {
      expect(read(path), path).toContain('employeeTextStyle("identifier"');
    }
    expect(read("parking/native-parking-confirm-styles.ts")).toContain(
      'writingDirection: "ltr"',
    );
    expect(read("employee-ui/employee-fields.tsx")).toContain(
      'direction: "ltr"',
    );
  });

  it("keeps the compact EN / عربي locale composition", () => {
    const toggle = read("shell/native-gate-primitives.tsx");
    expect(toggle).toContain('label="EN"');
    expect(toggle).toContain('label="عربي"');
    expect(toggle).toContain('accessibilityRole="radiogroup"');
  });
});
