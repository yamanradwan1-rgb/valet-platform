import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { designDir, findOptions, launchEdge, makeRecorder, qaDir } from './browser-setup.mjs';
import { runVisualMatrix, runZoomChecks } from './visual-matrix.mjs';
import { runInteractionChecks } from './interaction-checks.mjs';
import { verifyDialogs } from './dialog-checks.mjs';

const options = findOptions();
if (options.length !== 4) {
  process.stderr.write(`Issue #304 expects four HTML options; found ${options.length}: ${options.join(', ')}\n`);
  process.exitCode = 2;
} else {
  const { checks, record } = makeRecorder();
  const browser = await launchEdge();
  let matrix = [];
  let interactions = [];
  let zoom = [];
  try {
    matrix = await runVisualMatrix(browser, options, record);
    zoom = await runZoomChecks(browser, options, record);
    interactions = await runInteractionChecks(browser, options, record);
    for (const path of options) for (const locale of ['en', 'ar']) {
      await verifyDialogs(browser, path, locale, record);
    }
  } finally { await browser.close(); }
  const result = { runAt: new Date().toISOString(),
    repo: designDir, options, matrix, zoom, interactions, checks,
    totals: Object.fromEntries(['PASS', 'FAIL', 'NOT_RUN'].map((status) =>
      [status, checks.filter((check) => check.status === status).length])) };
  const resultPath = join(qaDir, 'results.json');
  writeFileSync(resultPath, JSON.stringify(result, null, 2));
  process.stdout.write(`Saved ${resultPath}\n${JSON.stringify(result.totals)}\n`);
  if (result.totals.FAIL) process.exitCode = 1;
}
