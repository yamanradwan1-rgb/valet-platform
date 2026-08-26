import { describe, expect, it } from "vitest";

import { DashboardApiError } from "../../lib/api/api-error";
import type { ReportsClient } from "./reports-api";
import {
  createReportExportController,
  IDLE_EXPORT_STATE,
} from "./reports-export-controller";
import type { ReportExportState } from "./reports-export-controller";
import { flush, LOCATION_A, LOCATION_B } from "./reports-test-support";

/**
 * Export race/state matrix (D4-002): duplicate-click lock, identity-gated
 * outcome application (A→B location, kind, period, format), honest save
 * behavior for already-started downloads, and correct POST bodies per kind.
 */

interface BinaryCall {
  readonly init:
    | { readonly body?: unknown; readonly method?: string }
    | undefined;
  readonly path: string;
}

function deferredBinaryClient(): {
  calls: BinaryCall[];
  client: ReportsClient;
  settle: (
    index: number,
    outcome:
      | { error: unknown }
      | {
          bytes: Uint8Array;
          contentDisposition: string | null;
          contentType: string;
        },
  ) => void;
} {
  const calls: BinaryCall[] = [];
  const pending: {
    reject: (error: unknown) => void;
    resolve: (value: unknown) => void;
  }[] = [];
  const client = {
    async requestBinary(path: string, init?: Record<string, unknown>) {
      calls.push({ init, path });
      return new Promise((resolve, reject) => {
        pending.push({ reject, resolve });
      });
    },
  };
  return {
    calls,
    client: client as unknown as ReportsClient,
    settle: (index, outcome) => {
      const entry = pending[index];
      if (!entry) throw new Error("no such pending attempt");
      if ("error" in outcome) entry.reject(outcome.error);
      else entry.resolve(outcome);
    },
  };
}

function controllerHarness(client: ReportsClient): {
  saved: { bytes: Uint8Array; contentType: string; filename: string }[];
  states: ReportExportState[];
  start: ReturnType<typeof createReportExportController>;
} {
  const states: ReportExportState[] = [];
  const saved: { bytes: Uint8Array; contentType: string; filename: string }[] =
    [];
  const controller = createReportExportController({
    client,
    onState: (state) => states.push(state),
    save: (artifact) => saved.push(artifact),
  });
  return { saved, start: controller, states };
}

describe("export state machine", () => {
  it("goes idle → exporting → success and saves the artifact once", async () => {
    const deferred = deferredBinaryClient();
    const { saved, start, states } = controllerHarness(deferred.client);
    start.setIdentity({
      kind: "DAILY",
      locationId: LOCATION_A,
      periodValue: "2026-01-05",
    });
    start.startExport("CSV");
    deferred.settle(0, {
      bytes: new Uint8Array([1, 2]),
      contentDisposition: 'attachment; filename="report-daily-2026-01-05.csv"',
      contentType: "text/csv; charset=utf-8",
    });
    await flush();

    expect(states.map((state) => state.phase)).toEqual([
      "idle",
      "exporting",
      "success",
    ]);
    expect(states.at(-1)?.format).toBe("CSV");
    expect(saved).toHaveLength(1);
    expect(saved[0]?.filename).toBe("report-daily-2026-01-05.csv");
  });

  it("blocks duplicate clicks while the same selection is exporting", async () => {
    const deferred = deferredBinaryClient();
    const { start, states } = controllerHarness(deferred.client);
    start.setIdentity({ kind: "DAILY", locationId: LOCATION_A, periodValue: "2026-01-05" });

    start.startExport("CSV");
    start.startExport("PDF"); // storm guard: same selection still pending
    expect(deferred.calls).toHaveLength(1);

    deferred.settle(0, { error: new Error("boom") });
    await flush();
    expect(states.at(-1)?.phase).toBe("error");

    // After settling, a new action may start.
    start.startExport("PDF");
    expect(deferred.calls).toHaveLength(2);
  });

  it("maps failures honestly and never saves on error", async () => {
    const deferred = deferredBinaryClient();
    const { saved, start, states } = controllerHarness(deferred.client);
    start.setIdentity({ kind: "DAILY", locationId: LOCATION_A, periodValue: "2026-01-05" });
    start.startExport("PDF");
    deferred.settle(0, {
      error: new DashboardApiError({
        code: "REPORT_EXPORT_TOO_LARGE",
        kind: "validation",
        message: "",
        status: 422,
      }),
    });
    await flush();

    const last = states.at(-1);
    expect(last?.phase).toBe("error");
    expect(last?.format).toBe("PDF");
    expect(last?.error?.code).toBe("REPORT_EXPORT_TOO_LARGE");
    expect(saved).toHaveLength(0);
  });
});

