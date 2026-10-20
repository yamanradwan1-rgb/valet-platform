import assert from 'node:assert/strict';
import { Script } from 'node:vm';
import { assembleShell } from './assemble.mjs';

const contents = '<section data-design-example><h1>Shell smoke</h1></section>';
const html = assembleShell({ interiorHtml: contents, theme: 'dark' });
const arabic = assembleShell({ interiorHtml: contents, locale: 'ar', theme: 'light' });
const replacementSafety = assembleShell({ interiorHtml: contents, interiorJs: 'const $$ = "$& $1";' });

assert.match(html, /<html lang="en" dir="ltr" data-theme="dark">/);
assert.match(arabic, /<html lang="ar" dir="rtl" data-theme="light">/);
assert.match(html, /data-shell-location>Meridian Hotel — Main Entrance</);
assert.match(html, /Harbor Event Center/);
assert.match(html, /فندق ميريديان — المدخل الرئيسي/);
assert.match(html, /مركز هاربر للفعاليات/);
assert.match(html, /aria-current="page"/);
assert.match(html, /data-shell-nav="main"/);
assert.match(html, /data-shell-nav="utility"/);
assert.match(html, /data-shell-nav="mobile"/);
assert.match(html, /vaylet:shell-state/);
assert.match(html, /window\.VAYLET_304_SHELL_STATE/);
assert.match(html, /width="32" height="32" src="data:image\/png;base64/);
assert.match(html, /data:image\/png;base64/);
assert.match(html, /M15 2H6a2 2 0 0 0-2 2v16/); // custom Reports icon
assert.equal((html.match(/data:image\/png;base64/g) ?? []).length, 4);
assert.equal((html.match(/<title>/g) ?? []).length, 1);
assert.equal((html.match(/data-issue304-shell/g) ?? []).length >= 2, true);
assert.equal(/%%[A-Z_]+%%/.test(html), false);
assert.equal(/SHELL_LOCATION_FIXTURE/.test(html), false);
assert.match(replacementSafety, /const \$\$ = "\$& \$1";/);

for (const script of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
  new Script(script[1]);
}
console.log('PASS shell smoke: EN/AR, dark/light, fixture, assets, nav, control scripts');
