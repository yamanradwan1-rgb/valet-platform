import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("Issue416 public reset document isolation", () => {
  it("keeps the public reset document disabled until separately approved", async () => {
    const response = GET();
    const html = await response.text();
    const policy = response.headers.get("Content-Security-Policy") ?? "";
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(policy).toContain("default-src 'none'");
    expect(policy).not.toContain("unsafe-inline");
    expect(policy).not.toContain("unsafe-eval");
    expect(response.headers.get("X-Robots-Tag")).toContain("noindex");
    expect(html).toBe("");
  });
});
