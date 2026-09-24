import { readFile } from "node:fs/promises";
import { expect, type Download, type Page } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./dashboard-api-fixture";
import { signInOnCurrentPage } from "./foundation-ui";
import {
  companyReportPaths,
  companyReportReply,
  locationReportPaths,
  locationReportReply,
  REPORT_SELECTORS,
  subscriptionReply,
  type BinaryReply,
  ReportBinaryFixture,
} from "./md05-reports-fixtures";

type Override = ConstructorParameters<typeof DashboardApiFixture>[0]["override"];

export const reportPreviewPaths = [
  ...Object.values(companyReportPaths).filter((path) => !path.endsWith("/exports")),
  ...Object.values(locationReportPaths).filter((path) => !path.endsWith("/exports")),
];

export function companyReportsFixture(override?: Override) {
  return new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: async (path, request, fixture) =>
      await override?.(path, request, fixture) ?? companyReportReply(path, request),
  });
}

export function companyLocationReportsFixture(override?: Override) {
  return new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: async (path, request, fixture) =>
      await override?.(path, request, fixture) ?? locationReportReply(path, request),
  });
}

export function managerReportsFixture(override?: Override) {
  return new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: async (path, request, fixture) =>
      await override?.(path, request, fixture) ?? locationReportReply(path, request),
  });
}

export async function enterCompanyReports(page: Page) {
  await page.goto("/reports");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: "All Locations" }).click();
  await expect(page.getByTestId("md05-reports-page")).toBeVisible();
}

export async function enterCompanyLocationReports(page: Page) {
  await page.goto("/reports");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await expect(page.getByTestId("md05-reports-page")).toBeVisible();
}

export async function enterManagerReports(page: Page) {
  await page.goto("/reports");
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await expect(page.getByTestId("md05-reports-page")).toBeVisible();
}

export async function loadReport(
  page: Page,
  kind: "DAILY" | "WEEKLY" | "MONTHLY",
  value = selector(kind),
) {
  const name = kind === "DAILY" ? "Preview Daily Report"
    : kind === "WEEKLY" ? "Preview Weekly Report"
      : "Preview Monthly Report";
  await page.getByRole("button", { name }).click();
  const dialog = page.getByRole("dialog", { name });
  const label = kind === "DAILY" ? "Date" : kind === "WEEKLY" ? "Week start (Monday)" : "Month";
  await dialog.getByLabel(label).fill(value);
  await dialog.getByRole("button", { name: "Load preview" }).click();
  return dialog;
}

export async function changeReportSelector(page: Page, value: string) {
  const dialog = page.getByRole("dialog");
  const input = dialog.locator("input").first();
  await input.fill(value);
  await dialog.getByRole("button", { name: "Load preview" }).click();
}

export function selector(kind: "DAILY" | "WEEKLY" | "MONTHLY") {
  if (kind === "DAILY") return REPORT_SELECTORS.daily;
  if (kind === "WEEKLY") return REPORT_SELECTORS.weekly;
  return REPORT_SELECTORS.monthly;
}

export function exportProof(
  kind: "DAILY" | "WEEKLY" | "MONTHLY",
  format: "CSV" | "PDF",
) {
  if (kind === "DAILY") {
    return {
      body: { kind, format, date: REPORT_SELECTORS.daily },
      filenameSelector: REPORT_SELECTORS.daily,
    };
  }
  if (kind === "WEEKLY") {
    return {
      body: { kind, format, weekStart: REPORT_SELECTORS.weekly },
      filenameSelector: REPORT_SELECTORS.weekly,
    };
  }
  return {
    body: { kind, format, month: REPORT_SELECTORS.monthly },
    filenameSelector: `${REPORT_SELECTORS.monthly}-01`,
  };
}

export async function installBinary(
  page: Page,
  reply: (count: number) => BinaryReply,
) {
  const fixture = new ReportBinaryFixture((_request, count) => reply(count));
  await fixture.install(page);
  return fixture;
}

