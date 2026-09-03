import {
  readJavaScriptEscape,
  skipLineComment,
} from "./architecture-js-literal.mjs";

export function tokenizeJavaScript(source) {
  const tokens = [];
  scanJavaScript(source, 0, tokens, false);
  return tokens;
}

function scanJavaScript(source, start, tokens, stopAtTemplateBrace) {
  let index = start;
  let braceDepth = 0;
  while (index < source.length) {
    const character = source[index];
    const next = source[index + 1];
    if (/\s/.test(character)) {
      index += 1;
    } else if (character === "/" && next === "/") {
      index = skipLineComment(source, index + 2);
    } else if (character === "/" && next === "*") {
      index = skipBlockComment(source, index + 2);
    } else if (character === '"' || character === "'") {
      const token = readStaticLiteral(source, index, character);
      tokens.push({ kind: "string", value: token.value });
      index = token.end;
    } else if (character === "`") {
      index = readTemplateTokens(source, index, tokens);
    } else if (/[A-Za-z_$]/.test(character)) {
      const start = index;
      index += 1;
      while (index < source.length && /[A-Za-z0-9_$]/.test(source[index])) {
        index += 1;
      }
      tokens.push({ kind: "identifier", value: source.slice(start, index) });
    } else if (stopAtTemplateBrace && character === "}") {
      if (braceDepth === 0) return { closed: true, end: index + 1 };
      braceDepth -= 1;
      tokens.push({ kind: "punctuator", value: character });
      index += 1;
    } else {
      if (stopAtTemplateBrace && character === "{") braceDepth += 1;
      tokens.push({ kind: "punctuator", value: character });
      index += 1;
    }
  }
  return { closed: !stopAtTemplateBrace, end: index };
}

function readTemplateTokens(source, start, tokens) {
  let index = start + 1;
  let value = "";
  let hasExpression = false;
  while (index < source.length) {
    const character = source[index];
    if (character === "`") {
      if (!hasExpression) tokens.push({ kind: "string", value });
      return index + 1;
    }
    if (character === "$" && source[index + 1] === "{") {
      hasExpression = true;
      tokens.push({ kind: "punctuator", value: "${" });
      const expression = scanJavaScript(source, index + 2, tokens, true);
      if (!expression.closed) {
        throw new Error(
          "architecture import parser: unterminated template literal",
        );
      }
      index = expression.end;
    } else if (character === "\\") {
      const escape = readJavaScriptEscape(source, index);
      value += escape.value;
      index = escape.end;
    } else {
      value += character;
      index += 1;
    }
  }
  if (!hasExpression) tokens.push({ kind: "string", value });
  return index;
}

function skipBlockComment(source, index) {
  while (
    index < source.length &&
    !(source[index] === "*" && source[index + 1] === "/")
  ) {
    index += 1;
  }
  return Math.min(index + 2, source.length);
}

function readStaticLiteral(source, start, quote) {
  let index = start + 1;
  let value = "";
  while (index < source.length) {
    const character = source[index];
    if (character === quote) return { end: index + 1, value };
    if (character === "\\") {
      const escape = readJavaScriptEscape(source, index);
      value += escape.value;
      index = escape.end;
    } else {
      value += character;
      index += 1;
    }
  }
  return { end: index, value };
}
