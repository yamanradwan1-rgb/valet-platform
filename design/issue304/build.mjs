// Assemble four stand-alone, offline HTML artifacts from one immutable shell.
// Scope: design-only; never imports or contacts the Dashboard production app.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assembleShell } from './foundation/assemble.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(root, 'fixtures/canonical-data.json'), 'utf8'));
const safeJSON = JSON.stringify(fixture).replace(/</g, '\\u003c');

function readOption(n, extensionVariants) {
  for (const path of extensionVariants.map(ext => join(root, 'concepts', 'option-' + n + ext))) {
    if (existsSync(path)) return readFileSync(path, 'utf8');
  }
  throw new Error('Missing option ' + n + ' source: ' + extensionVariants.join(', '));
}

for (let n = 1; n <= 4; n++) {
  const body = readOption(n, ['.inner', '.interior.html', '.fragment.html']);
  const css = readOption(n, ['.css', '.interior.css']);
  const js = readOption(n, ['.js', '.interior.js']);
  const html = assembleShell({
    interiorHtml: body,
    interiorCss: css,
    interiorJs: 'window.VAYLET_304_DATA = ' + safeJSON + ';\n' + js,
    title: 'Keys & Spots — Design Option ' + n,
    locale: 'en',
    theme: 'dark'
  });
  const output = join(root, 'option-' + n + '.html');
  writeFileSync(output, html, 'utf8');
  process.stdout.write('Built ' + output + ' (' + Buffer.byteLength(html) + ' bytes)\n');
}
