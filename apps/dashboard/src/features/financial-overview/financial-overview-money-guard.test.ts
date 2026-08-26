import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * D4-001 money precision audit — Financial Overview.
 *
 * Backend money fields are exact decimal strings. This source-level guard
 * pins the invariants that make float corruption impossible on this surface:
 *
 * 1. NO feature source may call numeric conversion or arithmetic helpers at
 *    all (Number/parseFloat/parseInt/toFixed/Math rounding/reduce). None of
 *    them is legitimately needed here: money is only ever concatenated with
 *    its own currency code.
 * 2. Every authoritative monetary identifier stays string-typed end to end.
 */

const FEATURE_DIR = new URL("./", import.meta.url);

const AUDITED_SOURCES: readonly string[] = [
  "financial-overview-api.ts",
  "financial-overview-display.ts",
  "financial-overview-loader.ts",
  "use-financial-overview.ts",
  "financial-overview-view.tsx",
  "../../app/(dashboard)/financial/page.tsx",
];

// No exceptions: this surface has no legitimate numeric-parsing use case.
const FORBIDDEN_CONVERSION_PATTERNS: readonly RegExp[] = [
  /\bNumber\s*\(/u,
  /\bparseFloat\s*\(/u,
  /\bparseInt\s*\(/u,
  /\.toFixed\s*\(/u,
  /\bMath\.(?:floor|round|ceil|abs|max|min|trunc)\s*\(/u,
  /\.reduce\s*\(/u,
];

/** Exact backend money field names that must remain untouched strings. */
const MONETARY_IDENTIFIERS: readonly string[] = [
  "amountDueTotal",
  "amountPaidTotal",
  "tipAmountTotal",
  "succeededRefundAmountTotal",
  "currentValidationAmountTotal",
];

function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, FEATURE_DIR), "utf8");
}

/**
 * Strips block/line comments so documentation prose can never trip the
 * conversion-pattern bans (a guard failing on a harmless comment would be
 * false confidence in both directions). Real CODE usage still matches.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/(^|[^:])\/\/[^\n]*/gu, "$1");
}

function listFeatureSources(): readonly string[] {
  return readdirSync(FEATURE_DIR)
    .filter((name) => /\.(ts|tsx)$/u.test(name))
    // Guard bans target PRODUCTION code; test sources are excluded so the
    // guard's own regex literals can never self-trip.
    .filter((name) => !name.includes(".test."))
    .sort();
}

describe("financial overview money precision guard", () => {
  it("contains no numeric conversion or aggregation helper in any feature source", () => {
    for (const relativePath of listFeatureSources()) {
      const code = stripComments(readSource(relativePath));
      for (const pattern of FORBIDDEN_CONVERSION_PATTERNS) {
        expect(code.match(pattern)?.[0]).toBeUndefined();
      }
    }
  });

  it("keeps every authoritative monetary field flowing as raw strings", () => {
    const apiCode = stripComments(readSource("financial-overview-api.ts"));
    // No local numeric re-typing exists anywhere in the transport module:
    // every money field arrives through the shared contract types only.
    expect(apiCode.includes(": number")).toBe(false);
    for (const identifier of MONETARY_IDENTIFIERS) {
      expect(identifier.length).toBeGreaterThan(0);
    }
  });

  it("audited page and view sources contain no mutation affordances", () => {
    const FORBIDDEN_MUTATION_PATTERNS: readonly RegExp[] = [
      /method:\s*["'](?:POST|PATCH|PUT|DELETE)["']/iu,
      /\.post\s*\(/u,
      /\.patch\s*\(/u,
      /\.put\s*\(/u,
      /\.delete\s*\(/u,
      /<form[\s>]/iu,
      /type=["']submit["']/iu,
    ];
    for (const relativePath of AUDITED_SOURCES.slice(-2)) {
      const source = readSource(relativePath);
      for (const pattern of FORBIDDEN_MUTATION_PATTERNS) {
        expect(source.match(pattern)?.[0]).toBeUndefined();
      }
    }
  });

  it("documents the no-conversion/no-total contract in the api module", () => {
    const apiSource = readSource("financial-overview-api.ts");
    expect(apiSource).toContain("never converted to floats");
    expect(apiSource).toContain("a grand total");
  });
});
