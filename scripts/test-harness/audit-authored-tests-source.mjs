import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const caseNames = new Set(["test", "it", "specify"]);
const suiteNames = new Set(["describe", "suite"]);
const runnerModules = new Set([
  "vitest",
  "@playwright/test",
  "node:test",
  "@jest/globals",
  "bun:test",
]);
const caseModifiers = new Set([
  "only",
  "skip",
  "todo",
  "concurrent",
  "sequential",
  "fails",
]);
const conditionalModifiers = new Set(["skipIf", "runIf"]);
const suiteModifiers = new Set([
  "only",
  "skip",
  "concurrent",
  "parallel",
  "serial",
  "sequential",
]);

const patterns = {
  arbitrary_wait:
    /(?:waitForTimeout|sleep)\s*\(|new\s+Promise\s*\([^)]*setTimeout/gi,
  strict_text: /\.(?:toContainText|toHaveText|toEqualText|toHaveTitle)\s*\(/gi,
  structural_locator: /\.locator\s*\(\s*['"`][\s]*[.#>\[]/gi,
  position_locator: /\.(?:nth|first|last)\s*\(/gi,
  snapshot:
    /\.(?:toMatchSnapshot|toMatchInlineSnapshot|toHaveScreenshot)\s*\(/gi,
  implementation_calls:
    /\.(?:toHaveBeenCalledTimes|toHaveBeenNthCalledWith)\s*\(/gi,
  module_mock: /\b(?:vi|jest)\.mock\s*\(/gi,
  synthetic_ssr: /\brenderToStaticMarkup\s*\(/gi,
  mutable_global:
    /\b(?:vi|jest)\.(?:stubGlobal|setSystemTime|useFakeTimers)\s*\(/gi,
};

function sourceSignals(source) {
  return Object.entries(patterns)
    .map(([name, regexp]) => {
      regexp.lastIndex = 0;
      const count = [...source.matchAll(regexp)].length;
      return count ? `${name}:${count}` : null;
    })
    .filter(Boolean)
    .join(";");
}

function titleOf(node, source) {
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isTemplateExpression(node))
    return `DYNAMIC_TEMPLATE:${node.getText(source).slice(0, 120)}`;
  return `DYNAMIC_EXPRESSION:${node.getText(source).slice(0, 120)}`;
}

function unwrap(node) {
  while (
    node &&
    (ts.isParenthesizedExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isSatisfiesExpression(node) ||
      ts.isNonNullExpression(node))
  )
    node = node.expression;
  return node;
}

function callChain(node) {
  node = unwrap(node);
  if (ts.isIdentifier(node)) return [node.text];
  if (ts.isPropertyAccessExpression(node)) {
    const base = callChain(node.expression);
    return base ? [...base, node.name.text] : null;
  }
  if (
    ts.isElementAccessExpression(node) &&
    ts.isStringLiteralLike(node.argumentExpression)
  ) {
    const base = callChain(node.expression);
    return base ? [...base, node.argumentExpression.text] : null;
  }
  if (ts.isCallExpression(node) || ts.isTaggedTemplateExpression(node)) {
    return callChain(node.expression);
  }
  return null;
}

function declaredBindings(file) {
  const aliases = new Map(),
    namespaces = new Set();
  for (const statement of file.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !runnerModules.has(statement.moduleSpecifier.text)
    )
      continue;
    const bindings = statement.importClause;
    if (!bindings) continue;
    if (bindings.name)
      aliases.set(
        bindings.name.text,
        statement.moduleSpecifier.text === "node:test" ? "test" : "test",
      );
    const named = bindings.namedBindings;
    if (named && ts.isNamespaceImport(named)) namespaces.add(named.name.text);
    if (named && ts.isNamedImports(named)) {
      for (const entry of named.elements) {
        aliases.set(
          entry.name.text,
          entry.propertyName?.text ?? entry.name.text,
        );
      }
    }
  }
  return { aliases, namespaces };
}

function describeCall(node, source, bindings, nodeContexts) {
  const dataCall =
    ts.isCallExpression(node.expression) ||
    ts.isTaggedTemplateExpression(node.expression)
      ? node.expression
      : null;
  const parts = callChain(node.expression);
  if (!parts || node.arguments.length === 0) return null;
  let name = parts[0],
    modifiers = parts.slice(1);
  if (bindings.namespaces.has(name) && parts.length > 1) {
    name = parts[1];
    modifiers = parts.slice(2);
  } else if (nodeContexts.has(name) && modifiers[0] === "test") {
    name = "test";
    modifiers = modifiers.slice(1);
  } else if (
    parts.length > 1 &&
    !caseNames.has(name) &&
    !suiteNames.has(name) &&
    !bindings.aliases.has(name)
  ) {
    // An unrelated object.test() is not a runner registration.
    return null;
  } else {
    name = bindings.aliases.get(name) ?? name;
  }
  if (name === "test" && modifiers[0] === "describe") {
    name = "describe";
    modifiers = modifiers.slice(1);
  }
  const kind = suiteNames.has(name)
    ? "suite"
    : caseNames.has(name)
      ? "case"
      : null;
  if (!kind) return null;
  const allowed = kind === "suite" ? suiteModifiers : caseModifiers;
  if (
    modifiers.some(
      (modifier) =>
        !allowed.has(modifier) &&
        !["each", "for", ...conditionalModifiers].includes(modifier),
    )
  ) {
    return null;
  }
  if (
    kind === "suite" &&
    modifiers.some((item) => conditionalModifiers.has(item))
  )
    return null;
  const factory = modifiers.includes("each") || modifiers.includes("for");
  const conditional = modifiers.some((item) => conditionalModifiers.has(item));
  if ((factory || conditional) && !dataCall) return null;
  const identifier = parts.join(".");
  const title = titleOf(node.arguments[0], source);
  let expansion = "one-declaration";
  let declaredRows = 1;
  if (factory && dataCall) {
    const dataset = ts.isCallExpression(dataCall)
      ? dataCall.arguments[0]
      : dataCall.template;
    const staticDataset = dataset ? unwrap(dataset) : undefined;
    if (staticDataset && ts.isArrayLiteralExpression(staticDataset)) {
      declaredRows = staticDataset.elements.length;
      expansion = "static-each";
    } else {
      declaredRows = 0;
      expansion = "dynamic-each";
    }
  } else if (conditional) {
    expansion = "conditional";
  } else if (title.startsWith("DYNAMIC_")) {
    expansion = "dynamic-title";
  }
  return { kind, title, expansion, declaredRows, identifier };
}

export function scanAuthoredSource(path, source) {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const bindings = declaredBindings(file);
  const tests = [];
  let suiteDeclarations = 0;
  let unresolvedComputedRegistrations = 0;
  function visit(node, suite = [], multiplier = 1, nodeContexts = new Set()) {
    if (
      ts.isCallExpression(node) &&
      ts.isElementAccessExpression(node.expression) &&
      !ts.isStringLiteralLike(node.expression.argumentExpression)
    ) {
      const parts = callChain(node.expression.expression);
      const root = parts?.[0];
      if (
        root &&
        (caseNames.has(root) ||
          suiteNames.has(root) ||
          bindings.aliases.has(root) ||
          bindings.namespaces.has(root))
      ) {
        unresolvedComputedRegistrations++;
      }
    }
    const metadata = ts.isCallExpression(node)
      ? describeCall(node, file, bindings, nodeContexts)
      : null;
    if (metadata?.kind === "case") {
      const line =
        file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
      const expanded =
        multiplier === 0 || metadata.declaredRows === 0
          ? 0
          : multiplier * metadata.declaredRows;
      const expansion =
        multiplier === 0
          ? "dynamic-suite-each"
          : multiplier !== 1
            ? `suite-${metadata.expansion}`
            : metadata.expansion;
      tests.push({
        line,
        suite: suite.join(" › "),
        ...metadata,
        declaredRows: expanded,
        expansion,
      });
    }
    if (metadata?.kind === "suite") {
      suiteDeclarations++;
      const nextSuite = [...suite, metadata.title];
      const nextMultiplier =
        multiplier === 0 || metadata.declaredRows === 0
          ? 0
          : multiplier * metadata.declaredRows;
      for (const argument of node.arguments) {
        if (ts.isFunctionLike(argument)) {
          ts.forEachChild(argument, (child) =>
            visit(child, nextSuite, nextMultiplier, nodeContexts),
          );
        } else {
          visit(argument, suite, multiplier, nodeContexts);
        }
      }
      return;
    }
    ts.forEachChild(node, (child) => {
      let next = nodeContexts;
      if (
        metadata?.kind === "case" &&
        ts.isFunctionLike(child) &&
        path.endsWith(".mjs") &&
        child.parameters.length > 0
      ) {
        const first = child.parameters[0].name;
        if (ts.isIdentifier(first)) {
          next = new Set(nodeContexts);
          next.add(first.text);
        }
      }
      visit(child, suite, multiplier, next);
    });
  }
  visit(file);
  return {
    tests,
    suiteDeclarations,
    unresolvedComputedRegistrations,
    parseDiagnostics: file.parseDiagnostics.length,
    sourceSignals: sourceSignals(source),
  };
}