export function expectExportRequest(
  fixture: ReportBinaryFixture,
  path: string,
  body: unknown,
) {
  expect(fixture.methods).toEqual(["POST"]);
  expect(fixture.urls.map((url) => new URL(url).pathname)).toEqual([path]);
  expect(fixture.bodies).toEqual([body]);
}

export async function expectArtifact(
  download: Download,
  format: "CSV" | "PDF",
  filename: string,
) {
  expect(download.suggestedFilename()).toBe(filename);
  const path = await download.path();
  expect(path).not.toBeNull();
  const bytes = await readFile(path!);
  expect(bytes.byteLength).toBeGreaterThan(0);
  if (format === "CSV") {
    const text = bytes.toString("utf8");
    expect(text.split(/\r?\n/u)[0]).toBe("section,key,subkey,currency,value");
  } else {
    expect(bytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(bytes.toString("ascii")).toContain("%%EOF");
  }
}

export async function installObjectUrlRevokeProbe(page: Page) {
  await page.addInitScript(() => {
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    const state = window as unknown as {
      __md05ObjectUrlRevokes: number;
      __md05ObjectUrls: string[];
      __md05ObjectUrlHistory: string[];
    };
    state.__md05ObjectUrlRevokes = 0;
    state.__md05ObjectUrls = [];
    state.__md05ObjectUrlHistory = [];
    URL.createObjectURL = (object: Blob | MediaSource) => {
      const url = create(object);
      state.__md05ObjectUrls.push(url);
      state.__md05ObjectUrlHistory.push(url);
      return url;
    };
    URL.revokeObjectURL = (url: string) => {
      state.__md05ObjectUrlRevokes += 1;
      state.__md05ObjectUrls = state.__md05ObjectUrls.filter((candidate) => candidate !== url);
      revoke(url);
    };
  });
}

export async function expectObjectUrlRevoked(page: Page, count = 1) {
  const state = await page.evaluate(() => ({
    revokes: (window as unknown as { __md05ObjectUrlRevokes: number }).__md05ObjectUrlRevokes,
    urls: (window as unknown as { __md05ObjectUrls: string[] }).__md05ObjectUrls,
    history: (window as unknown as { __md05ObjectUrlHistory: string[] }).__md05ObjectUrlHistory,
  }));
  expect(state.revokes).toBe(count);
  expect(state.urls).toEqual([]);
  expect(state.history).toHaveLength(count);
  return state.history;
}

export async function proveFinalExportDenials(page: Page) {
  const subscriptionPath = `/v1/staff/management/organizations/${ORG_A.organizationId}/subscription`;
  let mode: "authority" | "entitlement" | "large" = "authority";
  const fixture = companyReportsFixture((path) =>
    path === subscriptionPath ? subscriptionReply(mode !== "entitlement") : undefined);
  await fixture.install(page);
  const binary = await installBinary(page, () => mode === "large"
    ? { kind: "json", status: 422, body: { code: "REPORT_EXPORT_TOO_LARGE", message: "large", requestId: "large" } }
    : { kind: "json", status: 404, body: { code: "AUTHORIZATION_DENIED", message: "hidden", requestId: mode } });
  let downloads = 0;
  page.on("download", () => { downloads += 1; });
  await enterCompanyReports(page);
  const dialog = await loadReport(page, "DAILY");
  await dialog.getByRole("button", { name: /Export CSV/u }).click();
  await expect(dialog.getByText(/server denied the export/u)).toBeVisible();
  mode = "entitlement";
  await dialog.getByRole("button", { name: /Export CSV/u }).click();
  await expect(dialog.getByText(/current export entitlement/u)).toBeVisible();
  mode = "large";
  await dialog.getByRole("button", { name: /Export CSV/u }).click();
  await expect(dialog.getByText(/too large/u)).toBeVisible();
  expect(binary.posts).toBe(3);
  expect(downloads).toBe(0);
}
