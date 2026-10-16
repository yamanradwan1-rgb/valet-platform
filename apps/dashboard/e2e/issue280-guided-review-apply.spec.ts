import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { PresenceFixture, lmBase } from "./support/presence-fixtures";
import { mockIssue280Map } from "./issue280-map-first-map-mock";
import { checkGuidedBrowserZoom } from "./issue280-guided-review-zoom-fixture";

const fields = [
  "shiftStartPresenceMode",
  "shiftEndPresenceMode",
  "shiftPresenceMaxAccuracyMeters",
  "shiftPresenceMaxFixAgeSeconds",
] as const;
type Field = (typeof fields)[number];
const wizard = (page: Page) => page.getByTestId("presence-setup-steps");
const row = (page: Page, field: Field) =>
  page.locator(`[data-presence-field="${field}"]`);
const source = (page: Page, field: Field) =>
  page.getByTestId(`presence-inheritance-${field}`);
async function apply(page: Page) {
  const review = page.getByTestId("presence-setup-review");
  await review.getByRole("button", { name: "Review changes" }).click();
  const acknowledgement = review.getByRole("checkbox", { name: /I understand/u });
  if (await acknowledgement.count()) await acknowledgement.check();
  await review.getByRole("button", { name: "Confirm changes" }).click();
  return review.getByRole("button", { name: "Apply confirmed changes" });
}
const failed = (code: string, status = 409) => ({
  status, body: { code, message: "guided-review-qa", requestId: "guided-qa" },
});

async function step3(page: Page, fixture: PresenceFixture) {
  await mockIssue280Map(page);
  await fixture.open(page);
  await page.getByTestId("presence-view-setup").click();
  await wizard(page).getByRole("button", { name: "Step 3: Policy" }).click();
  await expect(page.getByTestId("presence-setup-policy")).toBeVisible();
  await page.getByTestId("presence-setup-policy").locator("details summary").click();
}

async function step4(page: Page, fixture: PresenceFixture) {
  await wizard(page).getByRole("button", { name: "Step 4: Review" }).click();
  await expect(page.getByTestId("presence-setup-review")).toBeVisible();
  expect(fixture.writes).toEqual([]);
}

async function customize(page: Page, field: Field, value: string) {
  const picker = source(page, field);
  await expect(picker).toHaveAccessibleName(/source/i);
  await picker.selectOption("CUSTOM");
  const editor = row(page, field);
  if (field.includes("Mode")) await editor.getByRole("combobox").last().selectOption(value);
  else await editor.getByRole("textbox").fill(value);
}

test("Step 3 drafts Start and End strict modes; Step 4 alone applies separate CAS writes", async ({ page }) => {
  const fixture = new PresenceFixture("LM");
  await step3(page, fixture);
  for (const field of fields) {
    await expect(source(page, field)).toBeVisible();
    await expect(source(page, field)).toHaveAccessibleName(/source/i);
    await expect(source(page, field)).toHaveValue("INHERIT");
  }
  await customize(page, fields[0], "REQUIRE");
  await customize(page, fields[1], "REQUIRE_OR_OVERRIDE");
  expect(fixture.writes).toEqual([]);
  await wizard(page).getByRole("button", { name: "Step 2: Zones" }).click();
  await wizard(page).getByRole("button", { name: "Step 3: Policy" }).click();
  await expect(row(page, fields[0]).getByRole("combobox").last()).toHaveValue("REQUIRE");
  await expect(row(page, fields[1]).getByRole("combobox").last())
    .toHaveValue("REQUIRE_OR_OVERRIDE");
  await step4(page, fixture);
  await expect(await apply(page)).toBeEnabled();
  await page.getByRole("button", { name: "Apply confirmed changes" }).click();
  await expect.poll(() => fixture.writes.length).toBe(2);
  expect(fixture.writes.map(({ path, body }) => [path, body.field, body.value]))
    .toEqual([
      [`${lmBase}/policy/override`, fields[0], "REQUIRE"],
      [`${lmBase}/policy/override`, fields[1], "REQUIRE_OR_OVERRIDE"],
    ]);
  const [first, second] = fixture.writes.map((write) => write.body);
  expect(first!.expectedRevision).toBe(1);
  expect(second!.expectedRevision).toBe(2);
  expect(second!.expectedCompanyRevision).toBe(1);
  expect(second!.configurationFingerprint).toBe("b".repeat(64));
  expect(first!.mutationId).toMatch(/^[0-9a-f-]{36}$/u);
  expect(second!.mutationId).toMatch(/^[0-9a-f-]{36}$/u);
  expect(second!.mutationId).not.toBe(first!.mutationId);
});

