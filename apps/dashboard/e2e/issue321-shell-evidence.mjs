/** Compare the current-main and Issue #321 Dashboard shell on a real route. */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { diffPanes } from "./support/issue321-visual-diff.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const requireDashboard = createRequire(
  join(root, "apps/dashboard/package.json"),
);
const requireApi = createRequire(join(root, "apps/api/package.json"));
const ts = requireDashboard("typescript");
requireDashboard.extensions[".ts"] = (mod, filename) => {
  const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  mod._compile(compiled.outputText, filename);
};
const { chromium } = requireDashboard("@playwright/test");
const sharp = requireApi("sharp");
const { DashboardApiFixture, ORG_A, LOCATION_A } = requireDashboard(
  join(root, "apps/dashboard/e2e/support/dashboard-api-fixture.ts"),
);
const rootDir = join(root, "docs/validation/issue-321-phase-b/evidence");
const mainUrl = process.env.POLICIES_MAIN_URL ?? "http://127.0.0.1:3015";
const candidateUrl =
  process.env.POLICIES_CANDIDATE_URL ?? "http://127.0.0.1:3014";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const cases = [
  {
    id: "shell-en-light-1440",
    width: 1440,
    height: 900,
    locale: "en",
    theme: "light",
  },
  {
    id: "shell-ar-dark-390",
    width: 390,
    height: 844,
    locale: "ar",
    theme: "dark",
  },
];

async function snapshot(browser, baseUrl, scenario) {
  const context = await browser.newContext({
    viewport: { width: scenario.width, height: scenario.height },
    deviceScaleFactor: 1,
  });
  try {
    const page = await context.newPage();
    const fixture = new DashboardApiFixture({
      companyOrganizations: [{ ...ORG_A, name: "Demo Hospitality" }],
      companyLocations: {
        [ORG_A.organizationId]: [{ ...LOCATION_A, name: "Garden Hotel Demo" }],
      },
    });
    await fixture.install(page);
    await page.goto(`${baseUrl}/overview`);
    await page.getByLabel("Email").fill("admin@example.com");
    await page.getByLabel("Password").fill("fixture-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.getByRole("button", { name: "Demo Hospitality" }).click();
    await page
      .getByRole("button", { name: "All Locations", exact: true })
      .click();
    if (scenario.theme === "dark")
      await page.getByRole("button", { name: "Dark", exact: true }).click();
    if (scenario.locale === "ar")
      await page.getByRole("button", { name: "Language" }).click();
    await page.locator(".content").waitFor({ state: "visible" });
    await page.evaluate(async () => {
      await document.fonts.ready;
      document.querySelector(".content")?.scrollTo(0, 0);
      window.scrollTo(0, 0);
    });
    const geometry = await page.evaluate(() => {
      const rect = (selector) => {
        const box = document.querySelector(selector)?.getBoundingClientRect();
        return box ? [box.x, box.y, box.width, box.height] : null;
      };
      return {
        sidebar: rect(".sidebar"),
        topbar: rect(".topbar"),
        content: rect(".content"),
        heading: rect("h1"),
        title: document.querySelector("h1")?.textContent,
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    return { png: await page.screenshot({ animations: "disabled" }), geometry };
  } finally {
    await context.close();
  }
}

mkdirSync(rootDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const results = [];
  for (const scenario of cases) {
    const main = await snapshot(browser, mainUrl, scenario);
    const candidate = await snapshot(browser, candidateUrl, scenario);
    const pixels = await diffPanes(sharp, main.png, candidate.png);
    for (const [suffix, bytes] of [
      ["main", main.png],
      ["candidate", candidate.png],
      ["diff", pixels.diffPng],
    ]) {
      if (bytes)
        writeFileSync(join(rootDir, `${scenario.id}-${suffix}.png`), bytes);
    }
    const geometryEqual =
      JSON.stringify(main.geometry) === JSON.stringify(candidate.geometry);
    const pass =
      geometryEqual && pixels.geometryEqual && pixels.differences === 0;
    results.push({
      id: scenario.id,
      viewport: [scenario.width, scenario.height],
      locale: scenario.locale,
      theme: scenario.theme,
      main: { ...main.geometry, sha256: sha256(main.png) },
      candidate: { ...candidate.geometry, sha256: sha256(candidate.png) },
      comparison: { ...pixels, diffPng: undefined, geometryEqual },
      pass,
    });
    console.log(
      scenario.id,
      "differences",
      pixels.differences,
      "geometry",
      geometryEqual,
      "PASS",
      pass,
    );
  }
  writeFileSync(
    join(rootDir, "shell-comparison.json"),
    JSON.stringify(
      {
        baseline: "fcfa760e4f17abae5fc9871417c6b68feecd089c",
        candidate: process.env.POLICIES_CANDIDATE_SHA ?? "unknown",
        cases: results,
      },
      null,
      2,
    ),
  );
  if (results.some(({ pass }) => !pass)) process.exitCode = 1;
} finally {
  await browser.close();
}
