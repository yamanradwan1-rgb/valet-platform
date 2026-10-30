import { AppShell, type AppShellProps } from "@valet/ui";
import { createElement } from "react";
import { describe, expect, it } from "vitest";

describe("@valet/ui public entry point", () => {
  it("exports AppShell as a component", () => {
    expect(AppShell).toBeTypeOf("function");
  });

  it("renders the title and preserves its children", () => {
    const child = createElement("p", null, "Active visit");
    const props: AppShellProps = {
      title: "VAYLET Operations",
      children: child,
    };
    const shell = AppShell(props);

    expect(shell.type).toBe("main");
    expect(shell.props.children).toEqual([
      expect.objectContaining({
        type: "h1",
        props: expect.objectContaining({ children: "VAYLET Operations" }),
      }),
      child,
    ]);
  });
});
