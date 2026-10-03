import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { employeePalettes } from "../src/appearance/employee-palette";
import { appearanceNodes } from "./appearance-render-tree";

describe("root appearance restoration and splash lifecycle", () => {
  it("mounts children during restore, reveals once and changes bars without replacing the tree", async () => {
    const hide = vi.fn(async () => undefined);
    const prevent = vi.fn(async () => undefined);
    const capture = vi.fn();
    const setColorScheme = vi.fn();
    const state = { ready: false, palette: employeePalettes.light };
    const refs: { current: boolean }[] = [];
    let cursor = 0;
    const effects: (() => void)[] = [];
    const Stack = Object.assign(() => undefined, { Screen: "StackScreen" });
    const jsx = (type: unknown, props: Record<string, unknown>) => ({
      type,
      props,
    });
    const require = (name: string) => {
      if (name === "react")
        return {
          useRef: (value: boolean) => (refs[cursor++] ??= { current: value }),
          useCallback: (callback: unknown) => callback,
          useEffect: (effect: () => void) => effects.push(effect),
        };
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "react-native") return { Appearance: { setColorScheme } };
      if (name === "expo-router") return { Stack };
      if (name === "expo-splash-screen")
        return { preventAutoHideAsync: prevent, hideAsync: hide };
      if (name.includes("native-push-response-bootstrap"))
        return { startNativePushResponseCapture: capture };
      if (name.includes("employee-appearance-context"))
        return {
          EmployeeAppearanceProvider: "AppearanceProvider",
          useEmployeeAppearance: () => state,
        };
      if (name === "expo-status-bar") return { StatusBar: "StatusBar" };
      if (name === "react-native-safe-area-context")
        return { SafeAreaProvider: "SafeAreaProvider" };
      if (name === "react-native-gesture-handler")
        return { GestureHandlerRootView: "GestureRoot" };
      throw Error(name);
    };
    const exports: {
      default?: () => { props: { children: { type: () => unknown } } };
    } = {};
    const source = fs.readFileSync(path.resolve("app/_layout.tsx"), "utf8");
    const js = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText;
    Function("require", "exports", js)(require, exports);
    const root = exports.default!();
    const render = () => {
      cursor = 0;
      const nodes = appearanceNodes(root.props.children.type());
      effects.splice(0).forEach((effect) => effect());
      return nodes;
    };
    const restoring = render();
    expect(restoring.some((n) => n.type === Stack)).toBe(true);
    expect(restoring[0]!.props.pointerEvents).toBe("none");
    (restoring[0]!.props.onLayout as () => void)();
    expect(hide).not.toHaveBeenCalled();
    state.ready = true;
    state.palette = employeePalettes.dark;
    const dark = render();
    expect(dark[0]!.props.pointerEvents).toBe("auto");
    expect(dark.find((n) => n.type === "StatusBar")!.props.style).toBe("light");
    expect(setColorScheme).toHaveBeenLastCalledWith("dark");
    expect(hide).toHaveBeenCalledOnce();
    state.palette = employeePalettes.light;
    const light = render();
    expect(light.map((n) => n.type)).toEqual(dark.map((n) => n.type));
    expect(light.every((n) => !("key" in n.props))).toBe(true);
    expect(setColorScheme).toHaveBeenLastCalledWith("light");
    expect(hide).toHaveBeenCalledOnce();
    expect(prevent).toHaveBeenCalledOnce();
    expect(capture).toHaveBeenCalledOnce();
  });
});