test("four individually labeled inheritance controls stage Set/Clear without implicit writes", async ({ page }) => {
  const fixture = new PresenceFixture("LM");
  fixture.policy.overrides.startModeOverride = "REQUIRE";
  fixture.policy.effective.startMode = "REQUIRE";
  fixture.policy.overrides.maxAccuracyMetersOverride = 60;
  fixture.policy.effective.maxAccuracyMeters = 60;
  await step3(page, fixture);
  for (const field of fields) await expect(source(page, field)).toHaveAccessibleName(/source/i);
  await source(page, fields[0]).selectOption("INHERIT");
  await customize(page, fields[1], "WARN_ONLY");
  await source(page, fields[2]).selectOption("INHERIT");
  await customize(page, fields[3], "45");
  await expect(source(page, fields[0])).toHaveValue("INHERIT");
  await expect(source(page, fields[1])).toHaveValue("CUSTOM");
  await expect(source(page, fields[2])).toHaveValue("INHERIT");
  await expect(source(page, fields[3])).toHaveValue("CUSTOM");
  expect(fixture.writes).toEqual([]);
  await step4(page, fixture);
  await expect(page.getByTestId("presence-setup-review")).toContainText(/saved/i);
  await (await apply(page)).click();
  await expect.poll(() => fixture.writes.length).toBe(4);
  expect(fixture.writes.map(({ path, body }) => [path, body.field]))
    .toEqual([
      [`${lmBase}/policy/override/clear`, fields[0]],
      [`${lmBase}/policy/override`, fields[1]],
      [`${lmBase}/policy/override/clear`, fields[2]],
      [`${lmBase}/policy/override`, fields[3]],
    ]);
  expect(fixture.writes.map(({ body }) => body.expectedRevision)).toEqual([1, 2, 3, 4]);
  expect(new Set(fixture.writes.map(({ body }) => body.mutationId)).size).toBe(4);
  expect(fixture.policy.overrides.startModeOverride).toBeNull();
  expect(fixture.policy.overrides.maxAccuracyMetersOverride).toBeNull();
  expect(fixture.policy.overrides.endModeOverride).toBe("WARN_ONLY");
  expect(fixture.policy.overrides.maxFixAgeSecondsOverride).toBe(45);
});

test("MFA during reviewed batch halts protected writes; verification never replays", async ({ page }) => {
  const fixture = new PresenceFixture("LM", (path, request, state) =>
    path === `${lmBase}/policy/override` && request.method() === "PUT" &&
    !state.fixture.mfaAssured ? failed("MFA_STEP_UP_REQUIRED", 403) : undefined,
  );
  await step3(page, fixture);
  await customize(page, fields[0], "REQUIRE");
  await customize(page, fields[1], "WARN_ONLY");
  await step4(page, fixture);
  const readyToApply = await apply(page);
  fixture.fixture.mfaAssured = false;
  fixture.fixture.mfaState = "STEP_UP_REQUIRED";
  await readyToApply.click();
  const mfa = page.getByRole("dialog").last();
  await expect(mfa).toContainText("Verification required");
  expect(fixture.writes).toHaveLength(1);
  await mfa.getByLabel("6-digit authenticator code").fill("123456");
  await mfa.getByRole("button", { name: "Verify", exact: true }).click();
  await expect(mfa).toHaveCount(0);
  expect(fixture.writes).toHaveLength(1);
  expect(fixture.policy.effective.startMode).toBe("OFF");
  expect(fixture.policy.effective.endMode).toBe("OFF");
  await expect(page.getByTestId("presence-setup-review")).toBeVisible();
});

test("UNKNOWN second field stops batch before third; exact reconciliation never auto-POSTs", async ({ page }) => {
  let unknown = "";
  const fixture = new PresenceFixture("LM", (path, request) => {
    if (path === `${lmBase}/policy/override` && request.method() === "PUT" &&
        request.postDataJSON().field === fields[1]) {
      unknown = request.postDataJSON().mutationId;
      return failed("SERVER_ERROR", 503);
    }
    if (path.includes("/results/")) {
      expect(path).toBe(`${lmBase}/results/${unknown}`);
      return { body: {
        mutationId: unknown, attribution: "UNKNOWN",
        effect: null, entityId: null, revision: null,
        canonical: { kind: "POLICY", value: fixture.policy },
      } };
    }
    return undefined;
  });
  await step3(page, fixture);
  await customize(page, fields[0], "WARN_ONLY");
  await customize(page, fields[1], "WARN_ONLY");
  await customize(page, fields[2], "70");
  await step4(page, fixture);
  await (await apply(page)).click();
  await expect.poll(() => fixture.writes.length).toBe(2);
  expect(fixture.writes.map(({ body }) => body.field)).toEqual([fields[0], fields[1]]);
  expect(fixture.policy.effective.startMode).toBe("WARN_ONLY");
  expect(fixture.policy.effective.endMode).toBe("OFF");
  expect(fixture.policy.effective.maxAccuracyMeters).toBe(50);
  expect(unknown).toMatch(/^[0-9a-f-]{36}$/u);
  await expect(page.getByRole("button", { name: "Retry reconciliation" })).toBeVisible();
  await page.getByRole("button", { name: "Retry reconciliation" }).click();
  expect(fixture.writes).toHaveLength(2);
  await page.getByTestId("presence-view-overview").click();
  await page.getByTestId("presence-view-setup").click();
  expect(fixture.writes).toHaveLength(2);
});

