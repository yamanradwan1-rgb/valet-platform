import { describe, expect, it } from "vitest";

import { mapApiError } from "../../src/common/http/api-errors";

describe("Issue 300 bounded unavailable source responses", () => {
  it.each([
    "AUDIT_INVESTIGATION_SNAPSHOT_UNAVAILABLE",
    "AUDIT_INVESTIGATION_TIMELINE_UNAVAILABLE",
  ])("maps %s to a safe 503 without leaking internal details", (code) => {
    const error = Object.assign(new Error("db snapshot internals secret"), { code });
    const mapped = mapApiError(error);
    expect(mapped.code).toBe(code);
    expect(mapped.status).toBe(503);
    expect(mapped.message).toBe("Investigation history is temporarily unavailable.");
    expect(mapped.message).not.toContain("secret");
  });

  it("leaves other unexpected errors at generic 500", () => {
    const mapped = mapApiError(new Error("unknown query failure"));
    expect(mapped.status).toBe(500);
    expect(mapped.code).toBe("INTERNAL_ERROR");
    expect(mapped.message).not.toContain("query");
  });
});
