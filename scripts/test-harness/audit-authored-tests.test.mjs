import assert from "node:assert/strict";
import test from "node:test";

import { scanAuthoredSource } from "./audit-authored-tests-source.mjs";

test("extracts nested suite cases but excludes commented test calls", () => {
  const source = `describe("scope", () => {
    // it("not a test", () => {});
    test("tenant isolation", () => { expect(true).toBe(true); });
    it.skip("documented skip", () => {});
  });`;
  const result = scanAuthoredSource("test.ts", source);
  assert.deepEqual(
    result.tests.map((x) => x.title),
    ["tenant isolation", "documented skip"],
  );
  assert.equal(result.tests[0].suite, "scope");
  assert.equal(result.suiteDeclarations, 1);
});

test("counts parameterized declaration once, with static row count", () => {
  const source = `it.each([["a"], ["b"]])("valid %s", (name) => {});`;
  const result = scanAuthoredSource("test.ts", source);
  assert.equal(result.tests.length, 1);
  assert.equal(result.tests[0].declaredRows, 2);
  assert.equal(result.tests[0].expansion, "static-each");
});

test("marks data-driven unknown cases rather than inventing a count", () => {
  const result = scanAuthoredSource(
    "test.ts",
    `test.each(rows)("status %s", () => {});`,
  );
  assert.equal(result.tests.length, 1);
  assert.equal(result.tests[0].declaredRows, 0);
  assert.equal(result.tests[0].expansion, "dynamic-each");
});

test("Playwright describes are suites, and lifecycle/steps are not tests", () => {
  const result = scanAuthoredSource(
    "screen.spec.ts",
    `test.describe("checkout", () => {
      test.beforeEach(async ({ page }) => {});
      test.use({ locale: "ar-JO" });
      test("retries", async () => {
        await test.step("verify", async () => {});
      });
    });`,
  );
  assert.deepEqual(
    result.tests.map((item) => item.title),
    ["retries"],
  );
  assert.equal(result.tests[0].suite, "checkout");
  assert.equal(result.suiteDeclarations, 1);
});

test("records UI fragility signals as signals, not defective-test verdicts", () => {
  const result = scanAuthoredSource(
    "screen.spec.ts",
    `test("edit", async () => {
      await page.waitForTimeout(200);
      await page.locator(".class").click();
      await expect(page.getByRole("status")).toHaveText("Done");
    });`,
  );
  assert.match(result.sourceSignals, /arbitrary_wait:1/);
  assert.match(result.sourceSignals, /structural_locator:1/);
  assert.match(result.sourceSignals, /strict_text:1/);
});

test("does not count unrelated objects or RegExp.test as authored test cases", () => {
  const source = `test("real", () => {
    expect(/text/.test("text")).toBe(true);
    expect(checker.test("value")).toBe(true);
    expect(timing.test("value")).toBe(true);
    test.step("not a test", () => {});
    test.use({ locale: "en" });
  });`;
  const result = scanAuthoredSource("real.test.ts", source);
  assert.deepEqual(
    result.tests.map((row) => row.title),
    ["real"],
  );
});

test("recognizes imported runner aliases, namespace imports and bracket modifiers", () => {
  const source = `import {it as proof, describe as group} from "vitest";
    import * as pw from "@playwright/test";
    group("scope", () => {
      proof("guest denial", () => {});
      pw.test["only"]("smoke", () => {});
      pw.test["skip"]("skipped", () => {});
    });`;
  const result = scanAuthoredSource("check.test.ts", source);
  assert.deepEqual(
    result.tests.map((row) => row.title),
    ["guest denial", "smoke", "skipped"],
  );
  assert.ok(result.tests.every((row) => row.suite === "scope"));
});

test("unwraps const array datasets and keeps conditional runners non-parametric", () => {
  const source = `it.each(["A", "B"] as const)("variant %s", () => {});
    test.skipIf(!ready)("guarded", () => {});
    test.runIf(ready)("optional", () => {});`;
  const result = scanAuthoredSource("check.test.ts", source);
  assert.equal(result.tests[0].declaredRows, 2);
  assert.equal(result.tests[0].expansion, "static-each");
  assert.deepEqual(
    result.tests.slice(1).map((item) => item.expansion),
    ["conditional", "conditional"],
  );
  assert.ok(result.tests.slice(1).every((item) => item.declaredRows === 1));
});

test("propagates static describe.each multiplication and unknown suite datasets", () => {
  const source = `describe.each(["en", "ar"] as const)("locale %s", () => {
    it.each(["light", "dark", "system"])("theme %s", () => {});
    test("basic", () => {});
  });
  describe.each(runtimeLocales)("dynamic suite", () => {
    it("unknown multiplicity", () => {});
  });`;
  const result = scanAuthoredSource("check.test.ts", source);
  assert.deepEqual(
    result.tests.map((item) => item.declaredRows),
    [6, 2, 0],
  );
  assert.equal(result.tests[2].expansion, "dynamic-suite-each");
});

test("detects Node test contexts without counting arbitrary object methods", () => {
  const source = `import test from "node:test";
    test("parent", async (t) => {
      await t.test("child", () => {});
      const other = { test: () => {} };
      other.test("not a registered test");
    });`;
  const result = scanAuthoredSource("check.test.mjs", source);
  assert.deepEqual(
    result.tests.map((item) => item.title),
    ["parent", "child"],
  );
});

test("does not mistake Vitest dataset fixture.test for a Node subtest in .mjs", () => {
  const source = `import { test } from "vitest";
    test.each([{ test: () => true }])("fixture %s", (fixture) => {
      fixture.test("this is an ordinary method");
    });`;
  const result = scanAuthoredSource("fixture.test.mjs", source);
  assert.deepEqual(
    result.tests.map((item) => item.title),
    ["fixture %s"],
  );
});

test("recognizes real Node subtests in .test.ts by imported runner provenance", () => {
  const source = `import { test as nodeTest } from "node:test";
    nodeTest("parent", async (context) => {
      await context.test("real child", () => {});
      const unrelated = { test: () => true };
      unrelated.test("not a subtest");
    });`;
  const result = scanAuthoredSource("auth.test.ts", source);
  assert.deepEqual(
    result.tests.map((item) => item.title),
    ["parent", "real child"],
  );
});

test("warns on indirect runner aliases instead of silently claiming exhaustive counts", () => {
  const source = `import { test } from "vitest";
    const register = test;
    register("real but indirect", () => {});`;
  const result = scanAuthoredSource("indirect.test.ts", source);
  assert.equal(result.tests.length, 0);
  assert.equal(result.unresolvedComputedRegistrations, 1);
});
