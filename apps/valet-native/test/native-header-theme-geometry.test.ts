import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { NativeAppearanceOwner } from "../src/appearance/native-appearance-owner";
import { appearanceRenderer } from "./appearance-render-evidence";
import { appearanceGeometry, appearanceNodes } from "./appearance-render-tree";
import { shellRenderCases } from "./appearance-render-cases";

const headerCase = shellRenderCases.find((c) => c.name === "shell header")!;
const expectedSlot = { flexShrink: 1, height: 28, width: (28 * 169) / 60 };

function pngDimensions(path: string) {
  const png = readFileSync(path);
  return { height: png.readUInt32BE(20), width: png.readUInt32BE(16) };
}

function headerEvidence(
  renderer: ReturnType<typeof appearanceRenderer>,
  locale: "en" | "ar",
) {
  const tree = renderer.render(
    headerCase.file,
    headerCase.component,
    headerCase.props(renderer, locale),
  );
  const nodes = appearanceNodes(tree);
  const header = nodes.find(
    (node) => node.props.testID === "employee-app-header",
  )!;
  const slot = nodes.find(
    (node) => node.props.testID === "employee-header-logo-slot",
  )!;
  const image = appearanceNodes(slot.props.children).find(
    (node) => node.type === "Image",
  )!;
  const [brand, utilities] = header.props.children as Array<{
    props: Record<string, unknown>;
  }>;
  if (!brand || !utilities) throw new Error("Incomplete shared header");
  const [, divider, context] = brand!.props.children as Array<{
    props: Record<string, unknown>;
  }>;
  if (!divider || !context) throw new Error("Incomplete brand context");
  const [name, code] = context!.props.children as Array<{
    props: Record<string, unknown>;
  }>;
  if (!name || !code) throw new Error("Incomplete location context");
  return {
    brand,
    code,
    context,
    divider,
    header,
    image,
    name,
    slot,
    utilities,
  };
}

function settingsAvatar(
  renderer: ReturnType<typeof appearanceRenderer>,
  locale: "en" | "ar",
) {
  const settings = shellRenderCases.find((c) => c.name === "Settings")!;
  const tree = renderer.render(
    settings.file,
    settings.component,
    settings.props(renderer, locale),
  );
  return appearanceNodes(tree).find(
    (node) => node.props.testID === "native-role-avatar",
  )!;
}

describe("Native shared header theme geometry", () => {
  it("keeps the Light-baseline slot independent from differing official asset ratios", () => {
    const root = resolve(import.meta.dirname, "..");
    const light = pngDimensions(
      resolve(root, "assets/brand/VAYLET_Logo_Light_Background.png"),
    );
    const dark = pngDimensions(
      resolve(root, "assets/brand/VAYLET_Logo_Dark_Background.png"),
    );

    expect(light).toEqual({ height: 60, width: 169 });
    expect(dark).toEqual({ height: 240, width: 744 });
    expect(light.width / light.height).not.toBe(dark.width / dark.height);
    expect(expectedSlot.width).toBeCloseTo(28 * (light.width / light.height));
  });

  it.each(["en", "ar"] as const)(
    "switches official logo source without changing shared header geometry in %s",
    async (locale) => {
      const owner = new NativeAppearanceOwner({
        read: async () => null,
        write: vi.fn(async () => undefined),
      });
      await owner.restore();
      const renderer = appearanceRenderer("light", false, owner);

      const light = headerEvidence(renderer, locale);
      const lightAvatar = settingsAvatar(renderer, locale);
      owner.select("dark");
      const dark = headerEvidence(renderer, locale);
      const darkAvatar = settingsAvatar(renderer, locale);

      expect(light.slot.props.style).toEqual(expectedSlot);
      expect(dark.slot.props.style).toEqual(expectedSlot);
      expect(light.image.props.source).not.toBe(dark.image.props.source);
      expect(String(light.image.props.source)).toContain(
        "VAYLET_Logo_Light_Background.png",
      );
      expect(String(dark.image.props.source)).toContain(
        "VAYLET_Logo_Dark_Background.png",
      );
      expect(light.image.props.resizeMode).toBe("contain");
      expect(dark.image.props.resizeMode).toBe("contain");
      expect(light.image.props.style).toEqual({ height: 28, width: "100%" });
      expect(dark.image.props.style).toEqual({ height: 28, width: "100%" });

      expect(appearanceGeometry(dark.header.props.style)).toEqual(
        appearanceGeometry(light.header.props.style),
      );
      expect(appearanceGeometry(dark.brand.props.style)).toEqual(
        appearanceGeometry(light.brand.props.style),
      );
      expect(dark.context.props.style).toEqual({ flexShrink: 1, minWidth: 0 });
      expect(appearanceGeometry(dark.divider.props.style)).toEqual(
        appearanceGeometry(light.divider.props.style),
      );
      expect(dark.utilities.props.style).toEqual(light.utilities.props.style);
      expect(appearanceGeometry(darkAvatar.props.style)).toEqual(
        appearanceGeometry(lightAvatar.props.style),
      );
      expect(appearanceGeometry(darkAvatar.props.style)).toMatchObject({
        height: 36,
        width: 36,
      });
      expect(dark.name.props.numberOfLines).toBe(1);
      expect(dark.code.props.numberOfLines).toBe(1);
      expect(dark.name.props.style).toMatchObject({
        fontSize: 13,
        lineHeight: 16,
      });
      expect(dark.code.props.style).toMatchObject({
        fontSize: 11,
        lineHeight: 14,
      });
      expect(dark.header.props.style).not.toEqual(light.header.props.style);
    },
  );

  it("keeps one shared header above production destination routing", () => {
    const workspace = readFileSync(
      resolve(
        import.meta.dirname,
        "../src/shell/native-production-workspace.tsx",
      ),
      "utf8",
    );
    expect(workspace.match(/<EmployeeAppHeader/g)).toHaveLength(1);
    expect(workspace.indexOf("<EmployeeAppHeader")).toBeLessThan(
      workspace.indexOf('shell.destination === "check-in"'),
    );
  });
});
