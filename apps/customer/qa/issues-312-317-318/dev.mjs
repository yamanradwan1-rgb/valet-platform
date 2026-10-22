import { createRequire } from "node:module";
const require = createRequire(
  new URL("../../../dashboard/package.json", import.meta.url),
);
const { chromium } = require("@playwright/test");
const browser = await chromium.launch({ headless: false });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(process.env.TARGET_URL || "http://localhost:3315");
  await page.locator("main .screen-enter").waitFor();
  await page.getByRole("button", { name: "Expand", exact: true }).click();
  await page.getByRole("button", { name: "Collapse", exact: true }).waitFor();
  if (await page.getByRole("button", { name: /Help/ }).count())
    throw Error("Stale Help preview");
  if (await page.locator("nav").count())
    throw Error("Unexpected bottom navigation");
  await page
    .getByRole("button", { name: "Payment Overview", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Preview Add Tip", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Rate Experience", exact: true })
    .click();
  await page.getByRole("button", { name: "Collapse", exact: true }).click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page
    .getByRole("button", { name: "Rate your experience", exact: true })
    .waitFor();
  if (errors.length) throw Error(errors.join("\n"));
  console.log(
    "PASS development: no BottomNav/Help; Payment preview, Rating Done -> Completed",
  );
} finally {
  await browser.close();
}
