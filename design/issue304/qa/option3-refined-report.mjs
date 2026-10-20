// Only render final Option3-refined evidence from the saved real-browser results.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { qaDir, designDir } from './browser-setup.mjs';

const source = join(qaDir, 'option3-refined-results.json');
let result;
try { result = JSON.parse(readFileSync(source, 'utf8')); }
catch { process.stderr.write('NO REFINED BROWSER RESULTS: report not written. Wait for Prime GO.\n'); process.exit(2); }
const checks = result.checks || [];
const count = (name, status = 'PASS') => checks.filter((check) => check.name === name && check.status === status).length;
const total = (name) => checks.filter((check) => check.name === name).length;
const failures = checks.filter((check) => check.status === 'FAIL');
const inherited = failures.filter((check) => check.inheritedShell);
const regressions = failures.filter((check) => !check.inheritedShell);
const failuresByType = [...new Set(failures.map((item) => item.name))].map((name) => {
  const items = failures.filter((check) => check.name === name);
  const sample = items[0];
  return `| ${name} | ${items.length} | ${sample.inheritedShell ? 'Inherited frozen shell P1' : 'Refined Option 3 / runner investigation'} | ${JSON.stringify({ width: sample.width, locale: sample.locale, theme: sample.theme, loc: sample.loc, type: sample.type, code: sample.code, detail: sample.detail }).replaceAll('|', '\\|')} |`;
});
const screenshotLinks = (result.screenshots || []).filter((name) =>
  /^option3-refined-(320|390|768|1440)-(en|ar)-(light|dark)-loc-[ab]\.png$/.test(name));
const detailImages = (result.screenshots || []).filter((name) => /-detail\.png$/.test(name));
const qrImages = (result.screenshots || []).filter((name) => /^option3-refined-qr-.*\.png$/.test(name));
const sampled = ['option3-refined-320-ar-dark-loc-a.png',
  'option3-refined-390-en-light-loc-a.png',
  'option3-refined-768-ar-light-loc-b.png',
  'option3-refined-1440-en-dark-loc-b.png']
  .filter((name) => result.screenshots.includes(name))
  .map((name) => `[${name}](screenshots/${name})`);

const markdown = `# Issue #304 — refined Option 3 independent Edge QA

**Executed:** ${result.testedAt}. Final tested assembled HTML SHA256:
\`${result.sourceSha256}\`. This report covers only option-3.html.

**${result.totals.PASS} PASS / ${result.totals.FAIL} FAIL / ${result.totals.NOT_RUN} NOT RUN.**
**${inherited.length} inherited shell failures; ${regressions.length} Option 3 or test failures.**

## Six live demo KPIs (synthetic fixture)

| Scope | Active key slots | Keys available | Keys in use | Active parking spots | Spots available | Spots occupied |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Location A expected | 6 | 2 | 4 | 7 | 3 | 4 |
| Location B expected | 2 | 1 | 1 | 2 | 1 | 1 |

Actual verification: ${count('six-kpi-exact-value')}/${total('six-kpi-exact-value')} exact values,
${count('six-kpi-present')}/${total('six-kpi-present')} rendered KPI cards,
${count('six-kpi-localized-label')}/${total('six-kpi-localized-label')} localized captions,
${count('six-kpi-readable-typography')}/${total('six-kpi-readable-typography')} computed font-size checks.
Counts run with both family tabs active, EN/AR, Light/Dark, both Locations and A→B→A restoration.

## Vehicle and keyboard parity

- Vehicle/list truth: ${count('resource-list-vehicle-truth')}/${total('resource-list-vehicle-truth')}.
  Selected-detail identity: ${count('selected-vehicle-identity-exact')}/${total('selected-vehicle-identity-exact')}.
- Occupied plate prominence in list: ${count('occupied-plate-prominent-in-list')}/${total('occupied-plate-prominent-in-list')}.
  Prominence in detail: ${count('occupied-plate-prominent-in-detail')}/${total('occupied-plate-prominent-in-detail')}.
- Inactive state truth: ${count('inactive-is-not-free-or-occupied')}/${total('inactive-is-not-free-or-occupied')}.
- Shell-native font: ${count('native-dashboard-font-family')}/${total('native-dashboard-font-family')}.
  Title size: ${count('title-readable-size')}/${total('title-readable-size')}.
  Interior offscreen controls: ${count('interior-controls-inside-screen')}/${total('interior-controls-inside-screen')}.
- QR opens: ${count('qr-preview-opens')}/${total('qr-preview-opens')}.
  Focus containment: ${count('qr-focus-trap-both-directions')}/${total('qr-focus-trap-both-directions')}.
  Escape: ${count('qr-escape')}/${total('qr-escape')}.
  Focus return: ${count('qr-focus-return')}/${total('qr-focus-return')}.
  Create preview: ${count('create-preview-preserved')}/${total('create-preview-preserved')}.

## Screenshots and material limits

Captured ${result.screenshots.length} actual Edge images under
evidence/screenshots/option3-refined-*.png; examples: ${sampled.join(', ') || 'see screenshots folder'}.
32 requested A/B responsive visual states: ${screenshotLinks.length}/32 screenshots;
${detailImages.length} selected vehicle-detail screenshots and ${qrImages.length} QR previews
(${result.screenshots.length} total).
All screenshots are from the single real Edge QA runner, not a CSS proxy.

The shared fixed-height VAYLET Dashboard topbar can wrap/sign-out overlap at
320px and 390px. Those checks remain individually recorded under
inherited-topbar-spill, and are not treated as Option 3 regressions.
The static QR images do not prove live QR scanning, and synthetic fixture
preview forms cannot prove production persistence, authorization or APIs.

## Observed failed checks

| Name | Count | Classification | One exact context |
| --- | ---: | --- | --- |
${failuresByType.join('\n') || '| None | 0 | — | — |'}

Machine-readable full results and exact font/geometry values:
[option3-refined-results.json](../qa/option3-refined-results.json).
`;
writeFileSync(join(designDir, 'evidence', 'option3-refined-qa.md'), markdown, 'utf8');
process.stdout.write(`Wrote Option 3 QA report: ${result.totals.PASS} PASS, ${result.totals.FAIL} FAIL, ${result.totals.NOT_RUN} NOT RUN.\n`);
