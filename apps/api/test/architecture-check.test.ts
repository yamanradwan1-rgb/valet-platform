import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const executeFile = promisify(execFile);

function repositoryRoot() {
  let directory = process.cwd();
  while (dirname(directory) !== directory) {
    if (directory.endsWith("valet-platform")) {
      return directory;
    }
    directory = dirname(directory);
  }
  throw new Error("Could not locate repository root.");
}

const checker = resolve(repositoryRoot(), "scripts/architecture-check.mjs");

async function runFixture(files: Record<string, string>) {
  const fixtureRoot = await mkdtemp(resolve(tmpdir(), "valet-architecture-"));
  try {
    for (const [file, content] of Object.entries(files)) {
      const filePath = resolve(fixtureRoot, file);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, content);
    }
    try {
      const result = await executeFile(process.execPath, [
        checker,
        "--root",
        fixtureRoot,
      ]);
      return { code: 0, output: `${result.stdout}${result.stderr}` };
    } catch (error) {
      const failure = error as {
        code?: number;
        stdout?: string;
        stderr?: string;
      };
      return {
        code: failure.code ?? 1,
        output: `${failure.stdout ?? ""}${failure.stderr ?? ""}`,
      };
    }
  } finally {
    await rm(fixtureRoot, { force: true, recursive: true });
  }
}

function source(area: string, content: string) {
  return { [`apps/api/src/${area}/source.ts`]: content };
}

describe("architecture check", () => {
  it.each([
    ["common -> module", "common", 'import "../modules/auth/auth";'],
    ["anti-abuse -> Auth", "modules/anti-abuse", 'import "../auth/auth";'],
    [
      "anti-abuse -> Guest Access",
      "modules/anti-abuse",
      'import "../guest-access/guest";',
    ],
    [
      "anti-abuse -> Check-In",
      "modules/anti-abuse",
      'import "../check-in-api/check";',
    ],
    ["Auth -> Guest Access", "modules/auth", 'import "../guest-access/guest";'],
    ["Auth -> Check-In", "modules/auth", 'import "../check-in-api/check";'],
    [
      "Guest Access -> Check-In",
      "modules/guest-access",
      'import "../check-in-api/check";',
    ],
    [
      "Check-In -> Guest Access",
      "modules/check-in-api",
      'import "../guest-access/guest";',
    ],
    [
      "Check-In -> Anti-Abuse",
      "modules/check-in-api",
      'import "../anti-abuse/anti";',
    ],
  ])("rejects %s", async (_name, area, content) => {
    const result = await runFixture(source(area, content));
    expect(result.code).toBe(1);
    expect(result.output).toContain("ARCHITECTURE VIOLATION");
  });

  it("allows current dependency directions and static import forms", async () => {
    const result = await runFixture({
      ...source("modules/auth", 'import "../../common/http/api";'),
      "apps/api/src/modules/guest-access/source.ts":
        'export * from "../auth/staff-principal";',
      "apps/api/src/modules/check-in-api/source.ts":
        'import "../vehicles/vehicle";',
    });
    expect(result).toEqual({ code: 0, output: "" });
  });

  it("normalizes relative path segments and Windows separators before checking", async () => {
    const result = await runFixture(
      source(
        "modules/check-in-api",
        'export * from "..\\auth\\..\\guest-access\\guest";',
      ),
    );
    expect(result.code).toBe(1);
    expect(result.output).toContain("check-in must not import guest-access");
  });

  it.each([
    "CheckInApiModule",
    "CHECK_IN_POSTGRES_POOL",
    "GuestCheckInController",
  ])("rejects retired symbol %s in application source", async (symbol) => {
    const result = await runFixture(
      source("modules/auth", `const value = ${symbol};`),
    );
    expect(result.code).toBe(1);
    expect(result.output).toContain(`retired architecture symbol ${symbol}`);
  });

  it("does not scan retired-symbol mentions outside application source", async () => {
    const result = await runFixture({
      "docs/history.md": "CheckInApiModule",
      ...source("modules/auth", "export const value = true;"),
    });
    expect(result).toEqual({ code: 0, output: "" });
  });

  it("warns but succeeds for an otherwise valid oversized source file", async () => {
    const result = await runFixture(
      source("modules/auth", `${"\n".repeat(451)}export const value = true;`),
    );
    expect(result.code).toBe(0);
    expect(result.output).toContain("WARNING");
  });
});
