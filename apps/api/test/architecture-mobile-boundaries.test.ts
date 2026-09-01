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
  ])("rejects %s", async (_name, source) => {
    const result = await runFixture({
      "packages/employee-client/src/example.ts": source,
    });
    expect(result.violations.join("\n")).toContain(
      "portable Employee client must not import",
    );
  });

  it("allows contracts and ordinary platform-neutral TypeScript dependencies", async () => {
    const result = await runFixture({
      "packages/employee-client/src/example.ts":
        'import { z } from "zod";\nexport type { StaffPrincipal } from "@valet/contracts";\nexport const schema = z.string();',
    });
    expect(result.violations).toEqual([]);
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
        "const dependency = 'next';\nvoid import(`${dependency}`);",
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
