import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { checkArchitecture } from "../../../scripts/architecture-check.mjs";

async function runFixture(files: Record<string, string>) {
  const fixtureRoot = await mkdtemp(resolve(tmpdir(), "valet-architecture-"));
  try {
    const fixtureFiles = {
      "scripts/architecture-line-baseline.json": JSON.stringify({
        grandfathered: [],
        sourceCommit: "1b5db989252dbf8d47b9fe7f81e55a96ed012c56",
        version: 1,
      }),
      ...files,
    };
    for (const [file, content] of Object.entries(fixtureFiles)) {
      const filePath = resolve(fixtureRoot, file);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, content);
    }
    const result = await checkArchitecture(fixtureRoot, async () => new Map());
    return {
      code: result.violations.length === 0 ? 0 : 1,
      output: result.violations
        .map((violation) => `ARCHITECTURE VIOLATION ${violation}`)
        .join("\n"),
    };
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

  it("rejects Auth to Guest Access with comments and normalized path segments", async () => {
    const result = await runFixture(
      source(
        "modules/auth",
        `import {
          value
        } from /* architecture-neutral comment */ "../auth/../guest-access/value";`,
      ),
    );
    expect(result.code).toBe(1);
    expect(result.output).toContain("auth must not import guest-access");
  });

  it("rejects a commented side-effect import with normalized path segments", async () => {
    const result = await runFixture(
      source(
        "modules/check-in-api",
        'import /* comment */ "../auth/../guest-access/value";',
      ),
    );
    expect(result.code).toBe(1);
    expect(result.output).toContain("check-in must not import guest-access");
  });

  it("rejects common to modules with comment-separated static import syntax", async () => {
    const result = await runFixture(
      source(
        "common",
        'import { value } /* comment before from */ from /* comment */ "../modules/auth/value";',
      ),
    );
    expect(result.code).toBe(1);
    expect(result.output).toContain(
      "common must not import application modules",
    );
  });

  it("rejects comment-separated export-from syntax", async () => {
    const result = await runFixture(
      source(
        "modules/auth",
        'export * /* comment */ from /* comment */ "../auth/../guest-access/value";',
      ),
    );
    expect(result.code).toBe(1);
    expect(result.output).toContain("auth must not import guest-access");
  });

  it("ignores import-like text inside ordinary strings", async () => {
    const result = await runFixture(
      source(
        "modules/auth",
        "const example = 'import \"../guest-access/value\"';",
      ),
    );
    expect(result).toEqual({ code: 0, output: "" });
  });

  it("ignores import/export-like text inside comments", async () => {
    const result = await runFixture(
      source(
        "modules/auth",
        `// import "../guest-access/value";
        /* export * from "../check-in-api/value"; */
        export const value = true;`,
      ),
    );
    expect(result).toEqual({ code: 0, output: "" });
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

  it("rejects an otherwise valid ungrandfathered oversized source file", async () => {
    const result = await runFixture(
      source("modules/auth", `${"\n".repeat(451)}export const value = true;`),
    );
    expect(result.code).toBe(1);
    expect(result.output).toContain("NEW_OR_UNGRANDFATHERED_OVERSIZED_FILE");
  });
});
