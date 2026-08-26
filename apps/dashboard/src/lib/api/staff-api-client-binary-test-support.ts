import { afterEach, vi } from "vitest";

import { StaffApiClient } from "./staff-api-client";

/**
 * Shared stubs for the binary transport suites. Plain-object responses keep
 * these tests runnable in node-env vitest (no fetch polyfill/DOM needed).
 */

export const BASE = "http://test-api/v1/staff";
export const VALID_TOKEN = `vsa1.${"A".repeat(43)}`;

export interface RecordedCall {
  readonly path: string;
  readonly init: RequestInit;
}

type FetchStub = (path: string, init?: RequestInit) => unknown;

export function stubFetch(handler: FetchStub): { calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((path: string, init?: RequestInit) => {
      calls.push({ init: init ?? {}, path });
      return handler(path, init);
    }),
  );
  return { calls };
}

export function binaryResponse(options: {
  status?: number;
  contentType?: string | null;
  contentDisposition?: string | null;
  body?: Uint8Array | string;
}): Response {
  const headers = new Map<string, string>();
  if (options.contentType !== undefined && options.contentType !== null) {
    headers.set("content-type", options.contentType);
  }
  if (
    options.contentDisposition !== undefined &&
    options.contentDisposition !== null
  ) {
    headers.set("content-disposition", options.contentDisposition);
  }
  const status = options.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => headers.get(name.toLowerCase()) ?? null,
    },
    arrayBuffer: async () =>
      options.body === undefined
        ? new ArrayBuffer(0)
        : typeof options.body === "string"
          ? new TextEncoder().encode(options.body).buffer as ArrayBuffer
          : options.body.slice().buffer as ArrayBuffer,
    text: async () =>
      typeof options.body === "string" ? options.body : "",
  } as unknown as Response;
}

export function jsonResponse(status: number, body: unknown): Response {
  return binaryResponse({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

interface ClientHarness {
  client: StaffApiClient;
  recoveryCalls: unknown[];
}

/**
 * Mirrors the real runtime: a successful recovery stores a fresh token so
 * subsequent provider reads observe the rotation.
 */
export function makeClient(options?: {
  token?: string | null;
  recover?: () => Promise<string | null>;
}): ClientHarness {
  const recoveryCalls: unknown[] = [];
  let currentToken: string | null = options?.token ?? null;
  const client = new StaffApiClient({
    baseUrl: BASE,
    getAccessToken: () => currentToken,
    recoverFromUnauthorized: async () => {
      recoveryCalls.push("recovery-requested");
      if (options?.recover === undefined) return null;
      const token = await options.recover();
      currentToken = token;
      return token;
    },
  });
  return { client, recoveryCalls };
}

export async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    return await promise;
  } catch (error) {
    return error;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

export const CSV_BYTES = new Uint8Array([1, 2, 3]);
export const PDF_BYTES = new Uint8Array([37, 80, 68, 70]);
