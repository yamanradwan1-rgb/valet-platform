import { describe, expect, it } from "vitest";

import { isValidEmployeeTelemetryOperation } from "./employee-telemetry-classification";
import {
  EMPLOYEE_TELEMETRY_OPERATIONS,
  type EmployeeTelemetryEvent,
  type EmployeeTelemetryOperation,
} from "./employee-telemetry-types";

describe("closed operation vocabulary (Finding #1)", () => {
  it.each(EMPLOYEE_TELEMETRY_OPERATIONS)("accepts listed %s", (operation) => {
    expect(isValidEmployeeTelemetryOperation(operation)).toBe(true);
  });

  it("has no free-form operation channel at compile time", () => {
    const valid: EmployeeTelemetryOperation = "task-accept";
    expect(valid).toBe("task-accept");

    // @ts-expect-error — not in the closed table, must not typecheck.
    const invalid: EmployeeTelemetryOperation = "definitely-not-a-route-family";
    expect(invalid).toBe("definitely-not-a-route-family");

    const invalidEvent: EmployeeTelemetryEvent = {
      classification: "response",
      // @ts-expect-error — the public event contract is bounded too.
      operation: "raw/path/is-not-an-operation",
      outcome: "error",
      source: "http",
    };
    expect(invalidEvent.operation).toBe("raw/path/is-not-an-operation");
  });
});
