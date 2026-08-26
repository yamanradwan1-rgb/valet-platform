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

interface BinaryRequestOptions {
  readonly method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE" | undefined;
  readonly body?: unknown;
  readonly signal?: AbortSignal | undefined;
}

/**
 * Backend-produced binary artifact (e.g. a report CSV/PDF export). Bytes are
 * opaque to the transport; content-type policing and safe download naming
 * stay with the calling feature module.
 */
export interface StaffApiBinaryResponse {
  readonly contentType: string | null;
  readonly contentDisposition: string | null;
  readonly bytes: Uint8Array;
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
 * - authenticated binary artifact transport (`requestBinary`) with the exact
 *   same auth/recovery model; API errors stay JSON errors and are never
 *   returned as downloadable bytes
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
    const send = (): Promise<T> => this.requestOnce<T>(path, options);
    // Auth boundary endpoints own their own 401s: refresh()'s rejection is
    // the provider's authoritative decision INPUT, and a login/logout 401
    // must surface verbatim — routing them through unauthorized recovery
    // would re-enter the very single-flight refresh whose request failed
    // (a promise cycle that never settles) or nest-acquire the held auth
    // mutation Web Lock on invalid credentials.
    if (options.skipAuthorization === true) return send();
    return this.runWithUnauthorizedRecovery(send);
  }

  /**
   * Authenticated binary transport for backend-produced artifacts.
   *
   * Shares the JSON path's exact auth semantics: bearer injection from the
   * current session, at most one retry after a successful unauthorized
   * recovery, and non-2xx responses parsed into DashboardApiError so API
   * errors can never masquerade as downloadable files. A successful response
   * is returned as raw bytes plus its Content-Type / Content-Disposition
   * headers; validating them against the expected artifact family is the
   * caller's (feature's) contract responsibility.
   */
  async requestBinary(
    path: string,
    options: BinaryRequestOptions = {},
  ): Promise<StaffApiBinaryResponse> {
    return this.runWithUnauthorizedRecovery(() =>
      this.requestBinaryOnce(path, options),
    );
  }

  private async runWithUnauthorizedRecovery<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (!(error instanceof DashboardApiError)) throw error;
      if (error.kind !== "session-expired") throw error;
      const token = await this.recoverFromUnauthorized();
      if (token === null) {
        // Recovery resolved "do not retry" for exactly one of two reasons:
        // - AUTHORITATIVE END: the runtime session was torn down; surface
        //   the original expiry so shells reach the expired posture.
        // - TRANSIENT REFRESH FAILURE with the session still LIVE
        //   ("retry-later"): rethrowing the stale 401 would fake "session
        //   expired" copy and strand surfaces on restoring skeletons that
        //   no redirect will ever resolve; an honestly retryable server
        //   failure keeps manual retry working until the scheduled
        //   near-term refresh succeeds.
        if (this.getAccessToken() === null) throw error;
        throw new DashboardApiError({
          kind: "server",
          status: 0,
          code: "SESSION_RECOVERY_RETRY_SCHEDULED",
          message: "Session recovery is retrying; please try again.",
        });
      }
      return operation();
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

  private async requestBinaryOnce(
    path: string,
    options: BinaryRequestOptions,
  ): Promise<StaffApiBinaryResponse> {
    const { method = "GET", body, signal } = options;
    // Binary requests advertise exactly the artifact families this dashboard
    // consumes; the server still answers errors as JSON on failure statuses.
    const headers: Record<string, string> = {
      Accept: "text/csv, application/pdf",
    };
    const token = this.getAccessToken();
    if (token !== null) {
      headers.Authorization = `Bearer ${token}`;
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

    if (!response.ok) {
      const payload = parseJsonBody(await response.text());
      throw mapDashboardApiError(response.status, payload);
    }
    const contentType = response.headers.get("content-type");
    if (contentType !== null && /(?:json|html|xml)\b/iu.test(contentType)) {
      // A 2xx answer that is a document instead of an artifact is contract
      // drift; it must surface as an error, never become a downloaded file.
      throw new DashboardApiError({
        kind: "server",
        status: response.status,
        code: "BINARY_RESPONSE_CONTENT_TYPE_INVALID",
        message: "The server did not return a downloadable artifact.",
      });
    }
    return {
      bytes: new Uint8Array(await response.arrayBuffer()),
      contentDisposition: response.headers.get("content-disposition"),
      contentType,
    };
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
