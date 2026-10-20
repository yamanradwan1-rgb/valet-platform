import { findOptions, launchEdge, makeRecorder } from './browser-setup.mjs';
import { verifyDialogs } from './dialog-checks.mjs';

const browser = await launchEdge();
const { checks, record } = makeRecorder();
try {
  for (const path of findOptions()) for (const locale of ['en', 'ar']) {
    await verifyDialogs(browser, path, locale, record);
  }
} finally { await browser.close(); }
process.stdout.write(JSON.stringify({ total: checks.length,
  failed: checks.filter((check) => check.status === 'FAIL') }, null, 2));
