import { readFile } from "node:fs/promises";
import { URL } from "node:url";
import { describe, expect, it } from "vitest";

const root = new URL("../src/", import.meta.url);

describe("physical diagnostics development gate", () => {
  it("has no route and is guarded at both owner and UI boundaries", async () => {
    const [owner, card, shift] = await Promise.all([
      readFile(
        new URL("diagnostics/native-physical-diagnostics.ts", root),
        "utf8",
      ),
      readFile(
        new URL("diagnostics/native-physical-diagnostics-card.tsx", root),
        "utf8",
      ),
      readFile(new URL("shift/native-active-shift-panel.tsx", root), "utf8"),
    ]);
    expect(owner).toContain('typeof __DEV__ === "boolean" && __DEV__');
    expect(card).toContain("if (!__DEV__) return null");
    expect(shift).toContain('typeof __DEV__ === "boolean" && __DEV__');
    expect(card).not.toMatch(/fetch\(|axios|http:\/\/|https:\/\//);
  });
});
