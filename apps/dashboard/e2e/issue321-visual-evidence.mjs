/** Run against the pinned Vite preview and compiled Dashboard with local API fixtures. */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
const cases = [{ id: "en-light-1440", width: 1440, height: 1000 }];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function panePixels(bytes) {
  const { data, info } = await sharp(bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

async function diffPanes(sourcePng, candidatePng) {
  const source = await panePixels(sourcePng);
  const candidate = await panePixels(candidatePng);
  if (source.width !== candidate.width || source.height !== candidate.height) {
    return {
      differences: null,
      pixels: null,
      diffPng: null,
      geometryEqual: false,
    };
  }
  const output = Buffer.alloc(source.data.length);
  let differences = 0;
  let maxChannelDelta = 0;
  for (let offset = 0; offset < source.data.length; offset += 4) {
    let changed = false;
    for (let channel = 0; channel < 4; channel++) {
      const delta = Math.abs(
        source.data[offset + channel] - candidate.data[offset + channel],
      );
      maxChannelDelta = Math.max(maxChannelDelta, delta);
      changed ||= delta !== 0;
    }
    if (changed) {
      differences++;
      output[offset] = 255;
      output[offset + 3] = 255;
    }
  }
  const diffPng = await sharp(output, {
    raw: { width: source.width, height: source.height, channels: 4 },
  })
    .png()
    .toBuffer();
  return {
    differences,
    pixels: source.width * source.height,
    maxChannelDelta,
    geometryEqual: true,
    diffPng,
  };
}

async function capture(page) {
  await page.locator("#studio-heading").waitFor({ state: "visible" });
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
  return { geometry, fullPng, panePng };
}

async function runCase(browser, scenario) {
  const context = await browser.newContext({
    viewport: { width: scenario.width, height: scenario.height },
    deviceScaleFactor: 1,
  });
  try {
    const source = await context.newPage();
    await source.goto(
      `${sourceUrl}/policies?locale=en&theme=light&scope=company&section=operations`,
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
    await candidate
      .getByRole("button", { name: "All Locations", exact: true })
      .click();
    await candidate
      .locator('[data-setting="checkInPhotosRequired"]')
      .waitFor({ state: "visible" });

    const reference = await capture(source);
    const production = await capture(candidate);
    const difference = await diffPanes(reference.panePng, production.panePng);
    for (const [name, bytes] of [
      ["reference-full", reference.fullPng],
      ["candidate-full", production.fullPng],
      ["reference-pane", reference.panePng],
      ["candidate-pane", production.panePng],
      ["diff-pane", difference.diffPng],
    ]) {
      if (bytes)
        writeFileSync(join(outDir, `${scenario.id}-${name}.png`), bytes);
    }
    return {
      id: scenario.id,
      viewport: [scenario.width, scenario.height],
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
      exactPanePass: difference.geometryEqual && difference.differences === 0,
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
    console.log(item.id, item.comparison, "PASS", item.exactPanePass);
} finally {
  await browser.close();
}
