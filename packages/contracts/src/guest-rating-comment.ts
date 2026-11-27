/**
 * Shared, intentionally narrow canonical text rule for Issue #463.
 * This is pure input validation; authorization and immutable pair writes
 * belong to the protected Guest SQL writer, not the browser or this module.
 */
const maxScalars = 1_000;
const maxUtf8Bytes = 4_000;

const edgeWhitespace = new Set([
  0x0009, 0x000a, 0x0020, 0x00a0, 0x1680,
  ...Array.from({ length: 11 }, (_, index) => 0x2000 + index),
  0x2028, 0x2029, 0x202f, 0x205f, 0x3000,
]);

function validUtf16(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const current = value.charCodeAt(index);
    if (current >= 0xd800 && current <= 0xdbff) {
      const next = value.charCodeAt(++index);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (current >= 0xdc00 && current <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function validContent(value: string): boolean {
  for (const scalar of value) {
    const codePoint = scalar.codePointAt(0)!;
    if (
      (codePoint <= 0x001f && codePoint !== 0x0009 &&
        codePoint !== 0x000a && codePoint !== 0x000d) ||
      (codePoint >= 0x007f && codePoint <= 0x009f) ||
      (codePoint >= 0x202a && codePoint <= 0x202e) ||
      (codePoint >= 0x2066 && codePoint <= 0x2069)
    ) return false;
  }
  return true;
}

function withinBounds(value: string): boolean {
  if (value.length > 2 * maxScalars) return false;
  if (Array.from(value).length > maxScalars) return false;
  return new TextEncoder().encode(value).byteLength <= maxUtf8Bytes;
}

function normalizeEdgeWhitespace(value: string): string {
  const normalized = Array.from(value.replace(/\r\n?/g, "\n"));
  let start = 0;
  let end = normalized.length;
  while (
    start < end && edgeWhitespace.has(normalized[start]!.codePointAt(0)!)
  ) start += 1;
  while (
    end > start && edgeWhitespace.has(normalized[end - 1]!.codePointAt(0)!)
  ) end -= 1;
  return normalized.slice(start, end).join("");
}

/**
 * Throws for invalid text rather than silently replacing, truncating, or
 * normalizing Unicode composition. Omitted and explicit null mean no comment.
 */
export function canonicalizeGuestRatingComment(
  input: unknown,
): string | null {
  if (input === undefined || input === null) return null;
  if (
    typeof input !== "string" ||
    !validUtf16(input) ||
    !withinBounds(input) ||
    !validContent(input)
  ) {
    throw new TypeError("GUEST_RATING_COMMENT_INVALID");
  }

  const canonical = normalizeEdgeWhitespace(input);
  if (!withinBounds(canonical)) {
    throw new TypeError("GUEST_RATING_COMMENT_INVALID");
  }
  return canonical.length === 0 ? null : canonical;
}

/** Safe predicate for Zod and strict read-side validation. */
export function isValidGuestRatingComment(input: unknown): boolean {
  try {
    canonicalizeGuestRatingComment(input);
    return true;
  } catch {
    return false;
  }
}

/** A returned non-null comment must already be canonical. */
export function isCanonicalGuestRatingComment(input: unknown): boolean {
  if (typeof input !== "string" || input.length === 0) return false;
  try {
    return canonicalizeGuestRatingComment(input) === input;
  } catch {
    return false;
  }
}
