import {
  EmployeeApiError,
  normalizeEmployeeApiError,
} from "./employee-api-errors";
import type { StaffAuthClient } from "../auth/staff-auth-client";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD";

export interface EmployeeRequestOptions {
  readonly body?: unknown | undefined;
  readonly headers?: Record<string, string> | undefined;
  readonly method?: HttpMethod | undefined;
  readonly params?:
    | Record<string, string | number | boolean | undefined | null>
    | undefined;
  readonly requireAuth?: boolean | undefined;
  readonly signal?: AbortSignal | undefined;
  readonly skipProactiveRefresh?: boolean | undefined;
}

export interface EmployeeApiClientOptions {
  readonly authClient: StaffAuthClient;
  readonly baseUrl?: string | undefined;
  readonly onAuthorizationLoss?: (() => void) | undefined;
}

export class EmployeeApiClient {
  private readonly authClient: StaffAuthClient;
  private readonly baseUrl: string;
  private readonly onAuthorizationLoss?: (() => void) | undefined;

  constructor(options: EmployeeApiClientOptions) {
    this.authClient = options.authClient;
    this.baseUrl = options.baseUrl ?? "";
    this.onAuthorizationLoss = options.onAuthorizationLoss;
  }

  async request<T>(
    path: string,
    options: EmployeeRequestOptions = {},
  ): Promise<T> {
    return this.executeRequest<T>(path, options, false);
  }

  private async executeRequest<T>(
    path: string,
    options: EmployeeRequestOptions,
    isRetry: boolean,
  ): Promise<T> {
    const {
      method = "GET",
      body,
      params,
      headers: customHeaders = {},
      signal,
      requireAuth = true,
      skipProactiveRefresh = false,
    } = options;

    let token: string | null = null;

    if (requireAuth) {
      if (!skipProactiveRefresh) {
        token = await this.authClient.ensureFreshToken(60, signal);
      } else {
        token = this.authClient.getAccessToken();
      }

      if (!token) {
        this.onAuthorizationLoss?.();
        throw new EmployeeApiError({
          code: "STAFF_AUTHENTICATION_REQUIRED",
          message: "Staff authentication required.",
          status: 401,
        });
      }
    }

    const url = this.buildUrl(path, params);

    const headers: Record<string, string> = {
      Accept: "application/json",
      ...customHeaders,
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const fetchInit: RequestInit = {
      cache: "no-store",
      credentials: "include",
      headers,
      method,
    };

    if (signal !== undefined) {
      fetchInit.signal = signal;
    }

    if (body !== undefined) {
      fetchInit.body = JSON.stringify(body);
    }

    let response: Response;
    try {
      response = await fetch(url, fetchInit);
    } catch (networkError: unknown) {
      if (signal?.aborted) {
        throw networkError;
      }
      throw new EmployeeApiError({
        code: "NETWORK_ERROR",
        isNetworkError: true,
        message:
          "Network connection unavailable. Please check your internet connection.",
        status: 0,
      });
    }

    const payload = await this.parseJsonPayload(response);

    if (!response.ok) {
      const isReadMethod = method === "GET" || method === "HEAD";
      if (response.status === 401 && isReadMethod && !isRetry && requireAuth) {
        try {
          await this.authClient.refresh(signal);
          return await this.executeRequest<T>(path, options, true);
        } catch {
          this.onAuthorizationLoss?.();
        }
      } else if (response.status === 401 || response.status === 403) {
        this.onAuthorizationLoss?.();
      }

      throw normalizeEmployeeApiError(response.status, payload);
    }

    return payload as T;
  }

  private buildUrl(
    path: string,
    params?: Record<string, string | number | boolean | undefined | null>,
  ): string {
    const fullPath = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    if (!params) return fullPath;

    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    }

    const query = searchParams.toString();
    return query ? `${fullPath}?${query}` : fullPath;
  }

  private async parseJsonPayload(response: Response): Promise<unknown> {
    const text = await response.text();
    if (text.length === 0) return {};
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
}
