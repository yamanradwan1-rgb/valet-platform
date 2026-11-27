import { describe, expect, it } from "vitest";

import {
  canonicalizeGuestRatingComment as canonical,
  isCanonicalGuestRatingComment,
  isValidGuestRatingComment,
} from "./guest-rating-comment.js";

describe("Issue #463 CT-02–07 canonical service comment", () => {
  it.each([undefined, null, "", " ", "\r\n", "\u00a0\t\u3000"])(
    "turns absent, empty and edge-only text into null: %s",
    (raw) => expect(canonical(raw)).toBeNull(),
  );

  it.each([
    [" مرحبا ", "مرحبا"],
    ["A\r\nB", "A\nB"],
    [" A\rB ", "A\nB"],
    ["\t A \t B \t", "A \t B"],
    ["مرحبا 👩‍💻\nHello", "مرحبا 👩‍💻\nHello"],
    ["<script>alert(1)</script>", "<script>alert(1)</script>"],
    ["line\n\nbreak", "line\n\nbreak"],
    ["é", "é"],
    ["e\u0301", "e\u0301"],
    ["\ufeffA\ufeff", "\ufeffA\ufeff"],
    ["\u200bA\u200b", "\u200bA\u200b"],
  ])("preserves intended text without HTML/NFC/casefold: %s", (raw, expected) => {
    expect(canonical(raw)).toBe(expected);
  });

  const edgeCharacters = [
    0x0009, 0x000a, 0x0020, 0x00a0, 0x1680,
    ...Array.from({ length: 11 }, (_, offset) => 0x2000 + offset),
    0x2028, 0x2029, 0x202f, 0x205f, 0x3000,
  ];

  it.each(edgeCharacters)(
    "removes exact edge code point U+%s and retains the interior",
    (codePoint) => {
      const edge = String.fromCodePoint(codePoint);
      expect(canonical(edge + "A" + edge)).toBe("A");
      expect(canonical("A" + edge + "B")).toBe("A" + edge + "B");
    },
  );

  it("does not add extra trim characters or erase a valid BOM", () => {
    expect(canonical("\ufeff A \ufeff")).toBe("\ufeff A \ufeff");
    expect(canonical("\u200b A \u200b")).toBe("\u200b A \u200b");
    expect(canonical("\u200f Arabic \u200f")).toBe("\u200f Arabic \u200f");
  });

  it.each(["A", "😀"])(
    "enforces 999/1000/1001 raw scalar boundaries for %s",
    (scalar) => {
      expect(canonical(scalar.repeat(999))).toBe(scalar.repeat(999));
      expect(canonical(scalar.repeat(1000))).toBe(scalar.repeat(1000));
      expect(() => canonical(scalar.repeat(1001))).toThrow();
      expect(() => canonical(" ".repeat(1001) + "A")).toThrow();
    },
  );

  it("enforces exactly 4000 UTF8 bytes for 1000 valid astral scalars", () => {
    const max = "😀".repeat(1000);
    expect(new TextEncoder().encode(max).length).toBe(4000);
    expect(canonical(max)).toBe(max);
    expect(() => canonical(max + "A")).toThrow();
  });

  const forbidden = [
    ...Array.from({ length: 32 }, (_, codePoint) => codePoint)
      .filter((codePoint) => ![9, 10, 13].includes(codePoint)),
    ...Array.from({ length: 33 }, (_, offset) => 0x007f + offset),
    ...Array.from({ length: 5 }, (_, offset) => 0x202a + offset),
    ...Array.from({ length: 4 }, (_, offset) => 0x2066 + offset),
  ];

  it.each(forbidden)("rejects forbidden U+%s without replacement", (codePoint) => {
    expect(() => canonical("A" + String.fromCodePoint(codePoint) + "B")).toThrow(
      "GUEST_RATING_COMMENT_INVALID",
    );
  });

  it.each(["\ud800", "\udfff", "A\ud800B", "\ud800A", "A\udc00"])(
    "rejects malformed UTF16 surrogate sequence",
    (input) => expect(() => canonical(input)).toThrow(),
  );

  it.each([true, 5, [], {}, new String("test")])(
    "rejects coerced non-string comment types",
    (raw) => expect(() => canonical(raw)).toThrow(),
  );

  it("distinguishes real replacement U+FFFD from invalid UTF16", () => {
    expect(canonical("real \ufffd")).toBe("real \ufffd");
    expect(isValidGuestRatingComment("\ud800")).toBe(false);
  });

  it("accepts only already canonical, non-empty text in read projections", () => {
    expect(isCanonicalGuestRatingComment("مرحبا\n👩‍💻")).toBe(true);
    expect(isCanonicalGuestRatingComment(" e\u0301 ")).toBe(false);
    expect(isCanonicalGuestRatingComment("A\r\nB")).toBe(false);
    expect(isCanonicalGuestRatingComment("")).toBe(false);
    expect(isCanonicalGuestRatingComment(null)).toBe(false);
  });
});
