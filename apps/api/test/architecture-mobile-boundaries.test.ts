import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { checkArchitecture } from "../../../scripts/architecture-check.mjs";
import { BASELINE_SOURCE_COMMIT } from "../../../scripts/architecture-line-policy.mjs";

const executeFile = promisify(execFile);
const temporaryRoots: string[] = [];
const packageFiles = {
  "apps/api/package.json": '{"name":"@valet/api"}',
  "apps/valet/package.json": '{"name":"@valet/valet"}',
  "apps/valet-native/package.json": '{"name":"@example/native-shell"}',
  "packages/contracts/package.json": '{"name":"@valet/contracts"}',
  "packages/database/package.json": '{"name":"@valet/database"}',
  "packages/employee-client/package.json": '{"name":"@example/portable"}',
  "packages/ui/package.json": '{"name":"@valet/ui"}',
};

async function runFixture(files: Record<string, string>) {
  const root = await mkdtemp(resolve(tmpdir(), "valet-mobile-boundary-"));
  temporaryRoots.push(root);
  await executeFile("git", ["init", "--quiet"], { cwd: root });
  const fixtureFiles = {
    "scripts/architecture-line-baseline.json": JSON.stringify({
      grandfathered: [],
      sourceCommit: BASELINE_SOURCE_COMMIT,
      version: 1,
    }),
    ...packageFiles,
    ...files,
  };
  for (const [path, value] of Object.entries(fixtureFiles)) {
    const target = resolve(root, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, value);
  }
  return checkArchitecture(root, async () => new Map());
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { force: true, recursive: true })),
  );
});

describe("portable Employee client boundary", () => {
  it.each([
    ["Next.js", 'import "next/navigation";'],
    ["React DOM", 'import "react-dom/client";'],
    ["React Native", 'import "react-native";'],
    ["Expo", 'import "expo-notifications";'],
    ["Node built-in", 'import "node:fs";'],
    ["Employee Web relative", 'import "../../../apps/valet/src/web";'],
    ["Employee Web package", 'import "@valet/valet/internal";'],
    ["Native relative", 'import "../../../apps/valet-native/src/screen";'],
    ["Native package", 'import "@example/native-shell/screen";'],
    ["API relative", 'import "../../../apps/api/src/main";'],
    ["API package", 'import "@valet/api/server";'],
    ["database/server package", 'import "@valet/database";'],
    ["shared UI package", 'import "@valet/ui";'],
    ["React UI runtime", 'import "react";'],
  ])("rejects %s", async (_name, source) => {
    const result = await runFixture({
      "packages/employee-client/src/example.ts": source,
    });
    expect(result.violations.join("\n")).toContain(
      "portable Employee client must not import",
    );
  });

  it("allows contracts root and subpath platform-neutral dependencies", async () => {
    const result = await runFixture({
      "packages/employee-client/src/example.ts":
        'import { apiErrorSchema } from "@valet/contracts/api-errors";\nimport { staffNativeAuthResponseSchema } from "@valet/contracts/staff-auth";\nimport { staffOperationalContextResponseSchema } from "@valet/contracts/staff-context";\nimport { z } from "zod";\nexport type { StaffPrincipal, StaffTaskQueueItem } from "@valet/contracts";\nexport const schema = z.string();\nvoid apiErrorSchema;\nvoid staffNativeAuthResponseSchema;\nvoid staffOperationalContextResponseSchema;',
    });
    expect(result.violations).toEqual([]);
  });

  it.each([
    "window",
    "document",
    "navigator",
    "localStorage",
    "sessionStorage",
    "DOMException",
    "Request",
    "Response",
    "RequestInit",
    "fetch",
  ])("rejects the browser global %s", async (globalName) => {
    const result = await runFixture({
      "packages/employee-client/src/example.ts": `void ${globalName};`,
    });
    expect(result.violations.join("\n")).toContain(
      "portable Employee client global boundary",
    );
  });

  it.each([
    ["plain window", "void window;", true],
    [
      "window in template interpolation",
      "const value = `${window.location}`;",
      true,
    ],
    [
      "globalThis.fetch in template interpolation",
      "const value = `${globalThis.fetch}`;",
      true,
    ],
    ["window in an ordinary string", 'const value = "window";', false],
    ["window in a line comment", "// window\nconst value = 1;", false],
    ["window in static template text", "const value = `window`;", false],
  ])("handles %s as executable code only", async (_name, source, rejected) => {
    const result = await runFixture({
      "packages/employee-client/src/example.ts": source,
    });
    const hasPortableGlobalViolation = result.violations.some((violation) =>
      violation.includes("portable Employee client global boundary"),
    );
    expect(hasPortableGlobalViolation).toBe(rejected);
  });

  it("covers dynamic import and CommonJS require forms", async () => {
    const result = await runFixture({
      "packages/employee-client/src/example.ts":
        'const web = import("next");\nconst server = require("node:fs");',
    });
    expect(result.violations).toHaveLength(2);
  });

  it("rejects static template-literal module specifiers", async () => {
    const result = await runFixture({
      "packages/employee-client/src/example.ts":
        "const web = import(`next`);\nconst server = require(`node:fs`);",
    });
    expect(result.violations).toHaveLength(2);
    expect(result.violations.join("\n")).toContain("Next.js");
    expect(result.violations.join("\n")).toContain("Node runtime dependency");
  });

  it("normalizes escaped static module specifiers before enforcement", async () => {
    const result = await runFixture({
      "packages/employee-client/src/example.ts": String.raw`
        import("ne\u0078t");
        import("react\u002ddom");
        require("node\u003afs");
      `,
    });
    expect(result.violations).toHaveLength(3);
    expect(result.violations.join("\n")).toContain("Next.js");
    expect(result.violations.join("\n")).toContain("React DOM");
    expect(result.violations.join("\n")).toContain("Node runtime dependency");
  });

  it("does not treat a template expression as a known static module target", async () => {
    const result = await runFixture({
      "packages/employee-client/src/example.ts":
        'const dependency = "next";\nvoid import(`${dependency}`);\nvoid import(`${"next"}`);',
    });
    expect(result.violations).toEqual([]);
  });
});

