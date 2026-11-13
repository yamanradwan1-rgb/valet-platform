import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { captureNativeStyleSheets } from "./appearance-style-evidence";

const root = path.resolve("src");
const fixture = path.resolve("test/fixtures/issue-253-light-styles.json");
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
    // Issue #310 explicitly permits this one new fixture control. The original
    // baseline is unchanged; every original style remains compared below.
    const addedControl =
      "prototypes/whatsapp/native-whatsapp-prototype-button.tsx:whatsAppPrototypeStyles";
    expect(
      Object.keys(sheets)
        .filter((name) => name !== addedControl)
        .sort(),
    ).toEqual(Object.keys(baseline).sort());
    for (const [name, sheet] of Object.entries(sheets)) {
      const themed = sheet as { light?: unknown; dark?: unknown };
      const light = themed.light ?? sheet;
      const normalized =
        name === "shift/native-shift-diagnostics-card.tsx:styles"
          ? Object.fromEntries(
              Object.entries(light as Record<string, unknown>).filter(
                ([key]) => key !== "pinned" && key !== "sectionTitle",
              ),
            )
          : light;
      if (name !== addedControl)
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