describe("export identity races", () => {
  it("location A export → switch B → A's late completion never shows as B's status but still downloads truthfully", async () => {
    const deferred = deferredBinaryClient();
    const { saved, start, states } = controllerHarness(deferred.client);
    start.setIdentity({ kind: "DAILY", locationId: LOCATION_A, periodValue: "2026-01-05" });
    start.startExport("CSV");

    // User switches to location B before the artifact arrives.
    start.setIdentity({ kind: "DAILY", locationId: LOCATION_B, periodValue: "2026-01-05" });
    expect(states.at(-1)).toEqual(IDLE_EXPORT_STATE);

    deferred.settle(0, {
      bytes: new Uint8Array([9]),
      contentDisposition: null,
      contentType: "text/csv",
    });
    await flush();

    // The backend-produced download itself legitimately completes and is
    // saved under its truthful fallback name — but B's UI stays idle.
    expect(saved).toHaveLength(1);
    expect(saved[0]?.filename).toBe("report-daily-2026-01-05.csv");
    expect(states.at(-1)).toEqual(IDLE_EXPORT_STATE);
  });

  it("kind/period change drops the stale outcome before it can attach", async () => {
    for (const next of [
      { kind: "WEEKLY" as const, locationId: LOCATION_A, periodValue: "2026-01-05" },
      { kind: "DAILY" as const, locationId: LOCATION_A, periodValue: "2026-01-06" },
    ]) {
      const deferred = deferredBinaryClient();
      const { start, states } = controllerHarness(deferred.client);
      start.setIdentity({ kind: "DAILY", locationId: LOCATION_A, periodValue: "2026-01-05" });
      start.startExport("CSV");
      start.setIdentity(next);

      deferred.settle(0, {
        bytes: new Uint8Array([1]),
        contentDisposition: null,
        contentType: "text/csv",
      });
      await flush();
      // Status was reset by the identity change and stays reset.
      expect(states.at(-1)).toEqual(IDLE_EXPORT_STATE);
    }
  });

  it("retry after a failure retries with the CURRENT identity only", async () => {
    const deferred = deferredBinaryClient();
    const { start, states } = controllerHarness(deferred.client);
    start.setIdentity({ kind: "MONTHLY", locationId: LOCATION_A, periodValue: "2026-01" });
    start.startExport("PDF");
    deferred.settle(0, { error: new Error("transient") });
    await flush();
    expect(states.at(-1)?.phase).toBe("error");

    // The user retries without changing selection: same body, same identity.
    start.startExport("PDF");
    expect(deferred.calls).toHaveLength(2);
    expect(deferred.calls[1]?.init?.body).toEqual({
      format: "PDF",
      kind: "MONTHLY",
      month: "2026-01",
    });
    deferred.settle(1, {
      bytes: new Uint8Array([4]),
      contentDisposition: null,
      contentType: "application/pdf",
    });
    await flush();
    expect(states.at(-1)?.phase).toBe("success");
  });

  it("late FAILURE after switch never contaminates B either", async () => {
    const deferred = deferredBinaryClient();
    const { saved, start, states } = controllerHarness(deferred.client);
    start.setIdentity({ kind: "DAILY", locationId: LOCATION_A, periodValue: "2026-01-05" });
    start.startExport("CSV");
    start.setIdentity({ kind: "DAILY", locationId: LOCATION_B, periodValue: "2026-01-05" });

    deferred.settle(0, {
      error: new DashboardApiError({
        code: "REPORT_EXPORT_TOO_LARGE",
        kind: "validation",
        message: "",
        status: 422,
      }),
    });
    await flush();

    expect(states.at(-1)).toEqual(IDLE_EXPORT_STATE);
    expect(saved).toHaveLength(0);
  });

  it("B starts its own export while A's attempt is still pending", async () => {
    const deferred = deferredBinaryClient();
    const { saved, start, states } = controllerHarness(deferred.client);
    start.setIdentity({ kind: "DAILY", locationId: LOCATION_A, periodValue: "2026-01-05" });
    start.startExport("CSV");

    // Switch to B clears the old lock; B may export immediately.
    start.setIdentity({ kind: "WEEKLY", locationId: LOCATION_B, periodValue: "2026-01-05" });
    start.startExport("PDF");
    expect(deferred.calls).toHaveLength(2);

    // A fails late — dropped; B stays exporting.
    deferred.settle(0, { error: new Error("late A failure") });
    await flush();
    expect(states.at(-1)?.phase).toBe("exporting");
    expect(states.at(-1)?.format).toBe("PDF");

    // B succeeds.
    deferred.settle(1, {
      bytes: new Uint8Array([7]),
      contentDisposition: null,
      contentType: "application/pdf",
    });
    await flush();
    expect(states.at(-1)?.phase).toBe("success");
    expect(states.at(-1)?.format).toBe("PDF");
    expect(saved).toHaveLength(1);
    expect(saved[0]?.filename).toBe("report-weekly-2026-01-05.pdf");
  });

  it("B's own export uses B's location in the POST path/body", async () => {
    const deferred = deferredBinaryClient();
    const { start } = controllerHarness(deferred.client);
    start.setIdentity({ kind: "WEEKLY", locationId: LOCATION_B, periodValue: "2026-01-05" });
    start.startExport("CSV");
    expect(deferred.calls[0]?.path).toBe(`/dashboard/locations/${LOCATION_B}/reports/exports`);
    expect(deferred.calls[0]?.init?.body).toEqual({
      format: "CSV",
      kind: "WEEKLY",
      weekStart: "2026-01-05",
    });
  });
});
