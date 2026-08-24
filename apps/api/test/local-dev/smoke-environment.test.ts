import { Buffer } from "node:buffer";

import { describe, expect, it, vi } from "vitest";

import { resolveSmokeChildEnvironments } from "../../tools/local-dev/smoke";

const SMOKE_SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function environmentWith(
  overrides: Record<string, string | undefined>,
): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "development",
    STAFF_AUTH_ALLOWED_ORIGINS: "https://staff.example.com",
    NEXT_PUBLIC_CUSTOMER_APP_ORIGIN: "https://customer.example.com",
    ...overrides,
  };
}

describe("smoke child environment resolution", () => {
  it("generates valid independent secrets for blank HMAC variables", () => {
    const resolved = resolveSmokeChildEnvironments(
      environmentWith({
        ANTI_ABUSE_HMAC_SECRET_B64URL: "",
        HANDOFF_VERIFIER_HMAC_SECRET_B64URL: undefined,
      }),
    );
    const antiAbuse = resolved.apiEnv.ANTI_ABUSE_HMAC_SECRET_B64URL ?? "";
    const handoff = resolved.apiEnv.HANDOFF_VERIFIER_HMAC_SECRET_B64URL ?? "";
    expect(antiAbuse).toMatch(SMOKE_SECRET_PATTERN);
    expect(handoff).toMatch(SMOKE_SECRET_PATTERN);
    expect(antiAbuse).not.toBe(handoff);
    expect(Buffer.from(antiAbuse, "base64url").length).toBe(32);
    expect(Buffer.from(handoff, "base64url").length).toBe(32);
  });

  it("preserves existing valid explicit local values", () => {
    const existingAntiAbuse = "A".repeat(43);
    const existingHandoff = "B".repeat(43);
    const resolved = resolveSmokeChildEnvironments(
      environmentWith({
        ANTI_ABUSE_HMAC_SECRET_B64URL: existingAntiAbuse,
        HANDOFF_VERIFIER_HMAC_SECRET_B64URL: existingHandoff,
      }),
    );
    expect(resolved.apiEnv.ANTI_ABUSE_HMAC_SECRET_B64URL).toBe(
      existingAntiAbuse,
    );
    expect(resolved.apiEnv.HANDOFF_VERIFIER_HMAC_SECRET_B64URL).toBe(
      existingHandoff,
    );
  });

  it("rejects malformed non-blank secrets instead of masking them", () => {
    expect(() =>
      resolveSmokeChildEnvironments(
        environmentWith({ ANTI_ABUSE_HMAC_SECRET_B64URL: "too-short" }),
      ),
    ).toThrow("ANTI_ABUSE_HMAC_SECRET_B64URL must be an unpadded base64url");
  });

  it("gives the API child only the localhost staff origin", () => {
    const resolved = resolveSmokeChildEnvironments(environmentWith({}));
    expect(resolved.apiEnv.STAFF_AUTH_ALLOWED_ORIGINS).toBe(
      "http://localhost:3000",
    );
    expect(resolved.apiEnv.STAFF_AUTH_ALLOWED_ORIGINS).not.toContain(
      "staff.example.com",
    );
    expect(resolved.apiEnv.PORT).toBe("3001");
  });

  it("gives the Employee child the localhost customer origin and API origin", () => {
    const resolved = resolveSmokeChildEnvironments(environmentWith({}));
    expect(resolved.employeeEnv.API_ORIGIN).toBe("http://localhost:3001");
    expect(resolved.employeeEnv.NEXT_PUBLIC_CUSTOMER_APP_ORIGIN).toBe(
      "http://localhost:3002",
    );
    expect(resolved.employeeEnv.NEXT_PUBLIC_CUSTOMER_APP_ORIGIN).not.toContain(
      "customer.example.com",
    );
  });

  it("gives the Customer child the localhost API origin", () => {
    const resolved = resolveSmokeChildEnvironments(environmentWith({}));
    expect(resolved.customerEnv.API_ORIGIN).toBe("http://localhost:3001");
  });

  it("keeps every child process in development", () => {
    const resolved = resolveSmokeChildEnvironments(
      environmentWith({ NODE_ENV: "production" }),
    );
    expect(resolved.apiEnv.NODE_ENV).toBe("development");
    expect(resolved.employeeEnv.NODE_ENV).toBe("development");
    expect(resolved.customerEnv.NODE_ENV).toBe("development");
  });

  it("never prints or persists the generated secrets", () => {
    const consoleSpies = [
      vi.spyOn(console, "log"),
      vi.spyOn(console, "info"),
      vi.spyOn(console, "warn"),
      vi.spyOn(console, "error"),
    ];
    const stdoutSpy = vi.spyOn(process.stdout, "write");
    const stderrSpy = vi.spyOn(process.stderr, "write");
    const environmentBefore = JSON.stringify(process.env);
    try {
      const resolved = resolveSmokeChildEnvironments(
        environmentWith({
          ANTI_ABUSE_HMAC_SECRET_B64URL: "",
          HANDOFF_VERIFIER_HMAC_SECRET_B64URL: "",
        }),
      );
      for (const spy of [...consoleSpies, stdoutSpy, stderrSpy]) {
        expect(spy).not.toHaveBeenCalled();
      }
      expect(JSON.stringify(process.env)).toBe(environmentBefore);
      expect(
        resolved.employeeEnv.ANTI_ABUSE_HMAC_SECRET_B64URL ?? "",
      ).not.toMatch(SMOKE_SECRET_PATTERN);
      expect(
        resolved.employeeEnv.HANDOFF_VERIFIER_HMAC_SECRET_B64URL ?? "",
      ).not.toMatch(SMOKE_SECRET_PATTERN);
      expect(
        resolved.customerEnv.ANTI_ABUSE_HMAC_SECRET_B64URL ?? "",
      ).not.toMatch(SMOKE_SECRET_PATTERN);
      expect(
        resolved.customerEnv.HANDOFF_VERIFIER_HMAC_SECRET_B64URL ?? "",
      ).not.toMatch(SMOKE_SECRET_PATTERN);
    } finally {
      for (const spy of [...consoleSpies, stdoutSpy, stderrSpy]) {
        spy.mockRestore();
      }
    }
  });
});
