import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { captureNativeStyleSheets } from "./appearance-style-evidence";

const root = path.resolve("src");
const fixture = path.resolve("test/fixtures/issue-253-light-styles.json");
const b1CardSheet = "check-in/native-condition-photo-b1-styles.ts:nativeConditionPhotoB1Styles";
describe("pushed #226 appearance geometry/color baseline", () => {
  it("preserves every baseline style in Light and all geometry in Dark", () => {
    const sheets = captureNativeStyleSheets(root);
    if (process.env.VAYLET_CAPTURE_LIGHT_BASELINE === "1") {
      fs.writeFileSync(fixture, JSON.stringify(sheets, null, 2) + "\n");
    }
    const baseline = JSON.parse(fs.readFileSync(fixture, "utf8")) as Record<
      string,
      unknown
    >;
    expect(Object.keys(sheets).filter((name) => name !== b1CardSheet).sort())
      .toEqual(Object.keys(baseline).sort());
    const b1 = sheets[b1CardSheet] as { light?: unknown; dark?: unknown } | undefined;
    expect(b1?.light, "only approved #336 photo card adds a themed sheet").toBeDefined();
    expect(geometry(b1?.dark), "#336 card theme retains Light/Dark geometry")
      .toEqual(geometry(b1?.light));
    for (const [name, sheet] of Object.entries(sheets)) {
      if (name === b1CardSheet) continue;
      const themed = sheet as { light?: unknown; dark?: unknown };
      const light = themed.light ?? sheet;
      const normalized = name === "shift/native-shift-diagnostics-card.tsx:styles"
        ? Object.fromEntries(Object.entries(light as Record<string, unknown>)
            .filter(([key]) => key !== "pinned" && key !== "sectionTitle"))
        : light;
      expect(normalized, name).toEqual(baseline[name]);
      if (themed.dark)
        expect(geometry(themed.dark), name).toEqual(geometry(light));
    }
  });
});

function geometry(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(geometry);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !/color/i.test(key))
      .map(([key, entry]) => [key, geometry(entry)]),
  );
}
