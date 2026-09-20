import type { StaffAuthAccessResponse } from "@valet/contracts";

import {
  DashboardApiError,
  dashboardApiErrorFromResponse,
  dashboardAuthBoundaryError,
  dashboardMalformedError,
  dashboardNetworkError,
} from "./dashboard-api-error";

export interface RuntimeSchema<T> {
  safeParse(input: unknown):
    | { readonly success: true; readonly data: T }
    | { readonly success: false; readonly error?: unknown };
}

interface DashboardAuthProvider {
  getAccessToken(): string | null;
  getIdentityGeneration(): number;
  getSessionGeneration(): number;
  isTokenFresh(bufferSeconds?: number): boolean;
  refresh(signal?: AbortSignal): Promise<StaffAuthAccessResponse>;
}

export interface DashboardApiRequestOptions {
  readonly method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  readonly body?: unknown;
  readonly query?: Readonly<Record<string, string | number | boolean | null | undefined>>;
  readonly signal?: AbortSignal | undefined;
  readonly requireAuth?: boolean;
}

interface DashboardApiClientOptions {
  readonly auth: DashboardAuthProvider;
  readonly baseUrl?: string;
  readonly fetch?: typeof globalThis.fetch;
}

export class DashboardApiClient {
  private readonly auth: DashboardAuthProvider;
  private readonly baseUrl: string;
  private readonly fetcher: typeof globalThis.fetch;

  constructor(options: DashboardApiClientOptions) {
    this.auth = options.auth;
    this.baseUrl = options.baseUrl ?? "";
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async request<T>(
    path: string,
    schema: RuntimeSchema<T>,
    options: DashboardApiRequestOptions = {},
  ): Promise<T> {
    const method = options.method ?? "GET";
    const requireAuth = options.requireAuth ?? true;
    let identityFence = this.auth.getIdentityGeneration();
    let sessionFence = this.auth.getSessionGeneration();
    let refreshUsed = false;

    if (requireAuth && (!this.auth.getAccessToken() || !this.auth.isTokenFresh())) {
      await this.refreshOrThrow(options.signal);
      refreshUsed = true;
      identityFence = this.auth.getIdentityGeneration();
      sessionFence = this.auth.getSessionGeneration();
    }

    let response = await this.execute(path, method, options, requireAuth);
    if (
      response.status === 401 &&
      requireAuth &&
      method === "GET" &&
      !refreshUsed &&
      identityFence === this.auth.getIdentityGeneration() &&
      sessionFence === this.auth.getSessionGeneration()
    ) {
      await this.refreshOrThrow(options.signal);
      refreshUsed = true;
      identityFence = this.auth.getIdentityGeneration();
      sessionFence = this.auth.getSessionGeneration();
      response = await this.execute(path, method, options, requireAuth);
    }

    if (
      requireAuth &&
      (identityFence !== this.auth.getIdentityGeneration() ||
        sessionFence !== this.auth.getSessionGeneration())
    ) {
      throw dashboardAuthBoundaryError();
    }
    if (!response.ok) throw dashboardApiErrorFromResponse(response.status, response.payload);
    if (!response.jsonValid) throw dashboardMalformedError();
    const parsed = schema.safeParse(response.payload);
    if (!parsed.success) throw dashboardMalformedError(parsed.error);
    return parsed.data;
  }

  private async refreshOrThrow(signal?: AbortSignal): Promise<void> {
    try {
      await this.auth.refresh(signal);
    } catch (error: unknown) {
      if (
        typeof error === "object" &&
        error !== null &&
        "apiError" in error &&
        (error as { apiError?: unknown }).apiError instanceof DashboardApiError
      ) {
        throw (error as { apiError: DashboardApiError }).apiError;
      }
      if (error instanceof DashboardApiError) throw error;
      throw dashboardNetworkError(error);
    }
  }

  private async execute(
    path: string,
    method: NonNullable<DashboardApiRequestOptions["method"]>,
    options: DashboardApiRequestOptions,
    requireAuth: boolean,
  ): Promise<{
    readonly ok: boolean;
    readonly status: number;
    readonly payload: unknown;
    readonly jsonValid: boolean;
  }> {
    const headers: Record<string, string> = { Accept: "application/json" };
    const token = requireAuth ? this.auth.getAccessToken() : null;
    if (token !== null) headers.Authorization = `Bearer ${token}`;
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    let response: Response;
    try {
      response = await this.fetcher(this.buildUrl(path, options.query), {
        method,
        headers,
        cache: "no-store",
        credentials: "include",
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      });
    } catch (error: unknown) {
      if (options.signal?.aborted) throw options.signal.reason ?? error;
      throw dashboardNetworkError(error);
    }
    const text = await response.text();
    if (text.length === 0) {
      return { ok: response.ok, status: response.status, payload: null, jsonValid: true };
    }
    try {
      return { ok: response.ok, status: response.status, payload: JSON.parse(text), jsonValid: true };
    } catch {
      return { ok: response.ok, status: response.status, payload: text, jsonValid: false };
    }
  }

  private buildUrl(
    path: string,
    query?: DashboardApiRequestOptions["query"],
  ): string {
    const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    if (query === undefined) return url;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) params.append(key, String(value));
    }
    const encoded = params.toString();
    return encoded.length === 0 ? url : `${url}?${encoded}`;
  }
}
