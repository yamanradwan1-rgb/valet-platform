import { describe, expect, it, vi } from "vitest";

import { parseResourceQr } from "./qr-resource-payload";
import { QrScanSession } from "./qr-scan-session";
import type { CameraEnvironmentProbe } from "./camera-environment";

const SUPPORTED: CameraEnvironmentProbe = {
  hasMediaDevices: true,
  isSecureContext: true,
};

/**
 * Harness whose openCamera() returns a promise the test resolves/rejects
 * manually — for stale-start cancellation coverage (DEC-067 §3): close(),
 * accepted decodes and newer lifecycles must invalidate an in-flight start
 * so its eventually-returned decoder handle is stopped and can never
 * reactivate the camera or revert the phase to scanning.
 */
function makeDeferredHarness() {
  const trackStops = [vi.fn<() => void>(), vi.fn<() => void>()];
  const stream = {
    getTracks: () => trackStops.map((stop) => ({ stop })),
  };
  const phases: string[] = [];
  const failures: string[] = [];
  const rejections: string[] = [];
  const accepted: string[] = [];

  interface PendingOpen {
    onText: (text: string) => void;
    resolve: (handle: { stop(): void }) => void;
    reject: (error: unknown) => void;
    stop: () => void;
  }
  const opens: PendingOpen[] = [];

  const session = new QrScanSession<string>({
    interpret: (text) => {
      const parsed = parseResourceQr(text, "key-slot");
      return parsed.ok
        ? { ok: true, value: parsed.payload.resourceCode }
        : { ok: false, reason: parsed.reason };
    },
    openCamera: (onText) =>
      new Promise((resolve, reject) => {
        opens.push({
          onText,
          resolve,
          reject,
          stop: vi.fn<() => void>(),
        });
      }),
    onAccepted: (value) => {
      accepted.push(value);
    },
    onFailure: (state) => {
      failures.push(state);
    },
    onPhase: (phase) => {
      phases.push(phase);
    },
    onRejected: (reason) => {
      rejections.push(reason);
    },
    previewStream: () => stream,
    probeEnvironment: () => SUPPORTED,
  });

  const flush = (): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, 0));

  return {
    accepted,
    failures,
    flush,
    latestOpen: (): PendingOpen => {
      const open = opens[opens.length - 1];
      if (open === undefined) throw new Error("no open attempt recorded");
      return open;
    },
    openAt: (index: number): PendingOpen => {
      const open = opens[index];
      if (open === undefined) throw new Error(`no open attempt #${index}`);
      return open;
    },
    openCount: (): number => opens.length,
    phases,
    rejections,
    session,
    trackStops,
  };
}

describe("QrScanSession stale startup cancellation (DEC-067 §3)", () => {
  it("close() while openCamera is pending stops the late handle exactly once and never reaches scanning", async () => {
    const h = makeDeferredHarness();
    void h.session.begin();
    expect(h.phases).toEqual(["starting"]);

    const stale = h.latestOpen();
    h.session.close();
    expect(h.phases).toEqual(["starting", "idle"]);
    stale.resolve({ stop: stale.stop });
    await h.flush();

    expect(stale.stop).toHaveBeenCalledTimes(1);
    for (const stop of h.trackStops) {
      expect(stop.mock.calls.length).toBeGreaterThan(0);
    }
    expect(h.session.getPhase()).toBe("idle");
    expect(h.phases).not.toContain("scanning");
    expect(h.failures).toEqual([]);
    expect(h.accepted).toEqual([]);
  });

  it("an accepted decode during a pending start delivers once, invalidates the start, and stays suppressed+idle", async () => {
    const h = makeDeferredHarness();
    void h.session.begin();
    expect(h.phases).toEqual(["starting"]);

    const pending = h.latestOpen();
    pending.onText("vaylet:key-slot:B-214");
    expect(h.accepted).toEqual(["B-214"]);
    expect(h.session.isSuppressed()).toBe(true);
    expect(h.session.getPhase()).toBe("idle");
    expect(h.phases).toEqual(["starting", "idle"]);
    // No decoder handle existed yet — nothing to stop at acceptance time.
    expect(pending.stop).not.toHaveBeenCalled();

    pending.resolve({ stop: pending.stop });
    await h.flush();

    // The late handle is adopted by nobody: stopped immediately, no scanning.
    expect(pending.stop).toHaveBeenCalledTimes(1);
    for (const stop of h.trackStops) {
      expect(stop.mock.calls.length).toBeGreaterThanOrEqual(1);
    }
    expect(h.session.getPhase()).toBe("idle");
    expect(h.phases).not.toContain("scanning");
    expect(h.accepted).toEqual(["B-214"]);
    expect(h.failures).toEqual([]);
  });

  it("a start rejection from an already-closed attempt surfaces no failure", async () => {
    const h = makeDeferredHarness();
    void h.session.begin();
    h.session.close();
    const stale = h.latestOpen();
    stale.reject(new Error("late camera boom"));
    await h.flush();

    expect(h.failures).toEqual([]);
    expect(h.session.getPhase()).toBe("idle");
    expect(h.phases).toEqual(["starting", "idle"]);
    // Defensive preview cleanup still ran for the stale attempt.
    for (const stop of h.trackStops) {
      expect(stop.mock.calls.length).toBeGreaterThan(0);
    }
  });

  it("still starts normally and reopens after a close that cancelled a pending start", async () => {
    const h = makeDeferredHarness();
    void h.session.begin();
    h.session.close();
    void h.session.begin(); // reopen — must issue a NEW open attempt
    if (h.openCount() !== 2) throw new Error("expected two open attempts");
    const stale = h.openAt(0);
    const current = h.openAt(1);

    // The stale first attempt resolving late is neutralized…
    stale.resolve({ stop: stale.stop });
    await h.flush();
    expect(stale.stop).toHaveBeenCalledTimes(1);
    expect(h.session.getPhase()).toBe("starting");

    // …and the current attempt scans normally end-to-end.
    current.resolve({ stop: current.stop });
    await h.flush();
    expect(h.session.getPhase()).toBe("scanning");
    current.onText("vaylet:key-slot:C-9");
    expect(h.accepted).toEqual(["C-9"]);
    expect(current.stop).toHaveBeenCalledTimes(1);
    expect(h.session.getPhase()).toBe("idle");
  });
});
