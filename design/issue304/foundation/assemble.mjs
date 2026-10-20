import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(root, name), 'utf8');
const icons = JSON.parse(read('icons.snapshot.json'));
// Reports has a deliberately frozen custom FileText glyph in production.
// Reproduce its five paths from reports-reference-icons.ts exactly.
icons.ReportsFileText = `<svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-reports-file-text" aria-hidden="true"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"></path><path d="M14 2v4a2 2 0 0 0 2 2h4"></path><path d="M10 9H8"></path><path d="M16 13H8"></path><path d="M16 17H8"></path></svg>`;

// Pinned order/labels/icons from the Dashboard registry for a synthetic
// Company Admin, active exact-Location preview. Live nav is authorization-gated.
const navigation = [
  ['overview', '/overview', 'Overview', 'نظرة عامة', 'LayoutDashboard'],
  ['live-operations', '/live-operations', 'Live Operations', 'العمليات المباشرة', 'Activity'],
  ['vehicles', '/vehicles', 'Vehicles', 'المركبات', 'Car'],
  ['tasks', '/tasks', 'Tasks', 'المهام', 'ClipboardList'],
  ['employees-shifts', '/employees', 'Employees & Shifts', 'الموظفون والورديات', 'Users'],
  ['locations', '/locations', 'Locations', 'المواقع', 'MapPin'],
  ['maps-zones', '/maps-zones', 'Maps & Zones', 'الخرائط والمناطق', 'Map'],
  ['keys', '/keys', 'Keys & Spots', 'المفاتيح ومواقف السيارات', 'KeyRound'],
  ['payments', '/payments', 'Payments', 'المدفوعات', 'CreditCard'],
  ['incidents', '/incidents', 'Incidents', 'الحوادث', 'TriangleAlert'],
  ['visit-contacts', '/customers', 'Visit Contacts', 'جهات اتصال الزيارات', 'ContactRound'],
  ['analytics', '/analytics', 'Analytics', 'التحليلات', 'BarChart3'],
  ['reports', '/reports', 'Reports', 'التقارير', 'ReportsFileText'],
  ['policies-settings', '/policies', 'Policies & Settings', 'السياسات والإعدادات', 'FileCheck'],
  ['roles-permissions', '/roles-permissions', 'Roles & Permissions', 'الأدوار والصلاحيات', 'Shield'],
  ['branding', '/branding', 'Branding', 'الهوية البصرية', 'Palette'],
  ['billing-subscription', '/billing-subscription', 'Billing & Subscription', 'الاشتراك', 'Receipt'],
  ['management-audit', '/audit-log', 'Audit Log', 'سجل التدقيق', 'History'],
  ['security', '/security', 'Security', 'الأمان', 'ShieldCheck', 'utility'],
  ['help', '/help', 'Help', 'المساعدة', 'CircleHelp', 'utility'],
];

