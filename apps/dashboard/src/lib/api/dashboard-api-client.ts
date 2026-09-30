import type { StaffAuthAccessResponse } from "@valet/contracts";

import {
  DashboardApiError,
  dashboardApiErrorFromResponse,
  dashboardAuthBoundaryError,
  dashboardMalformedError,
  dashboardMutationRetryRequiredError,
  dashboardNetworkError,
} from "./dashboard-api-error";
import { parseDashboardBinaryHeaders } from "./dashboard-binary-response";
import type {
  DashboardApiRequestOptions,
  DashboardBinaryRequestOptions,
  DashboardBinaryResponse,
  RuntimeSchema,
} from "./dashboard-api-types";

export type {
  DashboardApiRequestOptions,
  DashboardBinaryRequestOptions,
  DashboardBinaryResponse,
  RuntimeSchema,
} from "./dashboard-api-types";

interface DashboardAuthProvider {
  getAccessToken(): string | null;
  getIdentityGeneration(): number;
  getSessionGeneration(): number;
  isTokenFresh(bufferSeconds?: number): boolean;
  refresh(signal?: AbortSignal): Promise<StaffAuthAccessResponse>;
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
      options.onAuthReconciled?.({
        identityGeneration: identityFence,
        sessionGeneration: sessionFence,
      });
    }

    let response = await this.execute(path, method, options, requireAuth);
    if (response.status === 401 && requireAuth) {
      const fenceIsCurrent =
        identityFence === this.auth.getIdentityGeneration() &&
        sessionFence === this.auth.getSessionGeneration();
      if (method === "GET" && !refreshUsed && fenceIsCurrent) {
        await this.refreshOrThrow(options.signal);
        refreshUsed = true;
        identityFence = this.auth.getIdentityGeneration();
        sessionFence = this.auth.getSessionGeneration();
        options.onAuthReconciled?.({
          identityGeneration: identityFence,
          sessionGeneration: sessionFence,
        });
        response = await this.execute(path, method, options, requireAuth);
      } else if (method !== "GET" && fenceIsCurrent) {
        const rejectedMutation = dashboardApiErrorFromResponse(
          response.status,
          response.payload,
        );
        await this.refreshOrThrow(options.signal);
        options.onAuthReconciled?.({
          identityGeneration: this.auth.getIdentityGeneration(),
          sessionGeneration: this.auth.getSessionGeneration(),
        });
        throw dashboardMutationRetryRequiredError(rejectedMutation);
      }
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

  async requestBinary(
    path: string,
    options: DashboardBinaryRequestOptions,
  ): Promise<DashboardBinaryResponse> {
    if (!this.auth.getAccessToken() || !this.auth.isTokenFresh()) {
      await this.refreshOrThrow(options.signal);
    }
    if (options.signal?.aborted) {
      throw options.signal.reason ?? dashboardNetworkError();
    }
    const identityFence = this.auth.getIdentityGeneration();
    const sessionFence = this.auth.getSessionGeneration();
    const headers: Record<string, string> = {
      Accept: options.expectedContentType,
      "Content-Type": "application/json",
    };
    const token = this.auth.getAccessToken();
    if (token !== null) headers.Authorization = `Bearer ${token}`;

    let response: Response;
    try {
      response = await this.fetcher(this.buildUrl(path), {
        method: "POST",
        headers,
        body: JSON.stringify(options.body),
        cache: "no-store",
        credentials: "include",
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      });
    } catch (error: unknown) {
      throw new DashboardApiError({
        kind: "network",
        code: "BINARY_POST_OUTCOME_UNKNOWN",
        message: "The binary request outcome is unknown.",
        cause: error,
      });
    }

    if (response.status === 401) {
      const rejected = await this.binaryError(response);
      const fenceIsCurrent =
        identityFence === this.auth.getIdentityGeneration() &&
        sessionFence === this.auth.getSessionGeneration();
      if (fenceIsCurrent) {
        await this.refreshOrThrow(options.signal);
        throw dashboardMutationRetryRequiredError(rejected);
      }
      throw dashboardAuthBoundaryError();
    }
    if (
      identityFence !== this.auth.getIdentityGeneration() ||
      sessionFence !== this.auth.getSessionGeneration()
    ) {
      throw dashboardAuthBoundaryError();
    }
    if (response.status !== 200) {
      if (response.ok) throw dashboardMalformedError();
      throw await this.binaryError(response);
    }

    const { contentType, filename } = parseDashboardBinaryHeaders(
      response.headers,
      options.expectedContentType,
    );
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await response.arrayBuffer());
    } catch (error: unknown) {
      throw new DashboardApiError({
        kind: "network",
        code: "BINARY_POST_OUTCOME_UNKNOWN",
        message: "The binary request outcome is unknown.",
        cause: error,
      });
    }
    if (
      identityFence !== this.auth.getIdentityGeneration() ||
      sessionFence !== this.auth.getSessionGeneration()
    ) {
      throw dashboardAuthBoundaryError();
    }
    return { bytes, contentType, filename };
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

  private async binaryError(response: Response): Promise<DashboardApiError> {
    let text: string;
    try {
      text = await response.text();
    } catch (error: unknown) {
      throw new DashboardApiError({
        kind: "network",
        code: "BINARY_POST_OUTCOME_UNKNOWN",
        message: "The binary request outcome is unknown.",
        cause: error,
      });
    }
    if (text.length === 0) return dashboardApiErrorFromResponse(response.status, null);
    try {
      return dashboardApiErrorFromResponse(response.status, JSON.parse(text));
    } catch {
      throw dashboardMalformedError();
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
    let text: string;
    try {
      text = await response.text();
    } catch (error: unknown) {
      if (options.signal?.aborted) throw options.signal.reason ?? error;
      throw dashboardNetworkError(error);
    }
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
