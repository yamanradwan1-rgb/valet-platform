import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const hookSource = readFileSync(
  new URL("./use-qr-scanner-capture.ts", import.meta.url),
  "utf8",
);

describe("useQrScannerCapture startup lifecycle", () => {
  it("defers camera startup until the conditional video preview has mounted", () => {
    const startBeginning = hookSource.indexOf("const start = useCallback");
    const startEnding = hookSource.indexOf("}, [ensureSession]);", startBeginning);
    const startImplementation = hookSource.slice(startBeginning, startEnding);

    expect(startBeginning).toBeGreaterThan(-1);
    expect(startEnding).toBeGreaterThan(startBeginning);
    expect(startImplementation).not.toContain("session.begin()");
    expect(hookSource).toContain('if (uiState !== "starting") return;');
    expect(hookSource).toContain("void session.begin();");
  });
});
