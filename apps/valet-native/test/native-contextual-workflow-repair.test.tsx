import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import {
  handleNativeContextualSystemBack,
  nativeContextualNavigationPinned,
  nativeContextualRoute,
} from "../src/shell/native-contextual-route";
import { clearNativeContextualSessions } from "../src/shell/use-native-contextual-route";
import { retireNativeWorkflowScope } from "../src/shell/native-workflow-scope-retirement";
import { sessionId } from "./native-parity-11-test-fixture";

const origins = ["CHECK_IN", "PARKING", "RETRIEVAL", "HANDOFF"] as const;

describe("shell-contained contextual workflow repair", () => {
  it.each(origins)(
    "pins navigation and consumes Android Back for %s",
    (origin) => {
      const kind = origin === "CHECK_IN" ? "guest-access" : "incident";
      const route = nativeContextualRoute(kind, origin, sessionId);
      const close = vi.fn();

      expect(nativeContextualNavigationPinned(route)).toBe(true);
      expect(handleNativeContextualSystemBack(route, false, close)).toBe(true);
      expect(close).toHaveBeenCalledOnce();
    },
  );

  it("consumes but blocks Android Back during a protected mutation", () => {
    const route = nativeContextualRoute("incident", "PARKING", sessionId);
    const close = vi.fn();
    expect(handleNativeContextualSystemBack(route, true, close)).toBe(true);
    expect(close).not.toHaveBeenCalled();
    expect(handleNativeContextualSystemBack(null, false, close)).toBe(false);
  });

  it("clears only contextual owners and preserves held workflow authority", () => {
    const runtime = {
      checkIn: { clear: vi.fn() },
      guestAccess: { clear: vi.fn() },
      handoff: { clear: vi.fn() },
      incident: { clear: vi.fn() },
      parking: { clear: vi.fn() },
      retrieval: { clear: vi.fn() },
    };
    clearNativeContextualSessions(runtime as never);
    expect(runtime.incident.clear).toHaveBeenCalledOnce();
    expect(runtime.guestAccess.clear).toHaveBeenCalledOnce();
    expect(runtime.checkIn.clear).not.toHaveBeenCalled();
    expect(runtime.parking.clear).not.toHaveBeenCalled();
    expect(runtime.retrieval.clear).not.toHaveBeenCalled();
    expect(runtime.handoff.clear).not.toHaveBeenCalled();
  });

  it("purges Guest Access when authoritative workflow scope retires", () => {
    const clear = () => ({ clear: vi.fn() });
    const runtime = {
      checkIn: clear(),
      confirmParking: clear(),
      guestAccess: clear(),
      handoff: clear(),
      incident: clear(),
      parking: clear(),
      release: clear(),
      retrieval: clear(),
      shiftEnd: { fenceOperationalScope: vi.fn() },
      vehicleDirectory: clear(),
    };
    retireNativeWorkflowScope(runtime as never);
    expect(runtime.guestAccess.clear).toHaveBeenCalledOnce();
    expect(runtime.incident.clear).toHaveBeenCalledOnce();
    expect(runtime.shiftEnd.fenceOperationalScope).toHaveBeenCalledOnce();
  });

  it("keeps header and bottom nav around the contextual content without a full-screen Modal", () => {
    const workspace = readFileSync(
      new URL("../src/shell/native-production-workspace.tsx", import.meta.url),
      "utf8",
    );
    const surface = readFileSync(
      new URL("../src/shell/native-contextual-surface.tsx", import.meta.url),
      "utf8",
    );
    expect(workspace.indexOf("<EmployeeAppHeader")).toBeLessThan(
      workspace.indexOf("<NativeContextualSurface"),
    );
    expect(workspace.indexOf("<NativeContextualSurface")).toBeLessThan(
      workspace.indexOf("<NativeProductionNavigation"),
    );
    expect(workspace).toContain(
      "nativeContextualNavigationPinned(contextual.route)",
    );
    expect(surface).not.toMatch(/\bModal\b|presentationStyle="fullScreen"/u);
  });
});
