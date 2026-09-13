import { describe, expect, it, vi } from "vitest";

import {
  ConsoleOperationObserver,
  formatOperationMeasurement,
} from "../src/common/observability/console-operation-observer";
import type {
  OperationMeasurement,
  OperationObserver,
} from "../src/common/observability/operation-observability";

function successMeasurement(
  overrides: Partial<OperationMeasurement> = {},
): OperationMeasurement {
  return {
    durationMs: 17,
    operation: "CHECK_IN_CREATE",
    outcome: "SUCCESS",
    requestId: "request-123",
    ...overrides,
  };
}

function errorMeasurement(
  overrides: Partial<OperationMeasurement> = {},
): OperationMeasurement {
  return {
    durationMs: 42,
    errorCode: "GUEST_ACCESS_INVALID",
    operation: "CHECK_IN_CREATE",
    outcome: "ERROR",
    requestId: "request-123",
    ...overrides,
  };
}

function captureLoggerLines(observer: ConsoleOperationObserver): {
  lines: string[];
  restore: () => void;
} {
  const lines: string[] = [];
  const logger = (
    observer as unknown as { logger: { log: (line: string) => void } }
  ).logger;
  const spy = vi.spyOn(logger, "log").mockImplementation((line: string) => {
    lines.push(line);
  });
  return { lines, restore: () => spy.mockRestore() };
}

describe("formatOperationMeasurement", () => {
  it("formats one success line with all contract fields and no errorCode token", () => {
    expect(formatOperationMeasurement(successMeasurement())).toBe(
      "OPERATION operation=CHECK_IN_CREATE outcome=SUCCESS requestId=request-123 durationMs=17",
    );
  });

  it("appends the mapped errorCode for error measurements", () => {
    expect(formatOperationMeasurement(errorMeasurement())).toBe(
      "OPERATION operation=CHECK_IN_CREATE outcome=ERROR requestId=request-123 durationMs=42 errorCode=GUEST_ACCESS_INVALID",
    );
  });

  it("omits empty-string errorCode instead of emitting an empty token", () => {
    const formatted = formatOperationMeasurement(
      errorMeasurement({ errorCode: "" }),
    );
    expect(formatted).not.toContain("errorCode=");
  });

  it("never leaks undefined or null into the rendered line", () => {
    const formatted = formatOperationMeasurement(successMeasurement());
    expect(formatted).not.toMatch(/undefined|null/);
  });

  it("contains only measurement contract fields, not arbitrary payloads", () => {
    const measurement = Object.assign(
      successMeasurement({ durationMs: 5, operation: "PLATE_READ" }),
      {
        extraPayload: { secret: "should-not-appear" },
        note: "arbitrary enrichment material",
      },
    ) as OperationMeasurement;

    const formatted = formatOperationMeasurement(measurement);

    expect(formatted).toBe(
      "OPERATION operation=PLATE_READ outcome=SUCCESS requestId=request-123 durationMs=5",
    );
    expect(formatted).not.toContain("should-not-appear");
    expect(formatted).not.toContain("arbitrary enrichment material");
  });

  it("collapses control characters so fields cannot forge extra log lines", () => {
    const formatted = formatOperationMeasurement(
      successMeasurement({ operation: "FAKE\n1 operation=outcome=ERROR" }),
    );
    expect(formatted).toBe(
      "OPERATION operation=FAKE1 operation=outcome=ERROR outcome=SUCCESS requestId=request-123 durationMs=17",
    );
    expect(formatted).not.toContain("\n");
  });

  it("returns a bounded line when measurement fields cannot be read", () => {
    const hostile: OperationMeasurement = {
      get durationMs(): number {
        throw new Error("getter exploded");
      },
      operation: "HOSTILE",
      outcome: "ERROR",
      requestId: "request-123",
    };

    expect(formatOperationMeasurement(hostile)).toBe(
      "OPERATION formatting-failed",
    );
  });
});

describe("ConsoleOperationObserver", () => {
  it("uses the neutral global observability logger context", () => {
    const observer = new ConsoleOperationObserver();
    const logger = (observer as unknown as { logger: { context?: string } })
      .logger;
    expect(logger.context).toBe("OperationObservability");
  });

  it("emits exactly one console line per measurement through the logger", () => {
    const observer = new ConsoleOperationObserver();
    const { lines, restore } = captureLoggerLines(observer);

    observer.observe(successMeasurement());

    expect(lines).toEqual([
      "OPERATION operation=CHECK_IN_CREATE outcome=SUCCESS requestId=request-123 durationMs=17",
    ]);
    restore();
  });

  it("emits one error line including the mapped errorCode", () => {
    const observer = new ConsoleOperationObserver();
    const { lines, restore } = captureLoggerLines(observer);

    observer.observe(errorMeasurement());

    expect(lines).toEqual([
      "OPERATION operation=CHECK_IN_CREATE outcome=ERROR requestId=request-123 durationMs=42 errorCode=GUEST_ACCESS_INVALID",
    ]);
    restore();
  });

  it("satisfies the OperationObserver contract", () => {
    const observer: OperationObserver = new ConsoleOperationObserver();
    expect(typeof observer.observe).toBe("function");
  });

  it("never throws when measurement field access throws", () => {
    const observer = new ConsoleOperationObserver();
    const { restore } = captureLoggerLines(observer);
    const hostile: OperationMeasurement = {
      get durationMs(): number {
        throw new Error("getter exploded");
      },
      operation: "HOSTILE",
      outcome: "ERROR",
      requestId: "request-123",
    };

    expect(() => observer.observe(hostile)).not.toThrow();
    restore();
  });

  it("never throws when the logger itself fails", () => {
    const observer = new ConsoleOperationObserver();
    const logger = (
      observer as unknown as { logger: { log: (line: string) => void } }
    ).logger;
    const spy = vi.spyOn(logger, "log").mockImplementation(() => {
      throw new Error("console unavailable");
    });

    expect(() => observer.observe(successMeasurement())).not.toThrow();
    spy.mockRestore();
  });
});
