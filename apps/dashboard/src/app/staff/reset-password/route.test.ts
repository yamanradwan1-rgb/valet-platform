import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("Issue416 public reset document isolation", () => {
  it("serves a fresh standalone page with a hash-only CSP and no other scripts", async () => {
    const response = GET();
    const html = await response.text();
    const policy = response.headers.get("Content-Security-Policy") ?? "";
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(response.headers.get("Content-Type")).toContain("text/html");
    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain("connect-src 'self'");
    expect(policy).toContain("form-action 'none'");
    expect(policy).not.toContain("unsafe-inline");
    expect(policy).not.toContain("unsafe-eval");
    expect((html.match(/<script\b/g) ?? []).length).toBe(1);
    expect(html).not.toContain("__NEXT_DATA__");
    expect(html).not.toContain("StaffAuthProvider");
    expect(html).not.toContain("<link ");
    expect(html.indexOf("history.replaceState")).toBeLessThan(html.indexOf("<style>"));
    expect(html.indexOf("history.replaceState")).toBeLessThan(html.indexOf("<body>"));
    expect(html).toContain("/v1/staff/auth/password-resets/redeem");
  });
});
