import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const contracts = JSON.parse(read("packages/contracts/package.json"));
const native = JSON.parse(read("apps/valet-native/package.json"));

describe("contracts package Metro boundary", () => {
  it("places compiled Native code before import, keeping types and Node entries unchanged", () => {
    expect(contracts.type).toBe("module");
    expect(contracts.types).toBe("./src/index.ts");
    expect(Object.entries(contracts.exports["."])).toEqual([
      ["types", "./src/index.ts"],
      ["react-native", "./dist/index.js"],
      ["import", "./src/index.ts"],
      ["require", "./dist/index.js"],
      ["default", "./dist/index.js"],
    ]);
    for (const name of ["api-errors", "staff-auth", "staff-context"]) {
      expect(Object.entries(contracts.exports[`./${name}`])).toEqual([
        ["types", `./src/${name}.ts`],
        ["react-native", `./dist/${name}.js`],
        ["import", `./src/${name}.ts`],
        ["require", `./dist/${name}.js`],
        ["default", `./dist/${name}.js`],
      ]);
    }
  });

  it("retains Node ESM specifiers and authoritative runtime response validation", () => {
    expect(read("packages/contracts/src/index.ts")).toContain(
      'export * from "./api-errors.js";',
    );
    expect(read("packages/contracts/src/check-in.ts")).toContain(
      'from "./check-in-common.js"',
    );
    const transport = read(
      "packages/employee-client/src/employee-check-in-transport.ts",
    );
    expect(transport).toContain('from "@valet/contracts"');
    expect(transport).toContain("schema.safeParse(value)");
  });

  it("builds contracts before direct Native startup and preserves the POC build prerequisite", () => {
    for (const name of ["dev", "start"]) {
      expect(native.scripts[name]).toBe(
        "pnpm --filter @valet/contracts build && expo start --dev-client",
      );
    }
    const harness = read("scripts/mobile-poc.ps1");
    const build = harness.indexOf('pnpm --filter "@valet/api..." build');
    expect(build).toBeGreaterThan(-1);
    expect(build).toBeLessThan(harness.indexOf("start --dev-client"));
    const api = JSON.parse(read("apps/api/package.json"));
    expect(api.dependencies["@valet/contracts"]).toBe("workspace:*");
  });
});
