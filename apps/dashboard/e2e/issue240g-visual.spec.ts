import { expect, test } from "@playwright/test";
import { staffForceEndCopy } from "../src/features/administration/staff/staff-force-end-copy";
import {
  forceFixture,
  FORCE_BASE,
  SHIFT_X,
  enterForceHistory,
  errorReply,
  forceResult,
  syntheticReason,
} from "./support/issue240g-force-end";

for (const variant of [
  { locale: "en", dark: false, width: 1440 },
  { locale: "ar", dark: true, width: 1440 },
  { locale: "en", dark: true, width: 480 },
  { locale: "ar", dark: false, width: 480 },
] as const) {
  test(`Force End ${variant.locale} ${variant.dark ? "dark" : "light"} ${variant.width}: keyboard, MFA, unknown, success`, async ({
    page,
  }, info) => {
    const messages: string[] = [];
    page.on("console", (message) => messages.push(message.text()));
    let attempt = 0;
    const setup = forceFixture({
      onPost: (body) => {
        if (++attempt === 1) return errorReply("MFA_STEP_UP_REQUIRED", 403);
        if (attempt === 2) return "abort";
        setup.state.ended = true;
        return { body: forceResult(body) };
      },
    });
    await page.setViewportSize({ width: variant.width, height: 900 });
    await setup.install(page);
    await enterForceHistory(page);
    if (variant.dark)
      await page
        .getByRole("group", { name: "Theme" })
        .getByRole("button")
        .nth(1)
        .click();
    if (variant.locale === "ar")
      await page.getByRole("button", { name: "Language", exact: true }).click();
    const t = staffForceEndCopy(variant.locale);
    await expect(page.locator("html")).toHaveAttribute(
      "dir",
      variant.locale === "ar" ? "rtl" : "ltr",
    );
    await page.evaluate(() => document.fonts.ready);
    await page.getByRole("table").getByRole("button").first().click();
    const drawer = page.getByRole("dialog");
    const action = drawer.getByRole("button", { name: t.action, exact: true });
    await expect(action).toBeVisible();
    await page.screenshot({
      path: info.outputPath("active-drawer.png"),
      animations: "disabled",
    });
    const list = setup.fixture.count(FORCE_BASE);
    await action.click();
    const dialog = page.getByRole("dialog", { name: t.action, exact: true });
    const reason = dialog.getByLabel(t.reason, { exact: true });
    await expect(reason).toBeFocused();
    await expect(reason).toHaveAttribute("aria-describedby", /reason-help/);
    await reason.fill(syntheticReason);
    const submit = dialog.getByRole("button", { name: t.action, exact: true });
    await expect(submit).toBeDisabled();
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("checkbox")).toBeFocused();
    await page.keyboard.press("Space");
    await page.keyboard.press("Tab");
    await expect(submit).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(
      dialog.getByRole("button", { name: t.cancel, exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(reason).toBeFocused();
    await page.screenshot({
      path: info.outputPath("force-end.png"),
      animations: "disabled",
    });
    expect(setup.fixture.count(FORCE_BASE)).toBe(list);
    await submit.click();
    const mfa = page.getByRole("dialog").last();
    const code = mfa.getByRole("textbox");
    await expect(code).toBeFocused();
    await page.screenshot({
      path: info.outputPath("nested-mfa.png"),
      animations: "disabled",
    });
    await code.fill("123456");
    await mfa.getByRole("button").first().click();
    await expect(page.getByRole("dialog")).toHaveCount(2);
    await expect(dialog.getByRole("status")).toHaveText(t.retry);
    expect(setup.posts).toHaveLength(1);
    await submit.click();
    await expect(dialog.getByRole("status")).toHaveText(t.unknown);
    await page.screenshot({
      path: info.outputPath("outcome-unknown.png"),
      animations: "disabled",
    });
    await dialog.getByRole("button", { name: t.refresh, exact: true }).click();
    await expect(dialog.getByRole("status")).toHaveText(t.reviewed);
    expect(setup.posts).toHaveLength(2);
    await dialog
      .getByRole("button", { name: t.retrySame, exact: true })
      .click();
    await expect(dialog.getByRole("status")).toHaveText(t.success);
    await page.screenshot({
      path: info.outputPath("success-pending-cash.png"),
      animations: "disabled",
    });
    expect(setup.posts).toHaveLength(3);
    expect(
      setup.posts.every(
        (body) => JSON.stringify(body) === JSON.stringify(setup.posts[0]),
      ),
    ).toBe(true);
    expect(setup.fixture.count(`${FORCE_BASE}/${SHIFT_X}`)).toBe(3);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(variant.width);
    const credentials = [syntheticReason, String(setup.posts[0]!.operationId)];
    const stored = await page.evaluate(async () => {
      const values = [
        location.href,
        document.cookie,
        JSON.stringify(localStorage),
        JSON.stringify(sessionStorage),
        ...performance.getEntriesByType("resource").map((value) => value.name),
      ];
      for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        for (const request of await cache.keys())
          values.push(request.url, await (await cache.match(request))!.text());
      }
      for (const info of await indexedDB.databases()) {
        if (!info.name) continue;
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open(info.name!);
          request.onsuccess = () => resolve(request.result);
          request.onerror = reject;
        });
        for (const name of database.objectStoreNames)
          values.push(
            JSON.stringify(
              await new Promise((resolve, reject) => {
                const request = database
                  .transaction(name)
                  .objectStore(name)
                  .getAll();
                request.onsuccess = () => resolve(request.result);
                request.onerror = reject;
              }),
            ),
          );
        database.close();
      }
      return values.join("\n");
    });
    for (const credential of credentials) {
      expect(stored).not.toContain(credential);
      expect(messages.join("\n")).not.toContain(credential);
    }
    await dialog.getByRole("button", { name: t.close, exact: true }).click();
    await expect(
      page.getByRole("dialog").getByRole("button").first(),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("table").getByRole("button").first(),
    ).toBeFocused();
  });
}
