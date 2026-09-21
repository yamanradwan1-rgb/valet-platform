import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./roles-page.tsx", import.meta.url)),
  "utf8",
);

describe("Roles pagination scope boundary", () => {
  it("keeps cursor state inside a child keyed by the exact administration scope", () => {
    const boundary = source.indexOf("return <RolesPageContent key={scopeKey} />;");
    const content = source.indexOf("function RolesPageContent()", boundary);
    const cursor = source.indexOf("const [cursor, setCursor]", content);
    const history = source.indexOf("const [history, setHistory]", content);

    expect(boundary).toBeGreaterThan(-1);
    expect(content).toBeGreaterThan(boundary);
    expect(cursor).toBeGreaterThan(content);
    expect(history).toBeGreaterThan(content);
  });
});