test("second-field CAS conflict keeps remaining proposed changes and never auto-rebases", async ({ page }) => {
  let stale = true;
  const fixture = new PresenceFixture("LM", (path, request, state) => {
    if (stale && path === `${lmBase}/policy/override` &&
        request.method() === "PUT" && request.postDataJSON().field === fields[1]) {
      stale = false;
      state.policy.overrides.revision = 3;
      state.policy.overrides.endModeOverride = "REQUIRE";
      state.policy.effective.endMode = "REQUIRE";
      state.policy.readiness = {
        ...state.policy.readiness, locationRevision: 3,
        configurationFingerprint: "c".repeat(64),
      };
      return failed("PRESENCE_REVISION_CONFLICT");
    }
    return undefined;
  });
  await step3(page, fixture);
  await customize(page, fields[0], "WARN_ONLY");
  await customize(page, fields[1], "WARN_ONLY");
  await customize(page, fields[3], "45");
  await step4(page, fixture);
  await (await apply(page)).click();
  await expect.poll(() => fixture.writes.length).toBe(2);
  expect(fixture.writes.map(({ body }) => body.field)).toEqual([fields[0], fields[1]]);
  expect(fixture.writes[1]!.body.expectedRevision).toBe(2);
  expect(fixture.policy.overrides.revision).toBe(3);
  await expect(page.getByTestId("presence-setup-review")).toBeVisible();
  expect(fixture.writes).toHaveLength(2);
  // A new server value must be explicitly reviewed; no third queued mutation.
});

test("non-wizard policy tab retains independent direct field Save semantics", async ({ page }) => {
  const fixture = new PresenceFixture("LM");
  await mockIssue280Map(page);
  await fixture.open(page);
  await page.getByTestId("presence-view-policy").click();
  const start = row(page, fields[0]);
  await source(page, fields[0]).selectOption("CUSTOM");
  await start.getByRole("combobox").last().selectOption("WARN_ONLY");
  expect(fixture.writes).toEqual([]);
  await start.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => fixture.writes.length).toBe(1);
  expect(fixture.writes[0]!.path).toBe(`${lmBase}/policy/override`);
  expect(fixture.writes[0]!.body).toMatchObject({
    field: fields[0], value: "WARN_ONLY", expectedRevision: 1,
  });
  await expect(page.getByTestId("presence-setup-review")).toHaveCount(0);
});

for (const locale of ["en", "ar"] as const)
  for (const theme of ["light", "dark"] as const)
    for (const width of [320, 390, 768, 1440] as const)
      test(`guided Step3/4 accessible draft preview: ${locale}/${theme}/${width}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        const fixture = new PresenceFixture("LM");
        await step3(page, fixture);
        await page.evaluate(({ locale, theme }) => {
          localStorage.setItem("vaylet_dashboard_locale", locale);
          localStorage.setItem("vaylet_dashboard_theme", theme);
          dispatchEvent(new Event("vaylet-dashboard-locale-change"));
          dispatchEvent(new Event("vaylet-dashboard-theme-change"));
        }, { locale, theme });
        await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        for (const field of fields) {
          await expect(source(page, field)).toHaveAccessibleName(/.+/);
          await expect(source(page, field)).toBeVisible();
        }
        await expect(page.getByTestId("presence-setup-policy")).toBeVisible();
        await wizard(page).getByRole("button", { name: locale === "ar"
          ? /الخطوة 4: المراجعة/u : "Step 4: Review" }).click();
        await expect(page.getByTestId("presence-setup-review")).toBeVisible();
        await expect(page.getByRole("button", { name: locale === "ar" ? "مراجعة التغييرات" : "Review changes" })).toBeVisible();
        const bounds = await page.evaluate(() => {
          const root = document.documentElement;
          const shell = document.querySelector<HTMLElement>(".shell-main");
          return {
            rootScroll: root.scrollWidth, rootClient: root.clientWidth,
            shellScroll: shell?.scrollWidth ?? 0, shellClient: shell?.clientWidth ?? 0,
          };
        });
        expect(bounds.rootScroll).toBeLessThanOrEqual(bounds.rootClient + 1);
        expect(bounds.shellScroll).toBeLessThanOrEqual(bounds.shellClient + 1);
        expect(fixture.writes).toEqual([]);
        const evidence = resolve(__dirname, "../../../tmp/issue-280-rem-w7-qa/guided");
        mkdirSync(evidence, { recursive: true });
        await page.screenshot({
          path: join(evidence, `${locale}-${theme}-${width}.png`),
          fullPage: true, animations: "disabled",
        });
      });

test("guided Step 3 and Review survive REAL Chromium tab zoom 200% at 720/384 CSS px", async () => {
  test.setTimeout(150_000);
  await checkGuidedBrowserZoom();
});
