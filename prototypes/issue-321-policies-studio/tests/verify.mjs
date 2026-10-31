import { writeFileSync } from "node:fs";
import { chromium, evidence, base } from "./browser-support.mjs";
import { runFlows } from "./flows.mjs";
import { extraFlows } from "./extra-flows.mjs";
import { usabilityFlows } from "./usability-flows.mjs";
import { runMatrix, screenshots } from "./matrix.mjs";

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
page.setDefaultTimeout(10000);
const requests = [];
const errors = [];
const badResponses = [];
page.on("request", (request) =>
  requests.push({
    url: request.url(),
    method: request.method(),
    resource: request.resourceType(),
  }),
);
page.on("response", (response) => {
  if (response.status() >= 400)
    badResponses.push({ url: response.url(), status: response.status() });
});
page.on("pageerror", (error) => errors.push(error.message));
try {
  const flows = [
    ...(await runFlows(page)),
    ...(await extraFlows(page)),
    ...(await usabilityFlows(page)),
  ];
  const matrix = await runMatrix(page);
  await screenshots(page);
  const external = requests.filter(
    (request) => !request.url.startsWith(`${base}/`),
  );
  const mutations = requests.filter(
    (request) => !["GET", "HEAD"].includes(request.method),
  );
  const api = requests.filter((request) =>
    /\/v1\/|\/api\//.test(new URL(request.url).pathname),
  );
  const report = {
    timestamp: new Date().toISOString(),
    browser: browser.version(),
    flows,
    matrix: matrix.map(({ measurements, ...result }) => ({
      ...result,
      ...(result.status === "FAIL" ? { measurements } : {}),
    })),
    errors,
    badResponses,
    network: { totalRequests: requests.length, external, mutations, api },
    nativeBrowserZoom: {
      status: "NOT VERIFIED",
      note: "Effective-width reflow was checked separately; no CSS zoom is reported as native zoom.",
    },
  };
  writeFileSync(
    `${evidence}/verification.json`,
    JSON.stringify(report, null, 2),
  );
  writeFileSync(`${evidence}/network.json`, JSON.stringify(requests, null, 2));
  if (
    matrix.some((result) => result.status === "FAIL") ||
    errors.length ||
    external.length ||
    mutations.length ||
    api.length ||
    badResponses.length
  )
    process.exitCode = 1;
  console.log(
    JSON.stringify(
      {
        flows: flows.length,
        matrix: matrix.length,
        errors,
        badResponses,
        external,
        mutations,
        api,
      },
      null,
      2,
    ),
  );
} catch (error) {
  await page.screenshot({
    path: `${evidence}/test-failure.png`,
    fullPage: true,
    timeout: 5000,
  });
  writeFileSync(`${evidence}/failure.txt`, error.stack);
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
