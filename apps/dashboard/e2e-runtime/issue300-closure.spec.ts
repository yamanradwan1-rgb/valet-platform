import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import {
  consumeOneTimeMfaState, readOneTimeMfaState,
  requireOwnedBrowserTarget, requireSignedContinuation,
} from "./issue300-browser-safety";

// Real candidate only: no fixture interception or global runtime fixture reset.
const baseURL = process.env.ISSUE300_W7_BROWSER_URL;
const storageState = process.env.ISSUE300_W7_BROWSER_STORAGE_STATE;
const scenarioFile = process.env.ISSUE300_W7_BROWSER_SCENARIO;
const lease = process.env.ISSUE300_W7_EXCLUSIVE_LEASE;
const candidate = process.env.ISSUE300_R2_CANDIDATE_SHA;
// A static HttpOnly refresh cookie MUST NOT be replayed in 34 new contexts:
// replaying an already-rotated cookie revokes the underlying Staff session.
const singleCase = process.env.ISSUE300_W7_SINGLE_FRESH_MFA_CASE;
if (baseURL) requireOwnedBrowserTarget(baseURL, "/audit-log");
const ready = Boolean(
  baseURL && storageState && scenarioFile && lease && candidate && singleCase,
);
test.skip(
  !ready,
  "GAP: independent one-time MFA session/lease and single browser case required",
);
// The credential is read and validated only when the full owned session/lease
// context is present. Playwright receives these captured bytes as an object,
// not a path it could re-read after the one-use marker is claimed.
const frozenState = ready ? readOneTimeMfaState(storageState!) : undefined;
if (baseURL && frozenState) test.use({ baseURL, storageState: frozenState });
test.use({ trace: "off", screenshot: "off", video: "off" });
const scenario = ready
  ? (JSON.parse(readFileSync(resolve(scenarioFile!), "utf8")) as {
      candidateSha: string;
      leaseId: string;
      auditPath: string;
      date: string;
      start: string;
      end: string;
      expectsPaging: boolean;
      expectedSessionUuid: string;
      expectedSourceId: string;
      frozenScreenshots?: string;
    })
  : null;
if (scenario) {
  expect(scenario.candidateSha).toBe(candidate);
  expect(scenario.leaseId).toBe(lease);
  requireOwnedBrowserTarget(baseURL!, scenario.auditPath);
}
test.beforeAll(() => {
  if (ready && frozenState) consumeOneTimeMfaState(frozenState);
});

function safeOneTimeCase(
  title: string,
  run: (fixtures: { page: import("@playwright/test").Page },
    info: import("@playwright/test").TestInfo) => Promise<void>,
) {
  test.describe(title, () => {
    // Suite-time skip occurs before Playwright creates the page/context.
    // Never reuse this storageState for a second case or a later test run.
    test.skip(!ready || singleCase !== title,
      "A fresh, separate MFA-authenticated cookie is required per case");
    test(title, run);
  });
}

async function authorizedInvestigation(page: import("@playwright/test").Page) {
  await page.goto(scenario!.auditPath);
  const tab = page.locator("#audit-investigation-tab");
  await expect(tab).toBeVisible();
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("note")).toContainText(/AUTHORIZED|مصرّح/u);
  const form = page.locator("#audit-investigation-panel form").first();
  await form.locator('input[type="date"]').fill(scenario!.date);
  await form.locator('input[type="time"]').nth(0).fill(scenario!.start);
  await form.locator('input[type="time"]').nth(1).fill(scenario!.end);
  return form;
}

async function nativePreference(
  page: import("@playwright/test").Page,
  locale: "en" | "ar",
  theme: "light" | "dark",
) {
  const root = page.locator("html");
  const language = page.getByRole("button", { name: /Language|اللغة/u });
  if ((await root.getAttribute("lang")) !== locale) await language.click();
  await expect(root).toHaveAttribute("lang", locale);
  await expect(root).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
  await page
    .locator(".theme-segmented button")
    .filter({ hasText: theme === "light" ? /Light|فاتح/u : /Dark|داكن/u })
    .click();
  await expect(root).toHaveAttribute("data-theme", theme);
}

async function nativeZoom(
  page: import("@playwright/test").Page,
  factor: 1 | 2,
) {
  await page.keyboard.press("Control+0");
  const baseline = await page.evaluate(() => innerWidth);
  if (factor === 2) {
    // Browser keyboard shortcuts only. DPR injection or CSS zoom is not proof.
    for (let i = 0; i < 9; i++) {
      await page.keyboard.press("Control+Equal");
      const current = await page.evaluate(() => innerWidth);
      if (current <= baseline / 1.9) break;
    }
    const current = await page.evaluate(() => innerWidth);
    expect(
      current,
      "Real browser zoom unavailable; do not claim 200%",
    ).toBeLessThanOrEqual(baseline / 1.9);
  }
}

