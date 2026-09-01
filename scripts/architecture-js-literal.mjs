export function readJavaScriptEscape(source, start) {
  const escaped = source[start + 1];
  if (escaped === undefined) {
    throw new Error("architecture import parser: unterminated escape");
  }
  const simpleEscapes = {
    0: "\0",
    b: "\b",
    f: "\f",
    n: "\n",
    r: "\r",
    t: "\t",
    v: "\v",
  };
  if (escaped === "\n") return { end: start + 2, value: "" };
  if (escaped === "\r") {
    const end = source[start + 2] === "\n" ? start + 3 : start + 2;
    return { end, value: "" };
  }
  if (escaped === "0" && /[0-9]/.test(source[start + 2] ?? "")) {
    throw new Error("architecture import parser: legacy octal escape");
  }
  if (Object.hasOwn(simpleEscapes, escaped)) {
    return { end: start + 2, value: simpleEscapes[escaped] };
  }
  if (escaped === "x") return readHexEscape(source, 2, start + 2);
  if (escaped === "u" && source[start + 2] === "{") {
    const close = source.indexOf("}", start + 3);
    if (close === -1) {
      throw new Error("architecture import parser: invalid Unicode escape");
    }
    const digits = source.slice(start + 3, close);
    return unicodeEscape(digits, close + 1);
  }
  if (escaped === "u") return readHexEscape(source, 4, start + 2);
  if (/[1-9]/.test(escaped)) {
    throw new Error("architecture import parser: legacy octal escape");
  }
  return { end: start + 2, value: escaped };
}

export function readTemplateLiteral(source, start) {
  let index = start + 1;
  let value = "";
  while (index < source.length) {
    const character = source[index];
    if (character === "`") return { end: index + 1, value };
    if (character === "$" && source[index + 1] === "{") {
      return { end: skipTemplateExpression(source, index + 2) };
    }
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

export function skipLineComment(source, index) {
  while (index < source.length && source[index] !== "\n") index += 1;
  return index;
}

function skipTemplateExpression(source, index) {
  while (index < source.length) {
    if (source[index] === "\\") index += 2;
    else if (source[index] === "`") return index + 1;
    else index += 1;
  }
  throw new Error("architecture import parser: unterminated template literal");
}

function readHexEscape(source, length, digitsStart) {
  const digits = source.slice(digitsStart, digitsStart + length);
  if (digits.length !== length || !/^[0-9A-Fa-f]+$/.test(digits)) {
    throw new Error("architecture import parser: invalid hexadecimal escape");
  }
  return unicodeEscape(digits, digitsStart + length);
}

function unicodeEscape(digits, end) {
  if (!/^[0-9A-Fa-f]{1,6}$/.test(digits)) {
    throw new Error("architecture import parser: invalid Unicode escape");
  }
  const codePoint = Number.parseInt(digits, 16);
  if (codePoint > 0x10ffff) {
    throw new Error("architecture import parser: Unicode escape out of range");
  }
  return { end, value: String.fromCodePoint(codePoint) };
}
