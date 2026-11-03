import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

export function unwrap(node) {
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

export function callChain(node) {
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