safeOneTimeCase("T56/T57/T58/T70: actual authorized UI pagination and failure recovery", async ({
  page,
}) => {
  const requests: { path: string; status: number }[] = [];
  const actualSourceKeys: string[] = [];
  page.on("response", (response) => {
    const path = new URL(response.url()).pathname;
    if (
      path.includes("/audit-investigations/") ||
      path.endsWith("/audit-events")
    ) {
      requests.push({ path, status: response.status() });
      if (path.endsWith("/timeline") && response.status() === 200) {
        void response
          .json()
          .then((body) => {
            for (const event of body.items ?? [])
              actualSourceKeys.push(`${event.key.source}:${event.key.eventId}`);
          })
          .catch(() => undefined);
      }
    }
  });
  const form = await authorizedInvestigation(page);
  const firstSearch = page.waitForResponse(
    (response) =>
      response.url().includes("/audit-investigations/sessions") &&
      !response.url().includes("/timeline") &&
      response.status() === 200,
  );
  await form.locator('button[type="submit"]').click();
  const firstSearchReply = await firstSearch;
  const searchPage = await firstSearchReply.json();
  expect(typeof searchPage.snapshotAt).toBe("string");
  expect(Array.isArray(searchPage.items)).toBe(true);
  const discoveredSessionIds = searchPage.items.map((item: { sessionId: string }) => item.sessionId);
  expect(requests.filter((r) => r.path.endsWith("/audit-events"))).toHaveLength(
    0,
  );
  const results = page.locator(
    "#audit-investigation-panel button[aria-pressed]",
  );
  if (scenario!.expectsPaging) {
    const more = page.getByRole("button", {
      name: /Load more Sessions|تحميل المزيد من الجلسات/u,
    });
    await expect(more).toBeVisible();
    const second = await requireSignedContinuation(page, "sessions", () => more.click(), searchPage);
    discoveredSessionIds.push(...second.items.map((item: { sessionId: string }) => item.sessionId));
  }
  expect(discoveredSessionIds).toContain(scenario!.expectedSessionUuid);
  const expectedResult = results.filter({ hasText: scenario!.expectedSessionUuid });
  await expect(expectedResult).toHaveCount(1);
  await expect(expectedResult).toBeVisible();
  const firstTimeline = page.waitForResponse((response) => {
    const path = new URL(response.url()).pathname;
    return path.includes("/audit-investigations/sessions/") &&
      path.endsWith(`/${scenario!.expectedSessionUuid}/timeline`);
  });
  await expectedResult.click();
  const firstTimelineReply = await firstTimeline;
  expect(firstTimelineReply.status()).toBe(200);
  const timelinePage = await firstTimelineReply.json();
  expect(typeof timelinePage.snapshotAt).toBe("string");
  expect(Array.isArray(timelinePage.items)).toBe(true);
  expect(timelinePage.session?.sessionId).toBe(scenario!.expectedSessionUuid);
  const events = page.locator(
    "#audit-investigation-panel li[data-kind] button",
  );
  await expect(events.first()).toBeVisible();
  if (scenario!.expectsPaging) {
    const more = page.getByRole("button", {
      name: /Load more events|تحميل المزيد من الأحداث/u,
    });
    await expect(more).toBeVisible();
    await requireSignedContinuation(page, "timeline", () => more.click(), timelinePage);
  }
  await expect
    .poll(() => actualSourceKeys.includes(scenario!.expectedSourceId))
    .toBe(true);
  const trigger = events.first();
  await trigger.click();
  const detail = page.getByRole("dialog");
  await expect(detail).toBeVisible();
  await expect(detail.locator("button[aria-label]").last()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(detail).toHaveCount(0);
  await expect(trigger).toBeFocused();

  // Real network abort must be followed by explicit user retry, not an API loop.
  let aborted = 0;
  const failure = (route: import("@playwright/test").Route) => {
    aborted++;
    return route.abort("failed");
  };
  const isSearch = (url: URL) =>
    url.pathname.endsWith("/audit-investigations/sessions");
  await page.route(isSearch, failure);
  await form.locator('button[type="submit"]').click();
  await expect.poll(() => aborted).toBe(1);
  await page.waitForTimeout(350);
  expect(aborted).toBe(1);
  await page.unroute(isSearch, failure);
});

safeOneTimeCase("T49/T60: the ordinary Audit Events tab retains separate read authority", async ({
  page,
}) => {
  // The ordinary /audit-log route defaults to Events. Investigation's
  // opt-in query intentionally defaults to its separate tab.
  await page.goto("/audit-log");
  await expect(page.locator("#audit-events-tab")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const legacyRead = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith("/audit-events") &&
      response.status() === 200,
  );
  await page.reload();
  await legacyRead;
  await expect(page.locator("#audit-events-panel")).toBeVisible();
  await page.goto(scenario!.auditPath);
  await page.locator("#audit-events-tab").click();
  await expect(page.locator("#audit-events-panel")).toBeVisible();
  await page.locator("#audit-investigation-tab").click();
  await expect(page.locator("#audit-events-panel")).toBeHidden();
  await page.locator("#audit-events-tab").click();
  await expect(page.locator("#audit-events-panel")).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
});

for (const locale of ["en", "ar"] as const)
  for (const theme of ["light", "dark"] as const)
    for (const width of [320, 390, 768, 1440] as const)
      for (const zoom of [1, 2] as const) {
        safeOneTimeCase(`UI-M1 authentic ${locale}/${theme}/${width}px/${zoom * 100}%`, async ({
          page,
        }, testInfo) => {
          await page.setViewportSize({ width, height: 900 });
          const form = await authorizedInvestigation(page);
          await nativePreference(page, locale, theme);
          await nativeZoom(page, zoom);
          await expect(form).toBeVisible();
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth),
          ).toBeLessThanOrEqual(await page.evaluate(() => innerWidth + 1));
          const bytes = await page.screenshot({ animations: "disabled" });
          const hash = createHash("sha256").update(bytes).digest("hex");
          await testInfo.attach("authenticated-visual", {
            body: bytes,
            contentType: "image/png",
          });
          if (!scenario!.frozenScreenshots)
            throw new Error(
              "GAP: exact same-fixture frozen baseline image missing",
            );
          const file = resolve(
            scenario!.frozenScreenshots,
            `${locale}-${theme}-${width}-${zoom * 100}.png`,
          );
          const baseline = readFileSync(file);
          const frozenHash = createHash("sha256")
            .update(baseline)
            .digest("hex");
          expect(hash, `Frozen visual regression: ${file}`).toBe(frozenHash);
        });
      }
