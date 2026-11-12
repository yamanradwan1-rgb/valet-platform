import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { captureNativeStyleSheets } from "./appearance-style-evidence";

const root = path.resolve("src");
const fixture = path.resolve("test/fixtures/issue-253-light-styles.json");
const b1CardSheet =
  "check-in/native-condition-photo-b1-styles.ts:nativeConditionPhotoB1Styles";
const colorSheet =
  "check-in/native-check-in-color-styles.ts:nativeCheckInColorStyles";
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
    expect(
      Object.keys(sheets)
        .filter((name) => name !== b1CardSheet && name !== colorSheet)
        .sort(),
    ).toEqual(Object.keys(baseline).sort());
    const b1 = sheets[b1CardSheet] as
      { light?: unknown; dark?: unknown } | undefined;
    expect(
      b1?.light,
      "only approved #336 photo card adds a themed sheet",
    ).toBeDefined();
    expect(
      geometry(b1?.dark),
      "#336 card theme retains Light/Dark geometry",
    ).toEqual(geometry(b1?.light));
    const color = sheets[colorSheet] as
      | { light?: Record<string, unknown>; dark?: Record<string, unknown> }
      | undefined;
    expect(
      color?.light,
      "approved #451 color selector sheet exists in Light",
    ).toBeDefined();
    expect(
      color?.dark,
      "approved #451 color selector sheet exists in Dark",
    ).toBeDefined();
    expect(color?.light).toMatchObject({
      grid: { gap: 4 },
      row: { flexDirection: "row", gap: 4 },
      tile: { minHeight: 48 },
      swatch: { width: 22, height: 15 },
      selected: {
        backgroundColor: "#EDF4FF",
        borderColor: "#0F54CB",
        borderWidth: 2,
      },
      customInputFocused: { borderColor: "#0F54CB", borderWidth: 2 },
    });
    expect(color?.dark).toMatchObject({
      selected: {
        backgroundColor: "#142D52",
        borderColor: "#80B0FF",
        borderWidth: 2,
      },
      customInputFocused: { borderColor: "#80B0FF", borderWidth: 2 },
    });
    expect(
      geometry(color?.dark),
      "#451 color selector retains Light/Dark geometry",
    ).toEqual(geometry(color?.light));
    for (const [name, sheet] of Object.entries(sheets)) {
      if (name === b1CardSheet || name === colorSheet) continue;
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
