import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * D4-001 money precision + formula ownership audit — Analytics.
 *
 * 1. Money-bearing transport/render modules contain NO numeric conversion,
 *    rounding or aggregation helpers at all: per-currency totals are exact
 *    decimal strings concatenated with their own currency code only.
 * 2. Across every PRODUCTION source of this feature, a line carrying an
 *    authoritative monetary fact never performs numeric conversion. (The one
 *    legitimate parsing site — queue-age minutes/seconds display styling and
 *    bar scaling in analytics-display.ts — touches only non-monetary values
 *    on its own lines.)
 * 3. Backend-owned formulas are never recomputed: rate percentages and
 *    incidents-per-1000 values render verbatim; variance/expected/reported
 *    cash strings pass through untouched.
 * 4. No invented metric vocabulary exists anywhere in production sources:
 *    no compliance scores, guest ratings, per-employee productivity,
 *    predictions or cross-location aggregations.
 */

const FEATURE_DIR = new URL("./", import.meta.url);

const PRODUCTION_SOURCES: readonly string[] = [
  "analytics-api.ts",
  "analytics-period.ts",
  "analytics-display.ts",
  "analytics-loader.ts",
  "use-analytics-data.ts",
  "analytics-view.tsx",
  "analytics-metric-cards.tsx",
  "analytics-operations-section.tsx",
  "analytics-financial-section.tsx",
  "analytics-incidents-section.tsx",
  "../../app/(dashboard)/analytics/page.tsx",
];

/** Modules whose entire surface needs zero numeric parsing. */
const NO_PARSING_MODULES: readonly string[] = [
  "analytics-api.ts",
  "analytics-financial-section.tsx",
];

const FORBIDDEN_CONVERSION_PATTERNS: readonly RegExp[] = [
  /\bNumber\s*\(/u,
  /\bparseFloat\s*\(/u,
  /\bparseInt\s*\(/u,
  /\.toFixed\s*\(/u,
  /\.reduce\s*\(/u,
];

const MONETARY_LINE_IDENTIFIERS: readonly RegExp[] = [
  /amountDueTotal/u,
  /amountPaidTotal/u,
  /tipAmountTotal/u,
  /succeededRefundAmountTotal/u,
  /currentValidationAmountTotal/u,
  /collectedAmountTotal/u,
  /cashExpectedTotal/u,
  /cashReportedTotal/u,
  /cashVarianceTotal/u,
];

/** Metric concepts that do NOT exist in the current backend contract. */
const FORBIDDEN_CONCEPT_TERMS: readonly RegExp[] = [
  /\bsla\b/iu,
  /guest rating/iu,
  /cars per employee/iu,
  /predictive/iu,
  /average ticket/iu,
  /cross-location revenue/iu,
];

function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, FEATURE_DIR), "utf8");
}

/**
 * Strips block/line comments so documentation prose can never trip the
 * conversion/concept bans (guards must fail on real CODE usage, not on
 * harmless words in comments).
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/(^|[^:])\/\/[^\n]*/gu, "$1");
}

describe("analytics money precision guard", () => {
  it("contains no numeric parsing or aggregation in transport/money modules", () => {
    for (const relativePath of NO_PARSING_MODULES) {
      const code = stripComments(readSource(relativePath));
      for (const pattern of FORBIDDEN_CONVERSION_PATTERNS) {
        expect(code.match(pattern)?.[0]).toBeUndefined();
      }
    }
  });

  it("never converts a monetary value on any production line", () => {
    for (const relativePath of PRODUCTION_SOURCES) {
      const lines = stripComments(readSource(relativePath)).split(/\r?\n/u);
      for (const [index, line] of lines.entries()) {
        const carriesMoney = MONETARY_LINE_IDENTIFIERS.some((pattern) =>
          pattern.test(line),
        );
        if (!carriesMoney) continue;
        for (const pattern of [
          /\bNumber\s*\(/u,
          /\bparseFloat\s*\(/u,
          /\bparseInt\s*\(/u,
          /\.toFixed\s*\(/u,
          /\.reduce\s*\(/u,
        ]) {
          expect(
            line.match(pattern)?.[0],
            `${relativePath}:${index + 1}`,
          ).toBeUndefined();
        }
      }
    }
  });

  it("renders rates verbatim without recomputation helpers", () => {
    const displaySource = readSource("analytics-display.ts");
    // Percentage passes through as a string with a unit suffix only.
    expect(displaySource).toContain("`${rate.percentage}%`");
    expect(displaySource).toContain(
      "Verbatim backend percentage string; no rounding, no re-computation.",
    );
  });

  it("contains no invented metric vocabulary in production sources", () => {
    for (const relativePath of PRODUCTION_SOURCES) {
      const code = stripComments(readSource(relativePath));
      for (const term of FORBIDDEN_CONCEPT_TERMS) {
        expect(
          code.match(term)?.[0],
          `${relativePath} mentions unsupported concept ${String(term)}`,
        ).toBeUndefined();
      }
    }
  });

  it("keeps every analytics page source free of mutation affordances", () => {
    const FORBIDDEN_MUTATION_PATTERNS: readonly RegExp[] = [
      /method:\s*["'](?:POST|PATCH|PUT|DELETE)["']/iu,
      /\.post\s*\(/u,
      /\.patch\s*\(/u,
      /\.put\s*\(/u,
      /\.delete\s*\(/u,
      /<form[\s>]/iu,
      /type=["']submit["']/iu,
    ];
    for (const relativePath of PRODUCTION_SOURCES.filter((path) =>
      path.endsWith(".tsx"),
    )) {
      const source = readSource(relativePath);
      for (const pattern of FORBIDDEN_MUTATION_PATTERNS) {
        expect(source.match(pattern)?.[0]).toBeUndefined();
      }
    }
  });
});
