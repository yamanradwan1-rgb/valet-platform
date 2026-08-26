import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Initial-focus contract for the shared ListDetailSheet (D5-001).
 *
 * WHY a source invariant: focus effects never run under react-dom/server,
 * so live document.activeElement behavior cannot be executed in the node
 * harness (same rationale as branding-editor-a11y.test.tsx). The accepted
 * dashboard pattern — dashboard-overview/detail-sheet.tsx — focuses its
 * panel ref on mount with tabIndex={-1}; this pins the equivalent pattern
 * on the shared sheet used by sessions/tasks/retrieval-queue detail views
 * AND every map-setup editor sheet. Without it, keyboard and screen-reader
 * users stay focused behind the modal while forms open unfocused.
 */

const SOURCE = readFileSync(new URL("./list-detail-sheet.tsx", import.meta.url), "utf8");

describe("ListDetailSheet initial focus", () => {
  it("moves focus into the panel on mount via the accepted ref pattern", () => {
    expect(SOURCE.includes("panelRef.current?.focus()")).toBe(true);
    expect(/useEffect\(\(\) => \{\s*panelRef\.current\?\.focus\(\);\s*\}, \[\]\);/u.test(SOURCE)).toBe(
      true,
    );
  });

  it("makes the focusable panel programmatically focusable", () => {
    expect(/className="detail-sheet" tabIndex=\{-1\}/u.test(SOURCE)).toBe(
      true,
    );
  });
});
