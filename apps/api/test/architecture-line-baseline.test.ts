import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { loadHistoricalBaselineFiles } from "../../../scripts/architecture-line-baseline.mjs";
import {
  BASELINE_SOURCE_COMMIT,
  evaluateHistoricalBaseline,
  evaluateLinePolicy,
  type LineBaseline,
} from "../../../scripts/architecture-line-policy.mjs";

function baseline(path: string, maxLines: number): LineBaseline {
  return {
    grandfathered: [{ path, maxLines }],
    sourceCommit: BASELINE_SOURCE_COMMIT,
    version: 1,
  };
}

function content(lines: number) {
  return Array.from({ length: lines }, () => "line").join("\n");
}

describe("architecture line baseline history", () => {
  it("rejects a current-only oversized file manually added to the baseline", () => {
    const path = "apps/example/new-oversized.ts";
    const suppliedBaseline = baseline(path, 301);
    expect(
      evaluateLinePolicy(new Map([[path, content(301)]]), suppliedBaseline)
        .violations,
    ).toEqual([]);
    const violations = evaluateHistoricalBaseline(
      suppliedBaseline,
      new Map([[path, undefined]]),
    );
    expect(violations).toEqual([
      `line baseline: ${path}: BASELINE_PATH_NOT_IN_SOURCE_COMMIT`,
    ]);
  });

  it("rejects an incorrect recorded maximum for an existing historical file", () => {
    const path = "apps/example/legacy.ts";
    const violations = evaluateHistoricalBaseline(
      baseline(path, 302),
      new Map([[path, content(301)]]),
    );
    expect(violations[0]).toContain("BASELINE_LINE_COUNT_MISMATCH");
    expect(violations[0]).toContain("historical 301 lines");
  });

  it("accepts an exact oversized source-commit line count", () => {
    const path = "apps/example/legacy.ts";
    expect(
      evaluateHistoricalBaseline(
        baseline(path, 301),
        new Map([[path, content(301)]]),
      ),
    ).toEqual([]);
  });

  it("fails closed when the immutable source commit is unavailable", async () => {
    const repositoryRoot = resolve(__dirname, "../../..");
    await expect(
      loadHistoricalBaselineFiles(repositoryRoot, "0".repeat(40), []),
    ).rejects.toThrow("BASELINE_SOURCE_COMMIT_UNAVAILABLE");
  });

  it("passes repository paths to bounded git argument arrays without a shell", async () => {
    const calls: Array<{
      arguments_: readonly string[];
      file: string;
      options: Record<string, unknown>;
    }> = [];
    const path = "apps/example/name; echo unsafe.ts";
    const execute = async (
      file: string,
      arguments_: readonly string[],
      options: Record<string, unknown>,
    ) => {
      calls.push({ arguments_, file, options });
      return { stderr: "", stdout: content(301) };
    };
    const files = await loadHistoricalBaselineFiles(
      "repository root",
      BASELINE_SOURCE_COMMIT,
      [path],
      execute,
    );
    expect(files.get(path)).toBe(content(301));
    expect(calls[1]?.file).toBe("git");
    expect(calls[1]?.arguments_).toEqual([
      "-C",
      "repository root",
      "show",
      `${BASELINE_SOURCE_COMMIT}:${path}`,
    ]);
    expect(calls[1]?.options).not.toHaveProperty("shell");
    expect(calls[1]?.options.timeout).toBe(10_000);
  });
});
