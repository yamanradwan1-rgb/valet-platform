import { resolveAppearanceTree } from "./appearance-render-tree";
export {
  appearanceGeometry,
  uncoloredAppearanceText,
} from "./appearance-render-tree";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import ts from "typescript";
import * as client from "@valet/employee-client";
import {
  employeePalettes,
  type EmployeeAppearanceMode,
} from "../src/appearance/employee-palette";

type Module = Record<string, unknown>;
const sourceRoot = path.resolve("src");
const baselineSources = new Map<string, string>();
const compiledSources = new Map<string, string>();
export const appearanceBaseline = "bc4fdb453fcae61e740c08941cff018257941468";

let loadedBaselineRef = "";
function readBaselineSources(ref: string) {
  if (baselineSources.size && loadedBaselineRef === ref) return;
  baselineSources.clear();
  loadedBaselineRef = ref;
  const names = execFileSync(
    "git",
    ["ls-tree", "-r", "--name-only", ref, "--", "apps/valet-native/src"],
    { encoding: "utf8", cwd: path.resolve(sourceRoot, "../../..") },
  )
    .trim()
    .split(/\r?\n/)
    .filter((name) => /\.(tsx?|mjs)$/.test(name));
  const data = execFileSync("git", ["cat-file", "--batch"], {
    input: names.map((name) => `${ref}:${name}\n`).join(""),
    maxBuffer: 16 * 1024 * 1024,
  });
  let offset = 0;
  for (const name of names) {
    const end = data.indexOf(10, offset);
    const header = data.subarray(offset, end).toString("utf8").split(" ");
    if (header[1] !== "blob") throw Error(`Invalid baseline blob ${name}`);
    const size = Number(header[2]);
    offset = end + 1;
    baselineSources.set(
      path.resolve(sourceRoot, name.slice("apps/valet-native/src/".length)),
      data.subarray(offset, offset + size).toString("utf8"),
    );
    offset += size + 1;
  }
}

// Trusted repository source is transpiled in memory. No checkout/worktree or
// native runtime is created. Native hosts, effects and business I/O are stubbed.
export function appearanceRenderer(
  mode: EmployeeAppearanceMode,
  baseline = false,
  appearance?: {
    current(): { mode: EmployeeAppearanceMode };
    select: (mode: EmployeeAppearanceMode) => void;
  },
  evidence?: {
    readonly baselineRef?: string;
    readonly width?: number;
    readonly fontScale?: number;
  },
) {
  const cache = new Map<string, Module>();
  const palette = () => employeePalettes[appearance?.current().mode ?? mode];
  const jsx = (type: unknown, props: Record<string, unknown>) => ({
    type,
    props,
  });
  const noop = () => undefined;
  const react = {
    Fragment: "Fragment",
    useEffect: noop,
    useLayoutEffect: noop,
    useState: (value: unknown) => [
      typeof value === "function" ? value() : value,
      noop,
    ],
    useRef: (value: unknown) => ({ current: value }),
    useMemo: (factory: () => unknown) => factory(),
    useCallback: (callback: unknown) => callback,
    useSyncExternalStore: (_s: unknown, current: () => unknown) => current(),
  };
  function load(relative: string): Module {
    const base = path.resolve(sourceRoot, relative);
    if (!base.startsWith(sourceRoot + path.sep))
      throw Error("Outside Native source");
    const file = [base, base + ".tsx", base + ".ts"].find(
      (f) => /\.(tsx?|mjs)$/.test(f) && fs.existsSync(f),
    );
    if (!file) throw Error(`Missing Native module ${relative}`);
    if (cache.has(file)) return cache.get(file)!;
    const module = { exports: {} as Module };
    cache.set(file, module.exports);
    if (baseline)
      readBaselineSources(evidence?.baselineRef ?? appearanceBaseline);
    const source = baseline
      ? baselineSources.get(file)!
      : fs.readFileSync(file, "utf8");
    const require = (name: string): unknown => {
      if (name === "react") return react;
      if (name === "react/jsx-runtime")
        return { jsx, jsxs: jsx, Fragment: "Fragment" };
      if (name === "@valet/employee-client") return client;
      if (name === "expo-router") return { useFocusEffect: noop };
      if (name === "expo-file-system") {
        // Render-only: permit the real Condition Photo owner to construct its
        // cache handle without any device filesystem or test data mutation.
        // React effects are inert in this matrix, so no file IO is performed.
        return {
          Directory: class {},
          File: class {},
          Paths: { cache: { uri: "file:///appearance-render-cache" } },
        };
      }
      if (/employee-appearance-context$/.test(name))
        return {
          useEmployeePalette: palette,
          useEmployeeStyles: (styles: Record<string, unknown>) =>
            styles[palette().mode],
          useEmployeeAppearance: () => ({
            palette: palette(),
            ready: true,
            select: appearance?.select ?? noop,
          }),
        };
      if (/native-telemetry-owner$/.test(name))
        return {
          getNativeTelemetry: () => ({
            snapshot: () => ({
              provenance: {
                appBuild: "1",
                appVersion: "1",
                platform: "android",
              },
              events: [],
            }),
          }),
        };
      if (name.endsWith(".png")) return name;
      if (name.startsWith("."))
        return load(
          path.relative(sourceRoot, path.resolve(path.dirname(file), name)),
        );
      if (name === "react-native")
        return new Proxy(
          {
            StyleSheet: { create: (v: unknown) => v, absoluteFill: {} },
            Platform: { OS: "android" },
            Animated: { Value: class {}, View: "AnimatedView" },
            useWindowDimensions: () => ({
              width: evidence?.width ?? 320,
              height: 640,
              fontScale: evidence?.fontScale ?? 1,
              scale: 1,
            }),
            AppState: {
              currentState: "active",
              addEventListener: () => ({ remove: noop }),
            },
          } as Module,
          { get: (target, key) => target[String(key)] ?? String(key) },
        );
      return new Proxy({}, { get: (_target, key) => String(key) });
    };
    let js = compiledSources.get(source);
    if (!js) {
      js = ts.transpileModule(source, {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.CommonJS,
          jsx: ts.JsxEmit.ReactJSX,
          esModuleInterop: true,
        },
      }).outputText;
      compiledSources.set(source, js);
    }
    Function(
      "require",
      "module",
      "exports",
      js,
    )(require, module, module.exports);
    return module.exports;
  }
  return {
    load,
    render: (
      file: string,
      name: string,
      props: Record<string, unknown>,
      omitAppearance = false,
      interactive = false,
    ) =>
      resolveAppearanceTree(
        (load(file)[name] as (props: unknown) => unknown)(props),
        omitAppearance,
        interactive,
      ),
  };
}
