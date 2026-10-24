import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../package.json', import.meta.url));
const ts = require('typescript');
const baseline = process.argv[2];
const candidate = resolve(process.argv[3] || '.');

if (!baseline) {
  throw new Error('Usage: node ui-freeze-compare.mjs <baseline-sha> <candidate-worktree>');
}

function git(args) {
  return execFileSync('git', ['-C', candidate, ...args], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  }).trim();
}

function listLines(text) {
  return text ? text.split(/\r?\n/).filter(Boolean) : [];
}

const changed = new Set([
  ...listLines(git(['diff', '--name-only', baseline, '--', 'apps/customer'])),
  ...listLines(git(['ls-files', '--others', '--exclude-standard', '--', 'apps/customer'])),
]);

function isTest(path) {
  return /(?:\.test|\.spec)\.[cm]?[jt]sx?$/.test(path)
    || /\/qa\//.test(path);
}

function forbiddenPresentationFile(path) {
  return /\.(?:css|scss|sass|less|svg|png|jpg|jpeg|webp)$/i.test(path)
    || path.startsWith('apps/customer/src/i18n/')
    || path.startsWith('apps/customer/public/')
    || /(?:copy|translation|theme|design-token|tailwind)/i.test(path);
}

function sourceFile(path, content) {
  const file = ts.createSourceFile(
    path,
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  if (file.parseDiagnostics.length) {
    throw new Error(`Cannot parse ${path}: ${file.parseDiagnostics[0].messageText}`);
  }
  return file;
}

function jsxFingerprint(file) {
  const roots = [];
  function nodeText(node) {
    return node.getText(file);
  }
  function attrs(attributes) {
    return attributes.properties.map((attr) => {
      if (ts.isJsxSpreadAttribute(attr)) return `...${nodeText(attr.expression)}`;
      const name = nodeText(attr.name);
      if (/^on[A-Z]/.test(name)) return `${name}={HANDLER}`;
      return nodeText(attr);
    });
  }
  function element(node) {
    if (ts.isJsxSelfClosingElement(node)) {
      return ['self', nodeText(node.tagName), attrs(node.attributes)];
    }
    if (ts.isJsxFragment(node)) {
      return ['fragment', children(node.children)];
    }
    return [
      'element',
      nodeText(node.openingElement.tagName),
      attrs(node.openingElement.attributes),
      children(node.children),
    ];
  }
  function children(nodes) {
    return nodes.map((node) => {
      if (ts.isJsxText(node)) return ['text', nodeText(node)];
      if (ts.isJsxExpression(node)) {
        if (!node.expression) return ['expression', 'empty'];
        return ['expression', nodeText(node.expression)];
      }
      return element(node);
    });
  }
  function visit(node) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)
      || ts.isJsxFragment(node)) {
      roots.push(element(node));
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return JSON.stringify(roots);
}

const violations = [];
const reviewed = [];
for (const path of [...changed].sort()) {
  if (isTest(path)) continue;
  if (forbiddenPresentationFile(path)) {
    violations.push(`${path}: forbidden presentation/style/translation change`);
    continue;
  }
  if (!path.endsWith('.tsx')) continue;
  let before = null;
  try {
    before = git(['show', `${baseline}:${path}`]);
  } catch {
    // A newly added logic-only TSX module has no baseline presentation tree.
  }
  const after = readFileSync(join(candidate, path), 'utf8');
  const oldFile = sourceFile(path, before ?? '');
  const newFile = sourceFile(path, after);
  const equal = jsxFingerprint(oldFile) === jsxFingerprint(newFile);
  reviewed.push({ path, jsxTreeEqual: equal });
  if (!equal) violations.push(`${path}: JSX tree/props/text changed`);
}

const result = {
  baseline,
  candidate,
  candidateHead: git(['rev-parse', 'HEAD']),
  customerFilesChanged: changed.size,
  jsxFilesReviewed: reviewed,
  violations,
  result: violations.length ? 'FAIL' : 'PASS',
  limitation: 'Static JSX fingerprint; does not replace browser visual or behavior QA.',
};
console.log(JSON.stringify(result, null, 2));
if (violations.length) process.exitCode = 1;