function escapeAttribute(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function iconMarkup(source, size, additionalClass = '') {
  let icon = source.replace(/width="\d+" height="\d+"/, `width="${size}" height="${size}"`);
  if (additionalClass) icon = icon.replace('class="lucide ', `class="${additionalClass} lucide `);
  return icon;
}

function navigationMarkup(includeUtility) {
  return navigation.filter((item) => includeUtility === 'all' ||
    (includeUtility === 'utility' ? item[5] === 'utility' : item[5] !== 'utility'))
    .map(([id, path, en, ar, icon]) => `<li><a class="nav-link" href="#" data-shell-route="${path}" ${id === 'keys' ? 'aria-current="page"' : ''}>${icons[icon].replace('class="lucide ', 'class="nav-icon lucide ')}<span class="nav-label" data-en="${escapeAttribute(en)}" data-ar="${escapeAttribute(ar)}">${en}</span></a></li>`).join('\n');
}

function dataPng(name) {
  return `data:image/png;base64,${readFileSync(join(root, 'assets', name)).toString('base64')}`;
}

export function assembleShell({ interiorHtml, interiorCss = '', interiorJs = '', title = 'Keys & Spots', locale = 'en', theme = 'light' }) {
  if (!['en', 'ar'].includes(locale) || !['light', 'dark'].includes(theme))
    throw new Error('locale must be en/ar and theme must be light/dark');
  const styles = [
    read('foundation.snapshot.css'),
    read('shell.snapshot.css'),
    read('controls.snapshot.css'),
    read('globals.snapshot.css').replace(/^@import[^\n]*\n/gm, ''),
    read('shell-additions.css'),
  ].join('\n');
  const locations = JSON.parse(readFileSync(join(root, '..', 'fixtures', 'canonical-data.json'), 'utf8')).locations;
  if (locations.length !== 2 || locations.some((location) => !location.name?.en || !location.name?.ar))
    throw new Error('Expected exactly two EN/AR synthetic canonical demo locations');
  const values = {
    '%%PAGE_TITLE%%': escapeAttribute(title),
    '%%SHELL_CSS%%': styles,
    '%%INTERIOR_CSS%%': interiorCss,
    '%%INTERIOR_HTML%%': interiorHtml,
    '%%SHELL_JS%%': read('shell-controls.js')
      .replace('SHELL_LOCATION_FIXTURE', JSON.stringify(locations))
      .replace('SHELL_COLLAPSE_EXPANDED_ICON', JSON.stringify(iconMarkup(icons.ChevronLeft, 16)))
      .replace('SHELL_COLLAPSE_COLLAPSED_ICON', JSON.stringify(iconMarkup(icons.ChevronRight, 16))),
    '%%INTERIOR_JS%%': interiorJs,
    '%%EMBLEM%%': dataPng('vaylet-emblem.png'),
    '%%WHITE_WORDMARK%%': dataPng('vaylet-text-white.png'),
    '%%DARK_WORDMARK%%': dataPng('vaylet-text-dark.png'),
    '%%MAIN_NAV%%': navigationMarkup('main'),
    '%%UTILITY_NAV%%': navigationMarkup('utility'),
    '%%ALL_NAV%%': navigationMarkup('all'),
    '%%LOCATION_A_EN%%': escapeAttribute(locations[0].name.en),
    '%%LOCATION_B_EN%%': escapeAttribute(locations[1].name.en),
    '%%BUILDING_ICON%%': iconMarkup(icons.Building2, 18, 'sidebar-scope-icon'),
    '%%SIDEBAR_CHEVRON_ICON%%': iconMarkup(icons.ChevronDown, 14, 'sidebar-scope-chevron'),
    '%%LOCATION_CHEVRON_ICON%%': iconMarkup(icons.ChevronDown, 14, 'location-context-chevron'),
    '%%COLLAPSE_ICON%%': iconMarkup(icons.ChevronLeft, 16),
    '%%MAP_PIN_ICON%%': iconMarkup(icons.MapPin, 18),
    '%%MENU_ICON%%': iconMarkup(icons.Menu, 20),
    '%%SUN_ICON%%': iconMarkup(icons.Sun, 15),
    '%%MOON_ICON%%': iconMarkup(icons.Moon, 15),
  };
  let html = read('shell.template');
  for (const [placeholder, value] of Object.entries(values))
    html = html.replaceAll(placeholder, () => value);
  if (/%%[A-Z_]+%%/.test(html)) throw new Error('Unresolved shell placeholder');
  html = html.replace('<html lang="en" dir="ltr" data-theme="light">',
    `<html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}" data-theme="${theme}">`);
  return html;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = new Map();
  for (let index = 2; index < process.argv.length; index += 2) {
    if (!process.argv[index]?.startsWith('--') || !process.argv[index + 1])
      throw new Error('Use --content path --output path [--css path] [--js path] [--title text] [--locale en|ar] [--theme light|dark]');
    args.set(process.argv[index].slice(2), process.argv[index + 1]);
  }
  if (!args.get('content') || !args.get('output')) throw new Error('Missing --content or --output');
  const output = assembleShell({
    interiorHtml: readFileSync(resolve(args.get('content')), 'utf8'),
    interiorCss: args.has('css') ? readFileSync(resolve(args.get('css')), 'utf8') : '',
    interiorJs: args.has('js') ? readFileSync(resolve(args.get('js')), 'utf8') : '',
    title: args.get('title') ?? 'Keys & Spots',
    locale: args.get('locale') ?? 'en',
    theme: args.get('theme') ?? 'light',
  });
  writeFileSync(resolve(args.get('output')), output, 'utf8');
  process.stdout.write(`Wrote self-contained HTML: ${resolve(args.get('output'))}\n`);
}
