import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { acquireIssue463BrowserTarget } from "./issue463-browser-target";

type Target = Awaited<ReturnType<typeof acquireIssue463BrowserTarget>>;

interface ScreenshotPage {
  screenshot(options: { path: string; animations: "disabled"; fullPage: boolean }): Promise<Buffer>;
}

/** Candidate-only synthetic browser captures, NOT frozen pixel acceptance. */
export async function createIssue463BrowserEvidence(target: Target) {
  if (!/^[a-f0-9]{32}$/.test(target.owner) || !/^[a-f0-9]{40}$/.test(target.candidate)) {
    throw new Error("Issue463 invalid evidence owner/candidate.");
  }
  const parent = resolve(process.cwd(), "../../tmp/issue463-p7-proof");
  const directory = resolve(parent, target.owner);
  await mkdir(parent, { recursive: true });
  await mkdir(directory);
  const captures: { name: string; sha256: string }[] = [];
  return {
    async capture(page: ScreenshotPage, name: string) {
      if (!/^[a-z0-9-]{1,60}$/.test(name) || captures.some(item => item.name === name)) {
        throw new Error("Issue463 duplicate/invalid capture identity.");
      }
      const filename = name + ".png";
      const bytes = await page.screenshot({
        path: resolve(directory, filename), animations: "disabled", fullPage: true,
      });
      captures.push({ name, sha256: createHash("sha256").update(bytes).digest("hex") });
      await writeFile(resolve(directory, "manifest.json"), JSON.stringify({
        candidate: target.candidate, owner: target.owner, synthetic: true,
        pixelAcceptance: false, captures,
      }, null, 2) + "\n");
    },
  };
}
