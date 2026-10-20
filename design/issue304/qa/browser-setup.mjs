import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const qaDir = dirname(fileURLToPath(import.meta.url));
export const designDir = dirname(qaDir);
export const evidenceDir = join(designDir, 'evidence');
export const screenshotsDir = join(evidenceDir, 'screenshots');
export const widths = [320, 390, 768, 1440];
export const locales = ['en', 'ar'];
export const themes = ['light', 'dark'];

export function findOptions() {
  const visit = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'qa' || entry.name === 'evidence' || entry.name === 'foundation') return [];
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return visit(full);
    return /^option[-_ ]?[1-4]\.html$/i.test(entry.name) ? [full] : [];
  });
  return visit(designDir).sort((left, right) => left.localeCompare(right));
}

export function optionId(path) {
  const match = basename(path).match(/option[-_ ]?([1-4])\.html/i);
  return match ? `option-${match[1]}` : basename(path, '.html');
}

export async function launchEdge() {
  const candidates = [
    process.env.ISSUE304_PLAYWRIGHT,
    'D:/kndoom/valet-platform/node_modules/.pnpm/@playwright+test@1.62.1/node_modules/playwright',
    'D:/kndoom/valet-be06-baseline/node_modules/.pnpm/@playwright+test@1.62.1/node_modules/playwright',
  ].filter(Boolean);
  let chromium;
  for (const candidate of candidates) {
    try {
      const require = createRequire(pathToFileURL(join(resolve(candidate), 'package.json')));
      chromium = require(candidate).chromium;
      if (chromium) break;
    } catch { /* Try next existing installation. */ }
  }
  if (!chromium) throw Error(`Playwright missing: set ISSUE304_PLAYWRIGHT to an installed package (${candidates.join(', ')})`);
  const edge = process.env.ISSUE304_EDGE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  if (!existsSync(edge)) throw Error(`Edge not installed at ${edge}`);
  mkdirSync(screenshotsDir, { recursive: true });
  return chromium.launch({ executablePath: edge, headless: true, args: ['--no-first-run'] });
}

export function fileUrl(path) { return pathToFileURL(path).href; }

export function makeRecorder() {
  const checks = [];
  const record = (name, passed, context = {}, detail = '') => {
    checks.push({ name, status: passed === true ? 'PASS' : passed === false ? 'FAIL' : 'NOT_RUN', ...context, detail });
  };
  return { checks, record };
}
