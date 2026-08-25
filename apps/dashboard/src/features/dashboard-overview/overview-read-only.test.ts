import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import * as overviewEndpoints from "./overview-endpoints";

/**
 * Read-only boundary proof for the D2-004 surfaces.
 *
 * 1. The transport surface exposes ONLY the three read functions.
 * 2. The page/view sources contain no mutation affordance of any kind:
 *    no non-GET method literals, no fetch shortcuts, no forms or submit
 *    buttons that would imply key/incident mutations exist.
 */
const EXPECTED_EXPORTS = [
  "fetchActiveShiftsPage",
  "fetchIncidentsPage",
  "fetchKeySlotsPage",
];

const FEATURE_DIR = new URL("./", import.meta.url);

const AUDITED_SOURCES: readonly string[] = [
  "active-shifts-view.tsx",
  "keys-custody-view.tsx",
  "incidents-monitoring-view.tsx",
  "load-more-section.tsx",
  "detail-sheet.tsx",
  "../../app/(dashboard)/active-shifts/page.tsx",
  "../../app/(dashboard)/keys/page.tsx",
  "../../app/(dashboard)/incidents/page.tsx",
];

// Anything here would imply a mutation capability the backend does not offer
// on these dashboard endpoints (or a disabled fake button).
const FORBIDDEN_MUTATION_PATTERNS: readonly RegExp[] = [
  /method:\s*["'](?:POST|PATCH|PUT|DELETE)["']/iu,
  /\.post\s*\(/u,
  /\.patch\s*\(/u,
  /\.put\s*\(/u,
  /\.delete\s*\(/u,
  /<form[\s>]/iu,
  /type=["']submit["']/iu,
];

describe("overview read-only boundary", () => {
  it("exports exactly the three read functions and nothing else", () => {
    expect(Object.keys(overviewEndpoints).sort()).toEqual(EXPECTED_EXPORTS);
  });

  it("contains no mutation affordance in any audited view or page source", () => {
    for (const relativePath of AUDITED_SOURCES) {
      const source = readFileSync(new URL(relativePath, FEATURE_DIR), "utf8");
      for (const pattern of FORBIDDEN_MUTATION_PATTERNS) {
        expect(source.match(pattern)?.[0]).toBeUndefined();
      }
    }
  });

  it("documents the honest scope note copy in the incidents view", () => {
    const source = readFileSync(
      new URL("incidents-monitoring-view.tsx", FEATURE_DIR),
      "utf8",
    );
    expect(source).toContain("page.incidents.monitoringNote");
  });
});
