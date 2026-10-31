/** Run against the pinned Vite preview and compiled Dashboard with local API fixtures. */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { diffPanes } from "./support/issue321-visual-diff.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const dashboardRequire = createRequire(
  join(root, "apps/dashboard/package.json"),
);
const apiRequire = createRequire(join(root, "apps/api/package.json"));
const ts = dashboardRequire("typescript");
dashboardRequire.extensions[".ts"] = (mod, filename) => {
  const source = readFileSync(filename, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  mod._compile(compiled.outputText, filename);
};

const { chromium } = dashboardRequire("@playwright/test");
const sharp = apiRequire("sharp");
const { DashboardApiFixture, ORG_A, LOCATION_A } = dashboardRequire(
  join(root, "apps/dashboard/e2e/support/dashboard-api-fixture.ts"),
);
const { companySettings } = dashboardRequire(
  join(root, "apps/dashboard/e2e/support/administration-fixtures.ts"),
);

const outDir = join(root, "docs/validation/issue-321-phase-b/evidence");
const sourceUrl = process.env.POLICIES_SOURCE_URL ?? "http://127.0.0.1:4322";
const candidateUrl =
  process.env.POLICIES_CANDIDATE_URL ?? "http://127.0.0.1:3014";
const cases = [
  {
    id: "en-light-1440",
    width: 1440,
    height: 1000,
    locale: "en",
    theme: "light",
  },
  { id: "en-dark-768", width: 768, height: 900, locale: "en", theme: "dark" },
  { id: "ar-dark-390", width: 390, height: 844, locale: "ar", theme: "dark" },
  {
    id: "ar-light-320",
    width: 320,
    height: 800,
    locale: "ar",
    theme: "light",
    location: "garden",
  },
];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function capture(page) {
  await page.locator("#studio-heading").waitFor({ state: "visible" });
  // Normalize keyboard input modality before comparing the frozen focus ring.
  await page.keyboard.press("Tab");
  await page.locator("#studio-heading").focus();
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
    const heading = document.getElementById("studio-heading");
    return {
      shell: rect(".dashboard-shell"),
      sidebar: rect(".sidebar"),
      topbar: rect(".topbar"),
      workspace: rect(".ps-workspace"),
      pane: rect(".ps-pane"),
      heading: heading?.innerText ?? null,
      focusVisible: heading?.matches(":focus-visible") ?? false,
      activeElement: document.activeElement?.tagName ?? null,
      font: heading ? getComputedStyle(heading).fontFamily : null,
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
  const fullPng = await page.screenshot({ animations: "disabled" });
  const panePng = await page
    .locator(".ps-pane")
    .screenshot({ animations: "disabled" });
  const [x, y, width, height] = geometry.pane;
  const viewport = page.viewportSize();
  const crop = {
    left: Math.ceil(x),
    top: Math.ceil(y),
    width: Math.floor(Math.min(x + width, viewport.width)) - Math.ceil(x),
    height: Math.floor(Math.min(y + height, viewport.height)) - Math.ceil(y),
  };
  const visiblePng = await sharp(fullPng).extract(crop).png().toBuffer();
  return { geometry, fullPng, panePng, visiblePng };
}

async function runCase(browser, scenario) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
  });
  try {
    const source = await context.newPage();
    await source.goto(
      `${sourceUrl}/policies?locale=${scenario.locale}&theme=${scenario.theme}&scope=company&section=operations`,
    );
    const candidate = await context.newPage();
    const fixture = new DashboardApiFixture({
      companyOrganizations: [{ ...ORG_A, name: "Demo Hospitality" }],
      companyLocations: {
        [ORG_A.organizationId]: [{ ...LOCATION_A, name: "Garden Hotel Demo" }],
      },
      override: (path) =>
        path ===
        `/v1/staff/management/organizations/${ORG_A.organizationId}/settings`
          ? {
              body: {
                ...companySettings(),
                defaults: {
                  ...companySettings().defaults,
                  trackingEnabled: false,
                  valetServiceFee: "5.000",
                  languageDefault: "AR",
                  ocrAssistEnabled: false,
                  guestVehicleReadyNotificationEnabled: false,
                },
              },
            }
          : undefined,
    });
    await fixture.install(candidate);
    await candidate.goto(`${candidateUrl}/policies?section=operations`);
    await candidate.getByLabel("Email").fill("admin@example.com");
    await candidate.getByLabel("Password").fill("fixture-password");
    await candidate.getByRole("button", { name: "Sign in" }).click();
    await candidate.getByRole("button", { name: "Demo Hospitality" }).click();
    if (scenario.location === "garden") {
      await candidate
        .getByRole("button", { name: "Garden Hotel Demo", exact: true })
        .click();
      await candidate
        .getByRole("button", { name: "Company defaults", exact: true })
        .click();
    } else {
      await candidate
        .getByRole("button", { name: "All Locations", exact: true })
        .click();
    }
    if (scenario.theme === "dark") {
      await candidate
        .getByRole("button", { name: "Dark", exact: true })
        .click();
    }
    if (scenario.locale === "ar") {
      await candidate.getByRole("button", { name: "Language" }).click();
    }
    await candidate
      .locator('[data-setting="checkInPhotosRequired"]')
      .waitFor({ state: "visible" });

    await Promise.all([
      source.setViewportSize({
        width: scenario.width,
        height: scenario.height,
      }),
      candidate.setViewportSize({
        width: scenario.width,
        height: scenario.height,
      }),
    ]);

    const reference = await capture(source);
    const production = await capture(candidate);
    const difference = await diffPanes(
      sharp,
      reference.panePng,
      production.panePng,
    );
    const visibleDifference = await diffPanes(
      sharp,
      reference.visiblePng,
      production.visiblePng,
    );
    for (const [name, bytes] of [
      ["reference-full", reference.fullPng],
      ["candidate-full", production.fullPng],
      ["reference-pane", reference.panePng],
      ["candidate-pane", production.panePng],
      ["diff-pane", difference.diffPng],
      ["reference-visible-pane", reference.visiblePng],
      ["candidate-visible-pane", production.visiblePng],
      ["diff-visible-pane", visibleDifference.diffPng],
    ]) {
      if (bytes)
        writeFileSync(join(outDir, `${scenario.id}-${name}.png`), bytes);
    }
    return {
      id: scenario.id,
      viewport: [scenario.width, scenario.height],
      locale: scenario.locale,
      theme: scenario.theme,
      reference: {
        ...reference.geometry,
        fullSha256: sha256(reference.fullPng),
        paneSha256: sha256(reference.panePng),
      },
      production: {
        ...production.geometry,
        fullSha256: sha256(production.fullPng),
        paneSha256: sha256(production.panePng),
      },
      comparison: { ...difference, diffPng: undefined },
      visibleComparison: { ...visibleDifference, diffPng: undefined },
      exactPanePass: difference.geometryEqual && difference.differences === 0,
      exactVisiblePanePass:
        visibleDifference.geometryEqual && visibleDifference.differences === 0,
    };
  } finally {
    await context.close();
  }
}

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const results = [];
  for (const scenario of cases) results.push(await runCase(browser, scenario));
  writeFileSync(
    join(outDir, "comparison.json"),
    JSON.stringify(
      {
        sourceCommit: "5596e2312f622fbbfdcd498408769149407a6399",
        baseline: "fcfa760e4f17abae5fc9871417c6b68feecd089c",
        candidate: process.env.POLICIES_CANDIDATE_SHA ?? "unknown",
        cases: results,
      },
      null,
      2,
    ),
  );
  for (const item of results)
    console.log(
      item.id,
      "pane",
      item.comparison.differences,
      "visible",
      item.visibleComparison.differences,
      "PASS",
      item.exactPanePass && item.exactVisiblePanePass,
    );
  if (results.some((item) => !item.exactPanePass || !item.exactVisiblePanePass))
    process.exitCode = 1;
} finally {
  await browser.close();
}
