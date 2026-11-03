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
