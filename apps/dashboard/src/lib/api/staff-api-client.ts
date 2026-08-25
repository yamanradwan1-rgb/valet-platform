import {
  emptyRequestSchema,
  staffAuthAccessResponseSchema,
  staffLoginRequestSchema,
  type StaffAuthAccessResponse,
  type StaffLoginRequest,
} from "@valet/contracts";

import { getStaffApiBaseUrl } from "./api-config";
import {
  DashboardApiError,
  mapDashboardApiError,
  mapNetworkError,
} from "./api-error";

interface RequestOptions {
  readonly method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE" | undefined;
  readonly body?: unknown;
  readonly signal?: AbortSignal | undefined;
  /**
   * When true the request is sent without a bearer token (auth endpoints).
   */
  readonly skipAuthorization?: boolean | undefined;
}

type UnauthorizedRecovery = () => Promise<string | null>;

function parseJsonBody(text: string): unknown {
  if (text.length === 0) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Central authenticated transport for the Management Dashboard.
 *
 * Responsibilities kept here (and only here):
 * - base URL resolution and JSON encoding
 * - bearer token injection from the current session
 * - one automatic retry after a session refresh when a data request hits 401
 * - backend error payload mapping into DashboardApiError
 *
 * Endpoint modules for later integration tasks should be added as focused
 * methods on focused clients that share this transport, never as ad-hoc
 * fetch calls inside page components.
 */
export class StaffApiClient {
  private readonly baseUrl: string;
  private getAccessToken: () => string | null;
  private recoverFromUnauthorized: UnauthorizedRecovery;

  constructor(options: {
    baseUrl?: string | undefined;
    getAccessToken: () => string | null;
    recoverFromUnauthorized: UnauthorizedRecovery;
  }) {
    this.baseUrl = options.baseUrl ?? getStaffApiBaseUrl();
    this.getAccessToken = options.getAccessToken;
    this.recoverFromUnauthorized = options.recoverFromUnauthorized;
  }

  setAccessTokenProvider(provider: () => string | null): void {
    this.getAccessToken = provider;
  }

  setUnauthorizedRecovery(recovery: UnauthorizedRecovery): void {
    this.recoverFromUnauthorized = recovery;
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    try {
      return await this.requestOnce<T>(path, options);
    } catch (error) {
      if (!(error instanceof DashboardApiError)) throw error;
      if (error.kind !== "session-expired") throw error;
      const token = await this.recoverFromUnauthorized();
      if (token === null) throw error;
      return this.requestOnce<T>(path, options);
    }
  }

  private async requestOnce<T>(
    path: string,
    options: RequestOptions,
  ): Promise<T> {
    const { method = "GET", body, signal, skipAuthorization } = options;
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (!skipAuthorization) {
      const token = this.getAccessToken();
      if (token !== null) {
        headers.Authorization = `Bearer ${token}`;
      }
    }
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }
    const init: RequestInit = { method, headers, cache: "no-store" };
    if (signal !== undefined) init.signal = signal;
    if (body !== undefined) init.body = JSON.stringify(body);

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, init);
    } catch (networkError: unknown) {
      if (signal?.aborted) throw networkError;
      throw mapNetworkError();
    }

    const payload = parseJsonBody(await response.text());
    if (!response.ok) {
      throw mapDashboardApiError(response.status, payload);
    }
    return payload as T;
  }

  async login(request: StaffLoginRequest): Promise<StaffAuthAccessResponse> {
    const parsedRequest = staffLoginRequestSchema.parse(request);
    const raw = await this.request<unknown>("/auth/login", {
      method: "POST",
      body: parsedRequest,
      skipAuthorization: true,
    });
    return staffAuthAccessResponseSchema.parse(raw);
  }

  async refresh(): Promise<StaffAuthAccessResponse> {
    emptyRequestSchema.parse({});
    const raw = await this.request<unknown>("/auth/refresh", {
      method: "POST",
      body: {},
      skipAuthorization: true,
    });
    return staffAuthAccessResponseSchema.parse(raw);
  }

  async logout(): Promise<void> {
    emptyRequestSchema.parse({});
    await this.request<null>("/auth/logout", {
      method: "POST",
      body: {},
      skipAuthorization: true,
    });
  }
}
