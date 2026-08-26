import { expect, it, describe } from "vitest";

import { DashboardApiError } from "../../lib/api/api-error";
import { contentTypeMatchesFamily, exportReport } from "./reports-api";

/**
 * Regression guards for export Content-Type family matching (D5-001).
 *
 * The matcher must compare the PARSED TOP-LEVEL media type against the
 * requested artifact family. A substring search accepts hostile header
 * shapes where the family only appears inside a parameter or a type
 * prefix — e.g. `multipart/mixed; boundary=text/csv` was previously
 * accepted as the text/csv family, letting contract drift through the
 * "wrong 2xx Content-Type never downloads" rule.
 */

const REQUEST_CSV = { date: "2026-01-30", format: "CSV", kind: "DAILY" } as const;

function binaryClient(contentType: string | null) {
  const client = {
    async requestBinary() {
      return {
        bytes: new Uint8Array([1]),
        contentDisposition: null,
        contentType,
      };
    },
  };
  return client as unknown as Parameters<typeof exportReport>[0];
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    return null;
  } catch (error) {
    return error;
  }
}

describe("contentTypeMatchesFamily top-level media type parsing", () => {
  it("accepts the exact family with parameters, casing and OWS tolerated", () => {
    expect(contentTypeMatchesFamily("text/csv", "text/csv")).toBe(true);
    expect(contentTypeMatchesFamily("TEXT/CSV", "text/csv")).toBe(true);
    expect(contentTypeMatchesFamily("text/csv;charset=utf-8", "text/csv")).toBe(
      true,
    );
    expect(contentTypeMatchesFamily(" text/csv ", "text/csv")).toBe(true);
    expect(contentTypeMatchesFamily("application/pdf", "application/pdf")).toBe(
      true,
    );
  });

  it("rejects a non-matching TOP-LEVEL media type even when the family appears inside a parameter", () => {
    // The reopened D5 concern: substring match accepted this as text/csv.
    expect(
      contentTypeMatchesFamily("multipart/mixed; boundary=text/csv", "text/csv"),
    ).toBe(false);
    expect(
      contentTypeMatchesFamily(
        "multipart/mixed; boundary=application/pdf",
        "application/pdf",
      ),
    ).toBe(false);
  });

  it("rejects prefix and near-miss hybrids around the family token", () => {
    expect(contentTypeMatchesFamily("x-text/csv", "text/csv")).toBe(false);
    expect(contentTypeMatchesFamily("text/csvx", "text/csv")).toBe(false);
    expect(
      contentTypeMatchesFamily("application/pdfx", "application/pdf"),
    ).toBe(false);
  });

  it("rejects absent or malformed media types", () => {
    expect(contentTypeMatchesFamily("", "text/csv")).toBe(false);
    expect(contentTypeMatchesFamily(";charset=utf-8", "text/csv")).toBe(false);
  });
});

describe("exportReport refuses parameter-embedded family headers end to end", () => {
  it("never resolves a download for multipart/mixed; boundary=text/csv on a CSV request", async () => {
    const error = await caught(
      exportReport(binaryClient("multipart/mixed; boundary=text/csv"), "loc-a", {
        ...REQUEST_CSV,
      }),
    );
    expect(error).toBeInstanceOf(DashboardApiError);
    expect((error as DashboardApiError).code).toBe(
      "REPORTS_EXPORT_RESPONSE_INVALID",
    );
  });
});
