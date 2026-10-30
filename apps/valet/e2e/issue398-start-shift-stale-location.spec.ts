import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { expect, test, type Page } from "@playwright/test";

const B = "22222222-2222-4222-8222-222222222222";
type LocationKey = "A" | "B" | "C";

interface FixtureHarness {
  readonly submitted: string[];
  readonly retries: number;
  setEligible(keys: LocationKey[]): void;
  setUncertain(location: LocationKey): void;
}

type FixtureWindow = Window & { __issue398: FixtureHarness };

let fixtureUrl: string;
let closeFixture: (() => Promise<void>) | undefined;

test.beforeAll(async () => {
  const requireFromPackage = createRequire(`${process.cwd()}/package.json`);
  const viteEntry = createRequire(requireFromPackage.resolve("vitest")).resolve(
    "vite",
  );
  const { createServer } = await import(pathToFileURL(viteEntry).href);
  const server = await createServer({
    configFile: false,
    root: process.cwd(),
    esbuild: { jsx: "automatic", jsxImportSource: "react" },
    server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen();
  fixtureUrl = `${server.resolvedUrls?.local[0]}e2e/issue398-start-shift-fixture.html`;
  closeFixture = () => server.close();
});

test.afterAll(async () => closeFixture?.());

async function setEligible(page: Page, keys: LocationKey[]) {
  await page.evaluate(
    (value) => (window as FixtureWindow).__issue398.setEligible(value),
    keys,
  );
}

async function selectedA(page: Page) {
  await page.getByRole("button", { name: /A Hotel/ }).click();
}

async function afterEffects(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

test("A choice is retired after B-only refresh; Start submits only current B", async ({
  page,
}) => {
  await page.goto(fixtureUrl);
  await selectedA(page);
  await setEligible(page, ["B"]);
  await expect(page.getByRole("button", { name: /A Hotel/ })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Start Shift", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Start Shift", exact: true }).click();
  expect(
    await page.evaluate(() => (window as FixtureWindow).__issue398.submitted),
  ).toEqual([B]);
});

test("invalidated A never reappears as a silent choice and multi-location refresh requires choice", async ({
  page,
}) => {
  await page.goto(fixtureUrl);
  await selectedA(page);
  await setEligible(page, ["B"]);
  await expect(page.getByRole("button", { name: /B Hotel/ })).toBeVisible();
  await afterEffects(page);
  await setEligible(page, ["A", "B"]);
  await expect(
    page.getByRole("button", { name: "Start Shift", exact: true }),
  ).toBeDisabled();
  await setEligible(page, ["B", "C"]);
  await expect(
    page.getByRole("button", { name: "Start Shift", exact: true }),
  ).toBeDisabled();
  expect(
    await page.evaluate(() => (window as FixtureWindow).__issue398.submitted),
  ).toEqual([]);
});

test("empty list blocks Start; later single Location auto-selects current Location", async ({
  page,
}) => {
  await page.goto(fixtureUrl);
  await selectedA(page);
  await setEligible(page, []);
  await expect(
    page.getByText("No startable location is available"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start Shift", exact: true }),
  ).toHaveCount(0);
  await afterEffects(page);
  await setEligible(page, ["B"]);
  await page.getByRole("button", { name: "Start Shift", exact: true }).click();
  expect(
    await page.evaluate(() => (window as FixtureWindow).__issue398.submitted),
  ).toEqual([B]);
});

test("uncertain retry keeps its original command while the Location list changes", async ({
  page,
}) => {
  await page.goto(fixtureUrl);
  await expect(
    page.getByRole("button", { name: "Start Shift", exact: true }),
  ).toBeVisible();
  await page.evaluate(() =>
    (window as FixtureWindow).__issue398.setUncertain("A"),
  );
  await expect(
    page.getByRole("button", { name: "Retry start shift", exact: true }),
  ).toBeVisible();
  await setEligible(page, ["B"]);
  await expect(
    page.getByRole("button", { name: "Start Shift", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Retry start shift", exact: true })
    .click();
  expect(
    await page.evaluate(() => ({
      retries: (window as FixtureWindow).__issue398.retries,
      submitted: (window as FixtureWindow).__issue398.submitted,
    })),
  ).toEqual({ retries: 1, submitted: [] });
});

test("Arabic refresh uses localized action and LTR code while submitting B", async ({
  page,
}) => {
  await page.goto(`${fixtureUrl}?locale=ar`);
  await selectedA(page);
  await setEligible(page, ["B"]);
  await expect(page.locator('bdi[dir="ltr"]')).toHaveText(["LOC-B"]);
  await page
    .getByRole("button", {
      name: "\u0628\u062f\u0621 \u0627\u0644\u0645\u0646\u0627\u0648\u0628\u0629",
      exact: true,
    })
    .click();
  expect(
    await page.evaluate(() => (window as FixtureWindow).__issue398.submitted),
  ).toEqual([B]);
});
