import { chromium, open, edit, expect, evidence } from "./browser-support.mjs";
import { writeFileSync } from "node:fs";

const browser = await chromium.launch({ headless: false });
const checks = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.on("dialog", (dialog) => dialog.accept());
  await open(page, "locale=en&scope=location&location=marina&section=presence");
  let row = await edit(page, "shiftStartPresenceMode");
  await row
    .getByLabel("Draft · Start Shift Presence Mode")
    .selectOption("REQUIRE");
  await row.getByRole("button", { name: "Save", exact: true }).click();
  await page
    .getByRole("button", { name: "Save simulation", exact: true })
    .click();
  await expect(row.getByRole("alert")).toContainText(
    "usable active attendance zone",
  );
  await expect(row.locator(".ps-setting-value > strong")).toHaveText("Off");
  checks.push("Strict location policy rejected without a usable active zone");

  await open(page, "locale=en&scope=location&location=marina&section=zones");
  await page.getByRole("button", { name: "Add zone", exact: true }).click();
  await page.getByLabel("Code", { exact: true }).fill("MARINA-ENTRY");
  await page
    .getByLabel("Zone label", { exact: true })
    .fill("Demo marina entrance");
  await page
    .locator(".ps-zone-form")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await open(page, "locale=en&scope=location&location=marina&section=presence");
  row = await edit(page, "shiftStartPresenceMode");
  await row
    .getByLabel("Draft · Start Shift Presence Mode")
    .selectOption("REQUIRE");
  await row.getByRole("button", { name: "Save", exact: true }).click();
  await page
    .getByRole("button", { name: "Save simulation", exact: true })
    .click();
  await expect(row.locator(".ps-setting-value > strong")).toHaveText("Require");
  checks.push("Strict policy succeeds after a zone is saved");

  await open(page, "locale=en&scope=location&location=marina&section=zones");
  await page.locator(".ps-zone-details summary").click();
  await page
    .locator(".ps-zone-details")
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await page.getByLabel("Status", { exact: true }).selectOption("DISABLED");
  await page
    .locator(".ps-zone-form")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await expect(page.locator(".ps-zone-form").getByRole("alert")).toContainText(
    "last usable zone",
  );
  checks.push(
    "Disabling the final usable zone is rejected while strict mode is effective",
  );

  await open(page, "locale=en&org=demo-valet&scope=company&section=presence");
  row = await edit(page, "shiftStartPresenceMode");
  await row
    .getByLabel("Draft · Start Shift Presence Mode")
    .selectOption("REQUIRE");
  await row.getByRole("button", { name: "Save", exact: true }).click();
  await page
    .getByRole("button", { name: "Save simulation", exact: true })
    .click();
  await expect(row.getByRole("alert")).toContainText("Each location");
  await expect(row.locator(".ps-setting-value > strong")).toHaveText("Off");
  checks.push("Company strict policy checks every affected synthetic location");

  await open(page, "locale=en&scope=location&location=garden&section=zones");
  await page.getByRole("button", { name: "Add zone", exact: true }).click();
  await page.getByLabel("Code", { exact: true }).fill("arrival");
  await page
    .getByLabel("Zone label", { exact: true })
    .fill("Demo case-sensitive code");
  await page
    .locator(".ps-zone-form")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await expect(page.locator(".ps-zone-list")).toContainText(
    "Demo case-sensitive code",
  );
  checks.push(
    "Zone code comparison preserves backend case-sensitive uniqueness",
  );
  writeFileSync(
    `${evidence}/presence-readiness-verification.json`,
    JSON.stringify(
      { status: "PASS", checks, data: "local synthetic fixture only" },
      null,
      2,
    ),
  );
  console.log(
    `PASS ${checks.length} source-derived readiness and zone-code scenarios`,
  );
} finally {
  await browser.close();
}
