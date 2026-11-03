import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const caseNames = new Set(["test", "it", "specify"]);
const suiteNames = new Set(["describe", "suite"]);

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

function describeCall(node, source) {
  let expression = node.expression;
  const dataCall =
    ts.isCallExpression(expression) || ts.isTaggedTemplateExpression(expression)
      ? expression
      : null;
  if (dataCall) expression = dataCall.expression;
  const identifier = expression.getText(source).replace(/\s+/g, "");
  const parts = identifier.split(".");
  const rootName = parts[0];
  const nestedNodeTest = parts.length >= 2 && parts[1] === "test";
  const testDescribe = rootName === "test" && parts[1] === "describe";
  const testModifiers = new Set([
    "only",
    "skip",
    "todo",
    "concurrent",
    "sequential",
    "fails",
    "each",
    "for",
    "skipIf",
    "runIf",
  ]);
  const caseCall =
    (caseNames.has(rootName) &&
      (parts.length === 1 || testModifiers.has(parts[1]))) ||
    nestedNodeTest;
  const kind =
    suiteNames.has(rootName) || testDescribe
      ? "suite"
      : caseCall
        ? "case"
        : null;
  // test.step, test.use, lifecycle hooks and test.describe.configure are
  // NOT authored test declarations, even when they take a string argument.
  if (testDescribe && parts[2] === "configure") return null;
  if (!kind || node.arguments.length === 0) return null;
  // The inner test.each(data) is a factory, not a test declaration.
  if (
    ["each", "for", "skipIf", "runIf"].includes(parts.at(-1)) &&
    !dataCall &&
    !ts.isStringLiteralLike(node.arguments[0])
  )
    return null;
  const title = titleOf(node.arguments[0], source);
  let expansion = "one-declaration";
  let declaredRows = 1;
  if (dataCall) {
    const dataset = ts.isCallExpression(dataCall)
      ? dataCall.arguments[0]
      : dataCall.template;
    if (dataset && ts.isArrayLiteralExpression(dataset)) {
      declaredRows = dataset.elements.length;
      expansion = "static-each";
    } else {
      declaredRows = 0;
      expansion = "dynamic-each";
    }
  } else if (title.startsWith("DYNAMIC_")) {
    expansion = "dynamic-title";
  }
  return { kind, title, expansion, declaredRows, identifier };
}

export function scanAuthoredSource(path, source) {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const tests = [];
  let suiteDeclarations = 0;
  function visit(node, suite = []) {
    const metadata = ts.isCallExpression(node)
      ? describeCall(node, file)
      : null;
    if (metadata?.kind === "case") {
      const line =
        file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
      tests.push({ line, suite: suite.join(" › "), ...metadata });
    }
    if (metadata?.kind === "suite") {
      suiteDeclarations++;
      const nextSuite = [...suite, metadata.title];
      for (const argument of node.arguments) {
        if (ts.isFunctionLike(argument)) {
          ts.forEachChild(argument, (child) => visit(child, nextSuite));
        } else {
          visit(argument, suite);
        }
      }
      return;
    }
    ts.forEachChild(node, (child) => visit(child, suite));
  }
  visit(file);
  return {
    tests,
    suiteDeclarations,
    parseDiagnostics: file.parseDiagnostics.length,
    sourceSignals: sourceSignals(source),
  };
}
