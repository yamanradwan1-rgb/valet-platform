import { describe, expect, it } from "vitest";

import {
  RequestIdMiddleware,
  resolveRequestId,
} from "../src/common/http/api-request";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function headers(value: string | string[] | undefined): {
  [key: string]: string | string[] | undefined;
} {
  return { "x-request-id": value };
}

describe("resolveRequestId", () => {
  it("passes a valid bounded request id through unchanged", () => {
    expect(
      resolveRequestId(headers("req-abc_123.45-67890123456789012345")),
    ).toBe("req-abc_123.45-67890123456789012345");
  });

  it("accepts the full 128-character bound and rejects one more character", () => {
    const exact = "a".repeat(128);
    const tooLong = "a".repeat(129);
    expect(resolveRequestId(headers(exact))).toBe(exact);
    expect(resolveRequestId(headers(tooLong))).toMatch(uuidPattern);
  });

  it("replaces ids containing spaces with a generated uuid", () => {
    expect(resolveRequestId(headers("req 123"))).toMatch(uuidPattern);
  });

  it("replaces ids with unicode or non-allowed punctuation", () => {
    for (const candidate of ["طلب-123", "req/123", "req@123", "req:123"]) {
      expect(resolveRequestId(headers(candidate))).toMatch(uuidPattern);
    }
  });

  it("replaces ids carrying control characters and injection payloads", () => {
    const candidates = [
      "req\r\nInjected-Header: 1",
      "req\nX-Forwarded-For: 10.0.0.1",
      "req\u001b[31mred",
      "req\u0000null",
      "../..",
      "../../../etc/passwd",
      "req\tid",
      "id; DROP TABLE sessions;--",
    ];
    for (const candidate of candidates) {
      expect(resolveRequestId(headers(candidate))).toMatch(uuidPattern);
    }
  });

  it("replaces missing, array-valued and empty ids with a generated uuid", () => {
    expect(resolveRequestId({})).toMatch(uuidPattern);
    expect(resolveRequestId(headers(undefined))).toMatch(uuidPattern);
    expect(resolveRequestId(headers(["req-123", "req-456"]))).toMatch(
      uuidPattern,
    );
    expect(resolveRequestId(headers(""))).toMatch(uuidPattern);
  });

  it("generates distinct uuids across rejected candidates", () => {
    const first = resolveRequestId(headers("bad id"));
    const second = resolveRequestId(headers("another bad id"));
    expect(first).not.toBe(second);
  });
});

describe("RequestIdMiddleware", () => {
  function fakeExchange(incoming: string | string[] | undefined) {
    const request: {
      headers: { "x-request-id"?: string | string[] };
      requestId?: string;
    } = { headers: headers(incoming) };
    const setHeaders: Record<string, string> = {};
    const response = {
      setHeader(name: string, value: string) {
        setHeaders[name] = value;
      },
    };
    return { request, response, setHeaders };
  }

  function run(incoming: string | string[] | undefined) {
    const { request, response, setHeaders } = fakeExchange(incoming);
    let nextCalled = false;
    new RequestIdMiddleware().use(request, response, () => {
      nextCalled = true;
    });
    return { request, setHeaders, nextCalled };
  }

  it("keeps a valid incoming id on the request and the response header", () => {
    const { request, setHeaders, nextCalled } = run("req-valid-1");

    expect(request.requestId).toBe("req-valid-1");
    expect(setHeaders["X-Request-Id"]).toBe("req-valid-1");
    expect(nextCalled).toBe(true);
  });

  it("replaces an invalid incoming id on both request and response header", () => {
    const { request, setHeaders, nextCalled } = run("bad id\u001b[31m");

    expect(request.requestId).toMatch(uuidPattern);
    expect(request.requestId).not.toBe("bad id\u001b[31m");
    expect(setHeaders["X-Request-Id"]).toBe(request.requestId);
    expect(nextCalled).toBe(true);
  });

  it("sets the same generated uuid on request and response for missing ids", () => {
    const { request, setHeaders } = run(undefined);

    expect(request.requestId).toMatch(uuidPattern);
    expect(setHeaders["X-Request-Id"]).toBe(request.requestId);
  });

  it("reflects the exact 128-character valid bound end to end", () => {
    const exact = "z".repeat(128);
    const { request, setHeaders } = run(exact);

    expect(request.requestId).toBe(exact);
    expect(setHeaders["X-Request-Id"]).toBe(exact);
  });
});
