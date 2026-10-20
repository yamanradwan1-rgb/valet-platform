import { expect, test } from "@playwright/test";

// G2 acceptance only. A real disposable authenticated CA/LM session must be
// provisioned by Prime; this suite does not install DashboardApiFixture mocks.
const baseURL = process.env.ISSUE300_ACCEPTANCE_BASE_URL;
const authState = process.env.ISSUE300_ACCEPTANCE_STORAGE_STATE;
const locationPath = process.env.ISSUE300_ACCEPTANCE_LOCATION_AUDIT_PATH;
const ready = Boolean(baseURL && authState && locationPath);

test.skip(
  !ready,
  "GAP: requires G2 owned browser lease + disposable authorized session/Location",
);

if (baseURL && authState && locationPath) {
  test.use({ baseURL, storageState: authState });
}

test("T56/T59/T70: a connected real Investigation API must not claim fictional data", async ({ page }) => {
  const calls: Array<{ status: number; url: string }> = [];
  page.on("response", (response) => {
    const pathname = new URL(response.url()).pathname;
    if (pathname.includes("/audit-investigations/")) {
      calls.push({ status: response.status(), url: pathname });
    }
  });
  await page.goto(locationPath!);
  const tab = page.getByRole("tab", { name: /Investigation Search|بحث التحقيق/ });
  await expect(tab).toBeVisible();
  await tab.click();
  await page.getByRole("button", { name: /Apply search|تطبيق البحث/ }).click();
  await expect.poll(() => calls.length).toBeGreaterThan(0);
  const success = calls.filter((call) => call.status >= 200 && call.status < 300);
  expect(success, "G2 must answer a real read-only investigation request").not.toHaveLength(0);

  const notices = await page.getByRole("note").allTextContents();
  const copy = notices.join(" ");
  const falseClaims = [
    /fictional event references/i,
    /no real customer records/i,
    /no investigation api queries/i,
    /مراجع أحداث خيالية/,
    /لا توجد.*استعلامات.*api/i,
  ];
  for (const claim of falseClaims) {
    expect(copy, `Real G2 API called; misleading DEMO DATA disclosure: ${claim}`)
      .not.toMatch(claim);
  }
  // UI cannot show a fictional fixture row when the real request is connected.
  const first = page.locator('button[aria-pressed][class*="sessionChoice"]').first();
  if (await first.isVisible()) {
    const text = await first.innerText();
    expect(text).not.toContain("VS-DEMO-1021");
  }
});
