import { describe, expect, it, vi } from "vitest";
import { appearanceRenderer } from "./appearance-render-evidence";
import { appearanceNodes } from "./appearance-render-tree";
import { shellRenderCases } from "./appearance-render-cases";
import { NativeAppearanceOwner } from "../src/appearance/native-appearance-owner";

describe("EN/AR Settings appearance radios", () => {
  it.each(["en", "ar"] as const)(
    "changes only presentation immediately in %s",
    async (locale) => {
      const write = vi.fn();
      const owner = new NativeAppearanceOwner({
        read: async () => null,
        write,
      });
      await owner.restore();
      const renderer = appearanceRenderer("light", false, owner);
      const settings = shellRenderCases.find((c) => c.name === "Settings")!;
      const render = () =>
        renderer.render(
          settings.file,
          settings.component,
          settings.props(renderer, locale),
          false,
          true,
        );
      const choices = () => {
        const group = appearanceNodes(render()).find(
          (n) => n.props.testID === "native-appearance-choices",
        )!;
        expect(group.props.accessibilityRole).toBe("radiogroup");
        return appearanceNodes(group.props.children).filter(
          (n) => n.props.accessibilityRole === "radio",
        );
      };
      const nodes = appearanceNodes(render());
      expect(
        nodes.find((n) => n.props.testID === "native-account-menu")!.props
          .style,
      ).toMatchObject({ direction: locale === "ar" ? "rtl" : "ltr" });
      expect(choices().map((n) => n.props.accessibilityLabel)).toEqual(
        locale === "ar" ? ["فاتح", "داكن"] : ["Light", "Dark"],
      );
      expect(choices().map((n) => n.props.accessibilityState)).toEqual([
        { selected: true },
        { selected: false },
      ]);
      (choices()[1]!.props.onPress as () => void)();
      expect(owner.current().mode).toBe("dark");
      expect(choices().map((n) => n.props.accessibilityState)).toEqual([
        { selected: false },
        { selected: true },
      ]);
      (choices()[0]!.props.onPress as () => void)();
      expect(owner.current().mode).toBe("light");
      await owner.settled();
      expect(write.mock.calls.map(([v]) => JSON.parse(v))).toEqual([
        { version: 1, theme: "dark" },
        { version: 1, theme: "light" },
      ]);
    },
  );
});
