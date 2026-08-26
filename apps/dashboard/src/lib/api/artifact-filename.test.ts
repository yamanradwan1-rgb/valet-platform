import { describe, expect, it } from "vitest";

import {
  parseContentDispositionFilename,
  sanitizeArtifactFilename,
} from "./artifact-filename";

/**
 * Backend truth: `attachment; filename="report-daily-2026-01-30.csv"` with a
 * generated ASCII name. These tests pin honest handling of that reality plus
 * hostile/degenerate headers, because the filename ultimately comes from a
 * response header and must never become a path or a lie.
 */

describe("parseContentDispositionFilename", () => {
  it("parses the backend's quoted attachment form", () => {
    expect(
      parseContentDispositionFilename(
        'attachment; filename="report-daily-2026-01-30.csv"',
      ),
    ).toBe("report-daily-2026-01-30.csv");
  });

  it("prefers RFC 5987 filename* and percent-decodes it", () => {
    expect(
      parseContentDispositionFilename(
        "attachment; filename=\"fallback.csv\"; filename*=utf-8''re%D8%B1port.csv",
      ),
    ).toBe("reرport.csv");
  });

  it("ignores an undecodable filename* and falls back to the quoted form", () => {
    expect(
      parseContentDispositionFilename(
        "attachment; filename=\"ok.csv\"; filename*=utf-8''%zz-broken",
      ),
    ).toBe("ok.csv");
  });

  it("unescapes quoted-pair escapes in the quoted form", () => {
    expect(
      parseContentDispositionFilename('attachment; filename="a\\"b\\\\c.csv"'),
    ).toBe('a"b\\c.csv');
  });

  it("supports the unquoted form", () => {
    expect(
      parseContentDispositionFilename("attachment; filename=plain.csv"),
    ).toBe("plain.csv");
  });

  it("returns null for missing headers and missing parameters", () => {
    expect(parseContentDispositionFilename(null)).toBeNull();
    expect(parseContentDispositionFilename(undefined)).toBeNull();
    expect(parseContentDispositionFilename("attachment")).toBeNull();
    expect(parseContentDispositionFilename("inline; boundary=xyz")).toBeNull();
  });
});

describe("sanitizeArtifactFilename", () => {
  it("keeps truthful backend names untouched", () => {
    expect(sanitizeArtifactFilename("report-weekly-2026-01-05.pdf")).toBe(
      "report-weekly-2026-01-05.pdf",
    );
  });

  it("strips path traversal segments entirely", () => {
    expect(sanitizeArtifactFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeArtifactFilename("..\\..\\win\\system32.cfg")).toBe(
      "system32.cfg",
    );
    expect(sanitizeArtifactFilename("C:\\boot\\evil.ini")).toBe("evil.ini");
  });

  it("removes control characters and separators inside the name", () => {
    expect(sanitizeArtifactFilename("re\u0000po\u001frt.csv")).toBe(
      "report.csv",
    );
    expect(sanitizeArtifactFilename("bad\u2029name.pdf")).toBe("badname.pdf");
  });

  it("rejects dot-only and empty results", () => {
    expect(sanitizeArtifactFilename(".")).toBeNull();
    expect(sanitizeArtifactFilename("..")).toBeNull();
    expect(sanitizeArtifactFilename("... ")).toBeNull();
    expect(sanitizeArtifactFilename("///")).toBeNull();
    expect(sanitizeArtifactFilename("")).toBeNull();
  });

  it("truncates overlong names while preserving the extension", () => {
    const long = `${"a".repeat(200)}.csv`;
    const sanitized = sanitizeArtifactFilename(long);
    expect(sanitized).not.toBeNull();
    expect((sanitized as string).length).toBeLessThanOrEqual(120);
    expect((sanitized as string).endsWith(".csv")).toBe(true);
  });

  it("rejects a pathological overlong extension instead of emitting it", () => {
    expect(sanitizeArtifactFilename(`${"a".repeat(10)}.${"b".repeat(130)}`))
      .toBeNull();
  });

  it("rejects exotic characters instead of approximating them", () => {
    expect(sanitizeArtifactFilename("résumé;.csv=;:.pdf")).toBeNull();
  });
});
