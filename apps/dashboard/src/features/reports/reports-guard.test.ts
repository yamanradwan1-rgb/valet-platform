import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * D4-002 money precision + formula ownership + artifact-generation audit —
 * Reports.
 *
 * 1. Money-bearing transport/render modules contain NO numeric conversion,
 *    rounding or aggregation helpers: per-currency totals are exact decimal
 *    strings concatenated with their own currency code only.
 * 2. Across every PRODUCTION source of this feature, a line carrying an
 *    authoritative monetary fact never performs numeric conversion.
 * 3. Backend-owned formulas are never recomputed: rate percentages and
 *    incidents-per-1000 values render verbatim; variance/expected/reported
 *    cash strings pass through untouched; signed values keep their sign.
 * 4. No invented metric vocabulary and NO client-side report artifact
 *    generation exists: CSV/PDF bytes come only from the backend through
 *    the shared transport.
 */

const FEATURE_DIR = new URL("./", import.meta.url);

const PRODUCTION_SOURCES: readonly string[] = [
  "reports-api.ts",
  "reports-period.ts",
  "reports-display.ts",
  "reports-loader.ts",
  "reports-export-naming.ts",
  "reports-export-controller.ts",
  "save-export-blob.ts",
  "use-reports-data.ts",
  "use-report-export.ts",
  "reports-view.tsx",
  "reports-metric-cards.tsx",
  "reports-summary-section.tsx",
  "reports-currencies-section.tsx",
  "reports-incidents-section.tsx",
  "reports-daily-activity-section.tsx",
  "reports-period-controls.tsx",
  "reports-export-card.tsx",
];

/** Modules whose entire surface needs zero numeric parsing. */
const NO_PARSING_MODULES: readonly string[] = [
  "reports-api.ts",
  "reports-currencies-section.tsx",
  "reports-incidents-section.tsx",
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
  /report schedul/iu,
  /saved reports?/iu,
  /report history/iu,
  /email delivery/iu,
];

/**
 * Report artifacts are produced ONLY by the backend. These patterns would
 * indicate client-side CSV/PDF fabrication.
 */
const FORBIDDEN_ARTIFACT_PATTERNS: readonly RegExp[] = [
  /\bjsPDF\b/iu,
  /\bpdf-lib\b/iu,
  /\bPDFDocument\b/u,
  /\btoDataURL\b/u,
  /\btext\/csv\b[\s\S]{0,40}\bjoin\b/iu,
  /\bdata:text\/csv\b/iu,
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

describe("reports money precision guard", () => {
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
        for (const pattern of FORBIDDEN_CONVERSION_PATTERNS) {
          expect(
            line.match(pattern)?.[0],
            `${relativePath}:${index + 1}`,
          ).toBeUndefined();
        }
      }
    }
  });

  it("renders rates verbatim without recomputation helpers", () => {
    const displaySource = readSource("reports-display.ts");
    expect(displaySource).toContain("`${rate.percentage}%`");
    expect(displaySource).toContain(
      "no conversion",
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

  it("never fabricates CSV/PDF artifacts client-side", () => {
    for (const relativePath of PRODUCTION_SOURCES) {
      const code = stripComments(readSource(relativePath));
      for (const pattern of FORBIDDEN_ARTIFACT_PATTERNS) {
        expect(
          code.match(pattern)?.[0],
          `${relativePath} looks like client-side artifact generation`,
        ).toBeUndefined();
      }
    }
  });

  it("confines DOM download plumbing to the save adapter", () => {
    const SAVE_MODULE = "save-export-blob.ts";
    const DOM_PATTERNS: readonly RegExp[] = [
      /createObjectURL/u,
      /revokeObjectURL/u,
      /createElement\(["']a["']\)/u,
    ];
    for (const relativePath of PRODUCTION_SOURCES) {
      const source = readSource(relativePath);
      for (const pattern of DOM_PATTERNS) {
        if (relativePath === SAVE_MODULE) continue;
        expect(
          source.match(pattern)?.[0],
          `${relativePath} must not touch blob/DOM download plumbing`,
        ).toBeUndefined();
      }
    }
  });

  it("keeps report page sources free of unrelated mutation affordances", () => {
    // Exports legitimately POST through the shared client, so the POST ban
    // is scoped to the .tsx UI sources only.
    const FORBIDDEN_MUTATION_PATTERNS: readonly RegExp[] = [
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
