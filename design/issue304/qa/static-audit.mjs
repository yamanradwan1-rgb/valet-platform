import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { designDir, findOptions, makeRecorder, optionId, qaDir } from './browser-setup.mjs';

const options = findOptions();
if (options.length !== 4) {
  process.stderr.write(`Four built HTML options required; found ${options.length}.\n`);
  process.exitCode = 2;
} else {
  const fixture = JSON.parse(readFileSync(join(designDir, 'fixtures', 'canonical-data.json'), 'utf8'));
  const { record, checks } = makeRecorder();
  const signatures = new Map();
  const details = [];
  const sha = (value) => createHash('sha256').update(value).digest('hex');
  for (const path of options) {
    const option = optionId(path);
    const context = { option };
    const html = readFileSync(path, 'utf8');
    const shellCss = html.match(/<style data-issue304-shell>([\s\S]*?)<\/style>/)?.[1];
    const shellJs = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    const navigation = html.match(/<aside class="sidebar"[\s\S]*?<\/aside>/)?.[0];
    const topbar = html.match(/<header class="topbar"[\s\S]*?<\/header>/)?.[0];
    record('standalone-embedded-css', Boolean(shellCss) && Boolean(html.match(/<style data-issue304-interior>/)), context);
    record('standalone-shell-script', Boolean(shellJs), context);
    record('offline-external-script', !/<script[^>]+src=["']https?:/i.test(html), context);
    record('offline-external-css', !/<link[^>]+href=["']https?:/i.test(html), context);
    record('placeholder-free', !/%%[A-Z_]+%%/.test(html), context);
    const signaturesNow = Object.fromEntries(Object.entries({ shellCss, shellJs, navigation, topbar })
      .map(([name, value]) => [name, value ? sha(value) : null]));
    if (!signatures.size) for (const [name, value] of Object.entries(signaturesNow)) signatures.set(name, value);
    for (const [name, signature] of Object.entries(signaturesNow)) {
      record(`shell-source-parity-${name}`, Boolean(signature) && signature === signatures.get(name), context,
        `${signature ?? 'missing'} vs ${signatures.get(name) ?? 'missing'}`);
    }
    const resources = [];
    for (const location of fixture.locations) for (const type of ['keys', 'spots']) {
      const codes = fixture.resources[location.id][type].map((row) => row.code);
      const present = codes.filter((code) => html.includes(code));
      resources.push({ location: location.id, type, expected: codes.length, sourcePresent: present.length,
        missing: codes.filter((code) => !present.includes(code)) });
      record(`fixture-source-${location.id}-${type}`, present.length === codes.length,
        context, `${present.length}/${codes.length} raw resource codes embedded`);
    }
    details.push({ option, path, shellHash: signaturesNow, resources });
  }
  const totals = Object.fromEntries(['PASS', 'FAIL', 'NOT_RUN'].map((status) =>
    [status, checks.filter((check) => check.status === status).length]));
  const output = join(qaDir, 'static-results.json');
  writeFileSync(output, JSON.stringify({ runAt: new Date().toISOString(), totals, checks, details }, null, 2));
  process.stdout.write(`Saved ${output}\n${JSON.stringify(totals)}\n`);
  if (totals.FAIL) process.exitCode = 1;
}
