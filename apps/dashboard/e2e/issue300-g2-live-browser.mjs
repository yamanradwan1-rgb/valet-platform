import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

/** Real password/MFA UI against locally running isolated #300 G2.
 * Credentials are injected by the actual HTTP-login proof process, never saved.
 */
const email = process.env.ISSUE300_BROWSER_EMAIL;
const password = process.env.ISSUE300_BROWSER_PASSWORD;
const code = process.env.ISSUE300_BROWSER_TOTP_CODE;
const output = process.env.ISSUE300_BROWSER_OUTPUT;
if (!email || !password || !/^[0-9]{6}$/.test(code ?? "") || !output ||
    !output.replaceAll("\\", "/").includes("issue300-g2-owned")) {
  throw new Error("Explicit task-owned browser test inputs required");
}

const browser = await chromium.launch({ headless: true });
const responses = [];
const matrix = [];
let stage = "BROWSER_STARTED";
let safeDiagnostic = null;
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on("response", (res) => {
    if (res.url().includes("/audit-investigations/") ||
        res.url().includes("/management/audit-events") ||
        res.url().includes("/v1/staff/auth/login") ||
        res.url().includes("/management/organizations"))
      responses.push({ endpoint: new URL(res.url()).pathname, status: res.status() });
  });
  await page.goto("http://localhost:3113/audit-log?investigationDemo=1", {
    waitUntil: "domcontentloaded",
  });
  await page.locator("#staff-email").fill(email);
  await page.locator("#staff-password").fill(password);
  await page.locator("form button[type=submit]").first().click();
  stage = "ACTUAL_LOGIN_UI";
  // A NEW real browser password login creates a NEW Staff session. Its MFA
  // assurance cannot be inherited from the API-test session, even for the
  // same User/TOTP factor. Complete the actual STEP_UP_REQUIRED UI first.
  const totp = page.locator("#mfa-totp-mfaVerify");
  await totp.waitFor();
  await totp.fill(code);
  await page.locator("form:has(#mfa-totp-mfaVerify) button[type=submit]").click();
  stage = "REAL_MFA_STEPUP_UI";
  const org = page.getByRole("button", { name: "Task Issue300", exact: true }).first();
  try {
    await org.waitFor();
  } catch (error) {
    safeDiagnostic = await page.evaluate(() => ({
      pathname: location.pathname,
      visibleButtons: [...document.querySelectorAll("button")]
        .filter((button) => button.getClientRects().length > 0)
        .map((button) => button.textContent?.trim().slice(0, 64) ?? "")
        .slice(0, 12),
      alertCount: document.querySelectorAll('[role="alert"]').length,
      loginFormPresent: Boolean(document.getElementById("staff-email")),
      selectedScopePresent: Boolean(document.getElementById("audit-investigation-tab")),
    }));
    throw error;
  }
  await org.click();
  stage = "COMPANY_SCOPE_SELECTED";
  const location = page.getByRole("button", { name: "G2 A Location", exact: true }).first();
  await location.waitFor();
  await location.click();
  const tab = page.locator("#audit-investigation-tab");
  await tab.waitFor();
  await tab.click();
  assert.equal(await tab.getAttribute("aria-selected"), "true");
  stage = "AUTHORIZED_CONCEPT_A_UI";
  const form = page.locator("#audit-investigation-panel form").first();
  await form.locator('input[type="date"]').fill("2026-10-16");
  await form.locator('input[type="time"]').nth(0).fill("14:00");
  await form.locator('input[type="time"]').nth(1).fill("15:00");
  const searchResponse = page.waitForResponse((res) =>
    res.url().includes("/audit-investigations/sessions") && res.status() === 200);
  await form.locator('button[type="submit"]').click();
  await searchResponse;
  stage = "REAL_SEARCH_UI_HTTP_200";
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const locale of ["en", "ar"]) {
      for (const theme of ["light", "dark"]) {
        for (const zoom of [1, 2]) {
          await page.evaluate(({ locale, theme, zoom }) => {
            localStorage.setItem("vaylet_dashboard_locale", locale);
            document.documentElement.lang = locale;
            document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
            window.dispatchEvent(new Event("vaylet-dashboard-locale-change"));
            localStorage.setItem("vaylet_dashboard_theme", theme);
            document.documentElement.dataset.theme = theme;
            window.dispatchEvent(new Event("vaylet-dashboard-theme-change"));
            document.body.style.zoom = String(zoom);
          }, { locale, theme, zoom });
          const position = await page.evaluate(() => {
            const target = document.getElementById("audit-investigation-panel");
            const tab = document.getElementById("audit-investigation-tab");
            const rect = target?.getBoundingClientRect();
            return { exists: !!target, selected: tab?.getAttribute("aria-selected"),
              dir: document.documentElement.dir,
              documentWidth: document.documentElement.scrollWidth,
              viewportWidth: window.innerWidth,
              contentWidth: rect?.width ?? 0,
              visiblyRendered: (rect?.height ?? 0) > 0 };
          });
          assert.equal(position.exists, true);
          assert.equal(position.selected, "true");
          assert.equal(position.visiblyRendered, true);
          matrix.push({ width, locale, theme, zoom, ...position });
        }
      }
    }
  }
  await page.evaluate(() => { document.body.style.zoom = "1"; });
  await tab.focus();
  await page.keyboard.press("End");
  assert.equal(await tab.getAttribute("aria-selected"), "true");
  stage = "BROWSER_MATRIX_32_CASES";
  console.log("PASS real-browser: actual Company Admin login, MFA and location selection");
  console.log("PASS real-browser: 32 rendered EN/AR × light/dark × 320/390/768/1440 × CSS zoom1/2 cases");
  console.log("REAL_BROWSER_HTTP_INVESTIGATION_200=" +
    responses.filter((r) => r.status === 200 && r.endpoint.includes("audit-investigations")).length);
} finally {
  writeFileSync(output, JSON.stringify({
    stage, matrix, responses, safeDiagnostic,
    disclaimer: "CSS zoom is synthetic; Arabic Chromium zoom is not physical 200% evidence",
  }, null, 2));
  await browser.close();
}
