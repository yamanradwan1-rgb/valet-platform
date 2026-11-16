import { randomUUID } from "node:crypto";

export interface AuthHttpResult {
  readonly body: Record<string, unknown> | undefined;
  readonly headers: Headers;
  readonly status: number;
}

export interface AuthRawHttpResult {
  readonly bytes: Uint8Array;
  readonly headers: Headers;
  readonly status: number;
}

export interface AuthRequestOptions {
  readonly authorization?: string;
  readonly body?: unknown;
  readonly contentType?: string;
  readonly cookie?: string;
  readonly method?: "GET" | "POST" | "PUT";
  readonly origin?: string;
}

function headersFor(options: AuthRequestOptions): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": options.contentType ?? "application/json",
    "X-Request-Id": randomUUID(),
  };
  if (options.origin !== undefined) headers.Origin = options.origin;
  if (options.cookie !== undefined) headers.Cookie = options.cookie;
  if (options.authorization !== undefined) {
    headers.Authorization = options.authorization;
  }
  return headers;
}

export async function requestAuth(
  baseUrl: string,
  path: string,
  options: AuthRequestOptions = {},
): Promise<AuthHttpResult> {
  const method = options.method ?? "POST";
  const response = await fetch(`${baseUrl}${path}`, {
    ...(method === "GET" ? {} : { body: JSON.stringify(options.body ?? {}) }),
    headers: headersFor(options),
    method,
  });
  const text = await response.text();
  return {
    body:
      text === "" ? undefined : (JSON.parse(text) as Record<string, unknown>),
    headers: response.headers,
    status: response.status,
  };
}

export async function requestAuthBytes(
  baseUrl: string,
  path: string,
  options: AuthRequestOptions = {},
): Promise<AuthRawHttpResult> {
  const method = options.method ?? "POST";
  const response = await fetch(`${baseUrl}${path}`, {
    ...(method === "GET" ? {} : { body: JSON.stringify(options.body ?? {}) }),
    headers: headersFor(options),
    method,
  });
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    headers: response.headers,
    status: response.status,
  };
}
