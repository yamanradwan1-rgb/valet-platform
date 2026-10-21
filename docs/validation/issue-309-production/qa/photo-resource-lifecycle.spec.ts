import { expect, test, type Page } from "@playwright/test";
import { installPhotoScenario, openPhotos } from "./photo-scenario-fixture";

/** Browser-only probes of private-blob lifetime; do not enable VIEW policy. */
async function recordBlobLifetimes(page: Page) {
  await page.addInitScript(() => {
    const created: string[] = [];
    const revoked: string[] = [];
    const originalCreate = URL.createObjectURL.bind(URL);
    const originalRevoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob: Blob | MediaSource) => {
      const url = originalCreate(blob);
      created.push(url);
      return url;
    };
    URL.revokeObjectURL = (url: string) => {
      revoked.push(url);
      originalRevoke(url);
    };
    Object.defineProperty(window, "__issue309BlobAudit", { value: { created, revoked }, configurable: false });
  });
}

async function blobs(page: Page): Promise<{ created: string[]; revoked: string[]; rendered: number }> {
  return page.evaluate(() => {
    const audit = (window as unknown as { __issue309BlobAudit: { created: string[]; revoked: string[] } }).__issue309BlobAudit;
    return {
      created: [...audit.created], revoked: [...audit.revoked],
      rendered: document.querySelectorAll('img[src^="blob:"]').length,
    };
  });
}

test("opening, closing and reopening session Details revokes all private photo Blob URLs", async ({ page }) => {
  const { setup } = installPhotoScenario(page, "three");
  await setup();
  await recordBlobLifetimes(page);
  await openPhotos(page, "vehicles");
  await expect(page.locator('[class*="photoSection"] img[src^="blob:"]')).toHaveCount(3);
  const initial = await blobs(page);
  expect(initial.created).toHaveLength(3);
  expect(initial.revoked).toHaveLength(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const released = await blobs(page);
  expect(released.rendered).toBe(0);
  expect(new Set(released.revoked)).toEqual(new Set(initial.created));
  await page.getByRole("table").getByRole("button", { name: /Details|التفاصيل/u }).first().click();
  await expect(page.locator('[class*="photoSection"] img[src^="blob:"]')).toHaveCount(3);
  const reopened = await blobs(page);
  expect(reopened.created).toHaveLength(6);
  expect(new Set(reopened.created).size).toBe(6);
  expect(reopened.created.slice(3).every((url) => !initial.created.includes(url))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const finallyReleased = await blobs(page);
  expect(new Set(finallyReleased.revoked)).toEqual(new Set(finallyReleased.created));
});

test("a JPEG response arriving after drawer unmount cannot recreate a private Blob URL", async ({ page }) => {
  const { setup } = installPhotoScenario(page, "three");
  await setup();
  await recordBlobLifetimes(page);
  let entered!: () => void;
  let release!: () => void;
  const hasPendingBytes = new Promise<void>((resolve) => { entered = resolve; });
  const byteGate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/condition-photos/*/bytes", async (route) => {
    entered();
    await byteGate;
    try { await route.fallback(); } catch { /* Expected: aborted socket on unmount. */ }
  });
  await openPhotos(page, "vehicles");
  await hasPendingBytes;
  expect((await blobs(page)).created).toHaveLength(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  release();
  await page.waitForTimeout(200);
  const stale = await blobs(page);
  expect(stale.created).toHaveLength(0);
  expect(stale.rendered).toBe(0);
});
