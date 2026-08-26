/**
 * Content-Disposition filename handling for backend-produced artifacts.
 *
 * Pure, framework-free, directly unit-testable. The backend sends
 * `attachment; filename="report-{kind}-{periodFrom}.{ext}"` with an
 * ASCII-only generated name, but a faithful client must still parse the
 * header robustly (RFC 6266/5987 forms), sanitize hostile values and fall
 * back to a truthful name built from the request itself — never trust a
 * server-controlled string as a filesystem path.
 */

const QUOTED_FILENAME_PATTERN = /\bfilename\s*=\s*"((?:[^"\\]|\\.)*)"/iu;
const UNQUOTED_FILENAME_PATTERN = /\bfilename\s*=\s*([^;"']+)/iu;
const EXTENDED_FILENAME_PATTERN =
  /\bfilename\*\s*=\s*(utf-8|us-ascii|ascii)'[^']*'([^;'\s]+)/giu;

/** Maximum kept filename length; longer names are truncated safely. */
const MAXIMUM_FILENAME_LENGTH = 120;

function percentDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function unquoteQuotedString(value: string): string {
  return value.replace(/\\(.)/gu, "$1");
}

/**
 * Extracts the raw filename from a Content-Disposition header value.
 * RFC 5987 `filename*=` wins when present and decodable; otherwise the
 * quoted form, then the unquoted form. Returns null when absent.
 */
export function parseContentDispositionFilename(
  header: string | null | undefined,
): string | null {
  if (header === null || header === undefined) return null;

  const extended = EXTENDED_FILENAME_PATTERN.exec(header);
  EXTENDED_FILENAME_PATTERN.lastIndex = 0;
  if (extended !== null) {
    const decoded = percentDecode(extended[2] ?? "");
    if (decoded !== null && decoded.length > 0) return decoded;
  }

  const quoted = QUOTED_FILENAME_PATTERN.exec(header);
  if (quoted !== null) {
    const value = unquoteQuotedString(quoted[1] ?? "");
    if (value.trim().length > 0) return value;
  }

  const unquoted = UNQUOTED_FILENAME_PATTERN.exec(header);
  if (unquoted !== null) {
    const value = (unquoted[1] ?? "").trim();
    if (value.length > 0) return value;
  }
  return null;
}

/**
 * Reduces an untrusted filename to a safe single path segment.
 *
 * - strips directory components and Windows drive prefixes;
 * - removes control characters and line/paragraph separators;
 * - collapses whitespace, trims trailing dots/spaces;
 * - rejects dot-only names ("." / "..") and enforces a length cap.
 * Returns null when nothing safe remains (caller applies its fallback).
 */
export function sanitizeArtifactFilename(
  raw: string,
): string | null {
  let candidate = raw.trim();
  // Keep only the final path segment; separators become part of history.
  candidate = candidate.split(/[\\/]+/u).pop() ?? "";
  candidate = candidate.replace(/^[A-Za-z]:/u, "");
  // Control characters are intentionally deleted from untrusted header
  // values; the rule's default ban does not apply to sanitization code.
  // eslint-disable-next-line no-control-regex
  candidate = candidate.replace(/[\u0000-\u001f\u007f\u2028\u2029]/gu, "");
  candidate = candidate.replace(/\s+/gu, " ").trim();
  candidate = candidate.replace(/[. ]+$/u, "");
  if (
    candidate.length === 0 ||
    candidate === "." ||
    candidate === ".."
  ) {
    return null;
  }
  if (candidate.length > MAXIMUM_FILENAME_LENGTH) {
    const extensionIndex = candidate.lastIndexOf(".");
    const extension =
      extensionIndex > 0 && extensionIndex < candidate.length - 1
        ? candidate.slice(extensionIndex)
        : "";
    const keep = Math.max(0, MAXIMUM_FILENAME_LENGTH - extension.length);
    candidate = candidate.slice(0, keep) + extension;
    candidate = candidate.replace(/[. ]+$/u, "");
    // A pathological extension can still overflow the cap: reject rather
    // than emit an overlong name (caller applies its truthful fallback).
    if (candidate.length > MAXIMUM_FILENAME_LENGTH) return null;
  }
  // Refuse anything that is not demonstrably a plain name.
  if (!/^[\w.\- ()[\]]+$/u.test(candidate)) return null;
  return candidate;
}
