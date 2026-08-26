/**
 * Browser save adapter for backend-produced export artifacts.
 *
 * The ONLY place in the dashboard that turns bytes into a download. DOM and
 * blob-URL operations are injected so the flow is unit-testable in a node
 * vitest environment; production defaults resolve lazily from globals.
 *
 * Lifecycle guarantees:
 * - exactly one object URL is created per saved artifact;
 * - the revoke is scheduled after the click attempt and runs even when the
 *   click throws (try/finally), so blob URLs never leak;
 * - no bytes are persisted to web storage and nothing about the artifact
 *   content is logged.
 */

export interface ExportSavePorts {
  createAnchor(): HTMLAnchorElement;
  createObjectUrl(blob: Blob): string;
  revokeObjectUrl(url: string): void;
  /** Triggers the browser download for an already-configured anchor. */
  clickAnchor(anchor: HTMLAnchorElement): void;
  schedule(callback: () => void): void;
}

function defaultExportSavePorts(): ExportSavePorts {
  return {
    clickAnchor: (anchor) => {
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    },
    createAnchor: () => globalThis.document.createElement("a"),
    createObjectUrl: (blob) => URL.createObjectURL(blob),
    revokeObjectUrl: (url) => URL.revokeObjectURL(url),
    schedule: (callback) => {
      window.setTimeout(callback, 0);
    },
  };
}

export function saveExportArtifact(
  input: {
    readonly bytes: Uint8Array;
    readonly contentType: string;
    readonly filename: string;
  },
  ports: ExportSavePorts = defaultExportSavePorts(),
): void {
  const blob = new Blob([input.bytes.slice().buffer as ArrayBuffer], {
    type: input.contentType,
  });
  const url = ports.createObjectUrl(blob);
  try {
    const anchor = ports.createAnchor();
    anchor.href = url;
    // download (not open): the artifact is a file, not a navigation target.
    anchor.download = input.filename;
    anchor.rel = "noopener";
    ports.clickAnchor(anchor);
  } finally {
    ports.schedule(() => ports.revokeObjectUrl(url));
  }
}
