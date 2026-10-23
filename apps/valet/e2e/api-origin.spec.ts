import { expect, test } from "@playwright/test";

import { resolveE2eApiOrigin } from "./support/api-origin";

test.describe("Employee E2E API connection", () => {
  test("uses an explicit isolated API endpoint ahead of the app API origin", () => {
    expect(resolveE2eApiOrigin({
      e2eApiUrl: "http://127.0.0.1:3101",
      apiOrigin: "http://127.0.0.1:3001",
    })).toBe("http://127.0.0.1:3101");
  });

  test("inherits the app API origin when the E2E override is absent", () => {
    expect(resolveE2eApiOrigin({ apiOrigin: "http://127.0.0.1:3101" }))
      .toBe("http://127.0.0.1:3101");
  });

  test("keeps CI localhost HTTP traffic on IPv4 loopback", () => {
    expect(resolveE2eApiOrigin({ e2eApiUrl: "http://localhost:3001" }))
      .toBe("http://127.0.0.1:3001");
    expect(resolveE2eApiOrigin({}))
      .toBe("http://127.0.0.1:3001");
  });

  test("retains HTTPS host identity and rejects non-origin values", () => {
    expect(resolveE2eApiOrigin({ e2eApiUrl: "https://localhost:8443" }))
      .toBe("https://localhost:8443");
    expect(() => resolveE2eApiOrigin({ e2eApiUrl: "file:///tmp/api" }))
      .toThrow(/HTTP\(S\)/);
    expect(() => resolveE2eApiOrigin({ e2eApiUrl: "http://127.0.0.1:3101/v1" }))
      .toThrow(/bare HTTP\(S\) origin/);
  });
});
