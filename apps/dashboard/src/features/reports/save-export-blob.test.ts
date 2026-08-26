import { describe, expect, it } from "vitest";

import { saveExportArtifact } from "./save-export-blob";
import type { ExportSavePorts } from "./save-export-blob";

/**
 * Byte→download lifecycle tests (D4-002). Fake ports prove the guarantees
 * documented on saveExportArtifact without touching a DOM:
 * - exactly ONE object URL is created per saved artifact;
 * - the URL handed to revoke is the exact one created;
 * - revoke is executed even when the click attempt throws (try/finally);
 * - the Blob carries the response content-type and bytes;
 * - the filename lands on anchor.download and the anchor is noopener.
 */

interface RecordedAnchor {
  download?: string;
  href?: string;
  rel?: string;
}

function harness(options?: { clickThrows?: boolean }): {
  ports: ExportSavePorts;
  events: string[];
  anchors: RecordedAnchor[];
  blobs: Blob[];
  runScheduled: () => void;
} {
  const events: string[] = [];
  const anchors: RecordedAnchor[] = [];
  const blobs: Blob[] = [];
  const scheduled: (() => void)[] = [];
  let urlCounter = 0;
  const ports: ExportSavePorts = {
    clickAnchor: (anchor) => {
      anchors.push(anchor as unknown as RecordedAnchor);
      events.push("click");
      if (options?.clickThrows) {
        throw new Error("click failed");
      }
    },
    createAnchor: () => ({}) as HTMLAnchorElement,
    createObjectUrl: (blob) => {
      blobs.push(blob);
      urlCounter += 1;
      events.push("create");
      return `blob:urn-${urlCounter}`;
    },
    revokeObjectUrl: (url) => {
      events.push(`revoke:${url}`);
    },
    schedule: (callback) => {
      scheduled.push(callback);
    },
  };
  return {
    events,
    ports,
    anchors,
    blobs,
    runScheduled: () => {
      for (const callback of scheduled.splice(0)) callback();
    },
  };
}

const ARTIFACT = {
  bytes: new Uint8Array([1, 2, 3]),
  contentType: "text/csv; charset=utf-8",
  filename: "report-daily-2026-01-05.csv",
};

describe("saveExportArtifact", () => {
  it("creates exactly one object URL and clicks once with truthful attributes", () => {
    const { events, ports, anchors, blobs } = harness();
    saveExportArtifact(ARTIFACT, ports);

    expect(events.filter((event) => event === "create")).toHaveLength(1);
    expect(events.filter((event) => event === "click")).toHaveLength(1);
    expect(blobs).toHaveLength(1);
    expect(blobs[0]?.type).toBe(ARTIFACT.contentType);
    expect(anchors[0]?.download).toBe(ARTIFACT.filename);
    expect(anchors[0]?.href).toBe("blob:urn-1");
    expect(anchors[0]?.rel).toBe("noopener");
  });

  it("revokes the created URL even when the click throws", () => {
    const { events, ports, runScheduled } = harness({ clickThrows: true });

    // Click failures propagate honestly to the caller…
    expect(() => saveExportArtifact(ARTIFACT, ports)).toThrow("click failed");
    // …but the revoke was still scheduled despite the throwing click.
    expect(events).toEqual(["create", "click"]);
    runScheduled();
    // It runs against the exact URL that was created.
    expect(events).toEqual(["create", "click", "revoke:blob:urn-1"]);
  });

  it("schedules the revoke after the click attempt, never before", () => {
    const { events, ports, runScheduled } = harness();

    saveExportArtifact(ARTIFACT, ports);
    expect(events).toEqual(["create", "click"]);
    runScheduled();
    expect(events).toEqual(["create", "click", "revoke:blob:urn-1"]);
  });
});
