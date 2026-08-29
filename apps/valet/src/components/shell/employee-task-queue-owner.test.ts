import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("Employee task queue polling ownership", () => {
  it("keeps one app-shell useTaskQueue owner and no screen-owned loop", () => {
    const employeeApp = source("../employee-app.tsx");
    const taskQueueScreen = source("../screens/task-queue-screen.tsx");
    const owners = employeeApp.match(/useTaskQueue\s*\(/gu) ?? [];

    expect(owners).toHaveLength(1);
    expect(taskQueueScreen).not.toMatch(/useTaskQueue\s*\(/u);
    expect(taskQueueScreen).toContain("taskQueue?.tasks");
  });
});
