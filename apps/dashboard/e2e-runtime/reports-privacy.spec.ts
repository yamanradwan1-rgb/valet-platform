import { readFile } from "node:fs/promises";

import type { Page } from "@playwright/test";

import {
  objectUrlHistory,
  installObjectUrlProbe,
  persistentState,
} from "./support/persistent-state";
import { expect, test } from "./support/runtime-test";
import {
  assurePreEnrolled,
  controlFixture,
  runtimeFixture as f,
  selectCompany,
  selectLocation,
  signIn,
} from "./support/runtime-fixture";

const reportDate = "2026-09-21";

async function loadDaily(page: Page) {
  await page.getByRole("button", { name: "Preview Daily Report" }).click();
  const dialog = page.getByRole("dialog", { name: "Preview Daily Report" });
  await dialog.getByLabel("Date").fill(reportDate);
  await dialog.getByRole("button", { name: "Load preview" }).click();
  await expect(dialog.getByTestId("report-preview-content")).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Export CSV/u })).toBeEnabled();
  return dialog;
}

async function expectRealArtifact(
  page: Page,
  format: "CSV" | "PDF",
  filename: string,
) {
  const downloadPromise = page.waitForEvent("download");
  const responsePromise = page.waitForResponse((response) =>
    response.request().method() === "POST" &&
    new URL(response.url()).pathname.endsWith("/reports/exports"));
  await page.getByRole("dialog").getByRole("button", {
    name: new RegExp(`Export ${format}`, "u"),
  }).click();
  const [download, response] = await Promise.all([downloadPromise, responsePromise]);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-disposition"]).toContain(filename);
  expect(response.headers()["content-type"]).toContain(
    format === "CSV" ? "text/csv" : "application/pdf",
  );
  expect(download.suggestedFilename()).toBe(filename);
  const path = await download.path();
  expect(path).not.toBeNull();
  const bytes = await readFile(path!);
  expect(bytes.byteLength).toBeGreaterThan(0);
  if (format === "CSV") {
    expect(bytes.toString("utf8").split(/\r?\n/u)[0])
      .toBe("section,key,subkey,currency,value");
  } else {
    expect(bytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(bytes.toString("ascii")).toContain("%%EOF");
  }
}

test("real reports download safely, fail unknown on lost response, and keep protected data out of storage", async ({
  page,
}) => {
  await controlFixture("export-entitlement", "on");
  await installObjectUrlProbe(page);
  await signIn(page, f.emails.exportAdmin);
  await assurePreEnrolled(page);
  await selectCompany(page);

  const baseline = await persistentState(page, [f.contact.displayName]);
  const navigation = page.getByRole("navigation", { name: "Management navigation" });
  await navigation.getByRole("link", { name: "Reports" }).click();
  let dialog = await loadDaily(page);
  await expectRealArtifact(page, "CSV", `company-report-daily-${reportDate}.csv`);
  await expectRealArtifact(page, "PDF", `company-report-daily-${reportDate}.pdf`);
  await dialog.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Change scope" }).first().click();
  await selectLocation(page, f.organizations.a.name, f.locations.a.name);
  await navigation.getByRole("link", { name: "Reports" }).click();
  dialog = await loadDaily(page);
  await expectRealArtifact(page, "CSV", `report-daily-${reportDate}.csv`);
  await expectRealArtifact(page, "PDF", `report-daily-${reportDate}.pdf`);

  const exportPath =
    `/v1/staff/dashboard/locations/${f.locations.a.id}/reports/exports`;
  let interruptedPosts = 0;
  const interrupt = async (route: import("@playwright/test").Route) => {
    if (
      route.request().method() !== "POST" ||
      new URL(route.request().url()).pathname !== exportPath
    ) {
      await route.continue();
      return;
    }
    interruptedPosts += 1;
    await route.fetch();
    await route.abort("connectionfailed");
  };
  await page.route(`**${exportPath}`, interrupt);
  let downloads = 0;
  page.on("download", () => {
    downloads += 1;
  });
  await dialog.getByRole("button", { name: /Export CSV/u }).click();
  await expect(dialog.getByText(/Export outcome unknown/u)).toBeVisible();
  await page.waitForTimeout(250);
  expect(interruptedPosts).toBe(1);
  await page.unroute(`**${exportPath}`, interrupt);

  await controlFixture("export-entitlement", "off");
  await dialog.getByRole("button", { name: /Export CSV/u }).click();
  await expect(dialog.getByText(/current export entitlement/u)).toBeVisible();
  expect(downloads).toBe(0);
  await controlFixture("export-entitlement", "on");
  await dialog.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Change scope" }).first().click();
  await selectCompany(page);
  await navigation.getByRole("link", { name: "Visit Contacts" }).click();
  await page.getByLabel("Search mode").selectOption("NAME");
  await page.getByLabel("Name").fill(f.contact.displayName);
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByText(f.contact.displayName, { exact: true })).toBeVisible();

  const objectUrls = await objectUrlHistory(page);
  expect(objectUrls.length).toBe(4);
  const needles = [
    f.contact.displayName,
    "section,key,subkey,currency,value",
    ...objectUrls,
  ];
  const after = await persistentState(page, needles);
  expect(after.databases).toEqual(baseline.databases);
  expect(after.cacheEntries).toEqual(baseline.cacheEntries);
  for (const needle of needles) expect(after.matches[needle]).toEqual([]);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByText(f.contact.displayName, { exact: true })).toHaveCount(0);
});