describe("Employee Native and Web boundaries", () => {
  it.each([
    ["Web relative", 'import "../../valet/src/web";'],
    ["Web package", 'import "@valet/valet/internal";'],
    ["Next.js", 'import "next/router";'],
    ["React DOM", 'import "react-dom";'],
    ["API relative", 'import "../../api/src/main";'],
    ["API package", 'import "@valet/api/server";'],
  ])("rejects Native -> %s", async (_name, source) => {
    const result = await runFixture({
      "apps/valet-native/src/example.ts": source,
    });
    expect(result.violations.join("\n")).toContain(
      "Employee Native must not import",
    );
  });

  it("allows Native platform, contracts, and discovered portable package imports", async () => {
    const result = await runFixture({
      "apps/valet-native/src/example.ts": [
        'import "react-native";',
        'import "expo";',
        'import "expo-router";',
        'import "@valet/contracts";',
        'import "@example/portable";',
      ].join("\n"),
    });
    expect(result.violations).toEqual([]);
  });

  it("rejects Employee Web importing Native by relative or workspace specifier", async () => {
    const relative = await runFixture({
      "apps/valet/src/example.ts": 'import "../../valet-native/src/screen";',
    });
    expect(relative.violations.join("\n")).toContain(
      "Employee Web must not import Native implementation",
    );
    const workspace = await runFixture({
      "apps/valet/src/example.ts": 'import "@example/native-shell/screen";',
    });
    expect(workspace.violations.join("\n")).toContain(
      "Employee Web must not import Native implementation",
    );
  });
});

describe("existing API architecture regression", () => {
  it("still rejects a representative Check-In -> Anti-Abuse edge", async () => {
    const result = await runFixture({
      "apps/api/src/modules/check-in-api/source.ts":
        'import "../anti-abuse/service";',
    });
    expect(result.violations.join("\n")).toContain(
      "check-in must not import anti-abuse",
    );
  });
});
