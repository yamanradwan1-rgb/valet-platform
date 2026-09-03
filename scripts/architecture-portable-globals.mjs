import { tokenizeJavaScript } from "./architecture-js-tokenizer.mjs";

const PORTABLE_FORBIDDEN_GLOBALS = new Set([
  "DOMException",
  "Request",
  "RequestInit",
  "Response",
  "document",
  "fetch",
  "localStorage",
  "navigator",
  "sessionStorage",
  "window",
]);

export function checkPortableGlobals(files) {
  const violations = [];
  for (const [path, source] of files) {
    if (!path.startsWith("packages/employee-client/src/")) continue;
    const found = new Set(
      tokenizeJavaScript(source)
        .filter(
          (token) =>
            token.kind === "identifier" &&
            PORTABLE_FORBIDDEN_GLOBALS.has(token.value),
        )
        .map((token) => token.value),
    );
    for (const name of [...found].sort()) {
      violations.push(
        `${path}: ${name} violates portable Employee client global boundary`,
      );
    }
  }
  return violations;
}
