import { expect, test } from "@playwright/test";

import { enterInspector, inspector, selectFamily } from "./issue304-contract";
import { issue304Fixture } from "./issue304-fixture";

test("Issue304 persisted QR downloads a fresh authorized PNG and prints only after a fresh read", async ({ page }) => {
  let labelReads = 0;
  const fixture = issue304Fixture({
    onRequest: (path, request) => {
      if (request.method() === "GET" && /\/physical-resources\/(key-slots|parking-spots)\/[^/]+\/label$/u.test(path))
        labelReads++;
      return undefined;
    },
  });
  await fixture.install(page);
  await enterInspector(page);
  await selectFamily(page, "keys");
  await inspector(page).locator('[data-resource-code="K-02"]').click();
  await inspector(page).locator(".c-detail .c-qr-action").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("img", { name: /KEY_SLOT K-02 QR/u })).toBeVisible();
  await expect.poll(() => labelReads).toBeGreaterThanOrEqual(1);

  const firstReadCount = labelReads;
  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /Download QR/u }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.png$/iu);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const bytes = Buffer.concat(chunks);
  expect(bytes.length).toBeGreaterThan(500);
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  expect(labelReads, "download must re-read current authorized QR label").toBeGreaterThan(firstReadCount);

  await page.evaluate(() => {
    window.print = () => { document.documentElement.dataset.issue304Printed = "yes"; };
  });
  const downloadReadCount = labelReads;
  await dialog.getByRole("button", { name: /Print Label/u }).click();
  await expect(page.locator("html")).toHaveAttribute("data-issue304-printed", "yes");
  expect(labelReads, "print must re-read current authorized QR label").toBeGreaterThan(downloadReadCount);
});
