import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { ApiRequest } from "../src/common/http/api-request";
import { shapeValidGuestBearer } from "../src/modules/guest-access/guest-access-bearer";

function request(rawHeaders: string[]): ApiRequest {
  return { headers: {}, rawHeaders, socket: { remoteAddress: "127.0.0.1" } };
}

describe("guest bearer HTTP shape", () => {
  it("accepts exactly one canonical Bearer credential", () => {
    const token = randomBytes(32).toString("base64url");
    expect(
      shapeValidGuestBearer(
        request(["Authorization", `Bearer ${token}`]),
        `Bearer ${token}`,
      ),
    ).toBe(token);
  });

  it("rejects malformed, missing, duplicate, and odd raw header shapes", () => {
    const token = randomBytes(32).toString("base64url");
    expect(shapeValidGuestBearer(request([]), undefined)).toBeUndefined();
    expect(
      shapeValidGuestBearer(
        request(["Authorization", `Basic ${token}`]),
        `Basic ${token}`,
      ),
    ).toBeUndefined();
    expect(
      shapeValidGuestBearer(
        request([
          "Authorization",
          `Bearer ${token}`,
          "authorization",
          `Bearer ${token}`,
        ]),
        `Bearer ${token}`,
      ),
    ).toBeUndefined();
    expect(
      shapeValidGuestBearer(request(["Authorization"]), `Bearer ${token}`),
    ).toBeUndefined();
  });
});
