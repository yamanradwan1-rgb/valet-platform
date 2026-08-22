import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  EmployeeAccessGate,
  type EmployeeAccessPhase,
} from "./employee-access-gate";
import {
  EmployeeOperationalGate,
} from "./employee-operational-gate";

const fabricatedStrings = [
  "Mohammed Khalil",
  "Four Seasons Amman",
  "Main Entrance",
  "Start Shift",
  "Change Location",
];

describe("EmployeeAccessGate truthful states", () => {
  const phases: EmployeeAccessPhase[] = [
    "initializing",
    "refresh-unavailable",
    "unauthenticated",
  ];

  it.each(phases)(
    "renders no fabricated persona/location/zone for phase %s",
    (phase) => {
      const markup = renderToStaticMarkup(
        <EmployeeAccessGate onLogin={vi.fn()} phase={phase} />,
      );
      for (const fabricated of fabricatedStrings) {
        expect(markup).not.toContain(fabricated);
      }
    },
  );

  it("renders a neutral loading state while initializing with no actions", () => {
    const markup = renderToStaticMarkup(
      <EmployeeAccessGate onLogin={vi.fn()} phase="initializing" />,
    );
    expect(markup).toContain("Checking staff session");
    expect(markup).not.toContain("Sign In");
    expect(markup).not.toContain("Retry");
  });

  it("renders a retryable outage state for transient refresh unavailability", () => {
    const markup = renderToStaticMarkup(
      <EmployeeAccessGate
        onLogin={vi.fn()}
        phase="refresh-unavailable"
        restoreMessage="Staff sign-in service is temporarily unavailable."
      />,
    );
    expect(markup).toContain("Connection issue");
    expect(markup).toContain(
      "Staff sign-in service is temporarily unavailable.",
    );
    expect(markup).toContain("Retry");
    expect(markup).not.toContain("Sign In");
  });

  it("renders a real sign-in form with credentials fields for the unauthenticated state", () => {
    const markup = renderToStaticMarkup(
      <EmployeeAccessGate onLogin={vi.fn()} phase="unauthenticated" />,
    );
    expect(markup).toContain("Staff sign in");
    expect(markup).toContain("Work email");
    expect(markup).toContain("Password");
    expect(markup).toContain("Sign In");
    expect(markup).not.toContain("Retry");
  });
});

describe("EmployeeOperationalGate truthful states", () => {
  it("renders a neutral loading state without operational claims", () => {
    const markup = renderToStaticMarkup(
      <EmployeeOperationalGate model={{ kind: "LOADING" }} />,
    );
    expect(markup).toContain("Preparing your operational view");
    expect(markup).not.toContain("No active shift");
    expect(markup).not.toContain("Start Shift");
  });

  it("states NO_ACTIVE_SHIFT truthfully and offers only refresh/sign-out", () => {
    const markup = renderToStaticMarkup(
      <EmployeeOperationalGate
        model={{ kind: "NO_ACTIVE_SHIFT" }}
        onRetry={vi.fn()}
        onSignOut={vi.fn()}
      />,
    );
    expect(markup).toContain("No active shift");
    expect(markup).toContain("Refresh status");
    expect(markup).toContain("Sign Out");
    for (const fabricated of ["Mohammed Khalil", "Zone", "Start Shift"]) {
      expect(markup).not.toContain(fabricated);
    }
  });

  it("fails closed with an explicit multi-shift explanation for ambiguous shifts", () => {
    const markup = renderToStaticMarkup(
      <EmployeeOperationalGate
        model={{ count: 3, kind: "AMBIGUOUS_ACTIVE_SHIFTS" }}
        onRetry={vi.fn()}
        onSignOut={vi.fn()}
      />,
    );
    expect(markup).toContain("Multiple active shifts");
    expect(markup).toContain("3 active shifts were found");
    expect(markup).toContain("locked until only one active shift remains");
    expect(markup).not.toContain("Task Queue");
  });

  it("renders a recoverable context error state with Retry and the error message", () => {
    const markup = renderToStaticMarkup(
      <EmployeeOperationalGate
        model={{
          kind: "CONTEXT_ERROR",
          message: "Operational context request failed.",
        }}
        onRetry={vi.fn()}
        onSignOut={vi.fn()}
      />,
    );
    expect(markup).toContain("Could not load operational context");
    expect(markup).toContain("Operational context request failed.");
    expect(markup).toContain("Retry");
  });
});
