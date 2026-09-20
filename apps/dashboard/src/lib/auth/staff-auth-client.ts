import {
  staffAuthAccessResponseSchema,
  staffLoginRequestSchema,
  type StaffAuthAccessResponse,
  type StaffLoginRequest,
} from "@valet/contracts";

import {
  DashboardApiError,
  dashboardApiErrorFromResponse,
  dashboardAuthBoundaryError,
  dashboardMalformedError,
  dashboardNetworkError,
} from "../api/dashboard-api-error";

export type StaffAuthSession = StaffAuthAccessResponse;
export type StaffRefreshFailureKind = "definitive" | "transient";

const STAFF_LOGOUT_UNCONFIRMED_KEY = "vaylet_staff_logout_unconfirmed";

export class StaffAuthRefreshError extends Error {
  constructor(
    readonly kind: StaffRefreshFailureKind,
    readonly apiError: DashboardApiError,
  ) {
    super(apiError.message);
    this.name = "StaffAuthRefreshError";
  }
}

interface StaffAuthClientOptions {
  readonly baseUrl?: string;
  readonly fetch?: typeof globalThis.fetch;
}

type SessionListener = (
  session: StaffAuthSession | null,
  sessionGeneration: number,
  identityGeneration: number,
) => void;

export class StaffAuthClient {
  private readonly baseUrl: string;
  private readonly fetcher: typeof globalThis.fetch;
  private session: StaffAuthSession | null = null;
  private sessionGeneration = 0;
  private identityGeneration = 0;
  private logoutUnconfirmed = false;
  private refreshPromise: Promise<StaffAuthAccessResponse> | null = null;
  private readonly listeners = new Set<SessionListener>();

  constructor(options: StaffAuthClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? "";
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  getSession(): StaffAuthSession | null {
    return this.session;
  }

  getAccessToken(): string | null {
    return this.session?.accessToken ?? null;
  }

  getSessionGeneration(): number {
    return this.sessionGeneration;
  }

  getIdentityGeneration(): number {
    return this.identityGeneration;
  }

  hasUnconfirmedLogout(): boolean {
    if (this.logoutUnconfirmed) return true;
    try {
      return globalThis.localStorage?.getItem(STAFF_LOGOUT_UNCONFIRMED_KEY) === "1";
    } catch {
      return false;
    }
  }

  isTokenFresh(bufferSeconds = 30): boolean {
    if (this.session === null) return false;
    return Date.parse(this.session.accessExpiresAt) - Date.now() > bufferSeconds * 1000;
  }

  subscribe(listener: SessionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async login(
    credentials: StaffLoginRequest,
    signal?: AbortSignal,
  ): Promise<StaffAuthAccessResponse> {
    const body = staffLoginRequestSchema.parse(credentials);
    const identityFence = this.identityGeneration;
    const response = await this.fetchJson("/v1/staff/auth/login", body, signal);
    if (!response.ok) throw dashboardApiErrorFromResponse(response.status, response.payload);
    const parsed = staffAuthAccessResponseSchema.safeParse(response.payload);
    if (!parsed.success) throw dashboardMalformedError(parsed.error);
    if (identityFence !== this.identityGeneration) throw dashboardAuthBoundaryError();
    this.clearLogoutUnconfirmed();
    this.applySession(parsed.data, true);
    return parsed.data;
  }

  refresh(signal?: AbortSignal): Promise<StaffAuthAccessResponse> {
    if (signal?.aborted) return Promise.reject(abortReason(signal));
    if (this.refreshPromise === null) {
      const identityFence = this.identityGeneration;
      const active = this.performRefresh(identityFence);
      const shared = active.finally(() => {
        if (this.refreshPromise === shared) this.refreshPromise = null;
      });
      this.refreshPromise = shared;
    }
    return signal === undefined
      ? this.refreshPromise
      : awaitWithAbort(this.refreshPromise, signal);
  }

  async logout(signal?: AbortSignal): Promise<void> {
    this.markLogoutUnconfirmed();
    this.clearIdentityBoundary();
    const response = await this.fetchJson("/v1/staff/auth/logout", {}, signal);
    if (!response.ok) throw dashboardApiErrorFromResponse(response.status, response.payload);
    this.clearLogoutUnconfirmed();
  }

  private async performRefresh(identityFence: number): Promise<StaffAuthAccessResponse> {
    try {
      const response = await this.fetchJson("/v1/staff/auth/refresh", {});
      if (!response.ok) {
        const apiError = dashboardApiErrorFromResponse(response.status, response.payload);
        const kind: StaffRefreshFailureKind = apiError.kind === "auth" ? "definitive" : "transient";
        if (kind === "definitive" && identityFence === this.identityGeneration) {
          this.clearIdentityBoundary();
        }
        throw new StaffAuthRefreshError(kind, apiError);
      }
      const parsed = staffAuthAccessResponseSchema.safeParse(response.payload);
      if (!parsed.success) {
        throw new StaffAuthRefreshError("transient", dashboardMalformedError(parsed.error));
      }
      if (identityFence !== this.identityGeneration) {
        throw new StaffAuthRefreshError("definitive", dashboardAuthBoundaryError());
      }
      this.applySession(parsed.data, this.session === null);
      return parsed.data;
    } catch (error: unknown) {
      if (error instanceof StaffAuthRefreshError) throw error;
      const apiError = error instanceof DashboardApiError ? error : dashboardNetworkError(error);
      throw new StaffAuthRefreshError("transient", apiError);
    }
  }

  private async fetchJson(
    path: string,
    body: unknown,
    signal?: AbortSignal,
  ): Promise<{ readonly ok: boolean; readonly status: number; readonly payload: unknown }> {
    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
        credentials: "include",
        ...(signal === undefined ? {} : { signal }),
      });
    } catch (error: unknown) {
      if (signal?.aborted) throw abortReason(signal);
      throw dashboardNetworkError(error);
    }
    const text = await response.text();
    let payload: unknown = {};
    if (text.length > 0) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }
    return { ok: response.ok, status: response.status, payload };
  }

  private applySession(session: StaffAuthSession, identityChanged: boolean): void {
    this.session = session;
    this.sessionGeneration += 1;
    if (identityChanged) this.identityGeneration += 1;
    this.emit();
  }

  private clearIdentityBoundary(): void {
    this.session = null;
    this.sessionGeneration += 1;
    this.identityGeneration += 1;
    this.emit();
  }

  private markLogoutUnconfirmed(): void {
    this.logoutUnconfirmed = true;
    try {
      globalThis.localStorage?.setItem(STAFF_LOGOUT_UNCONFIRMED_KEY, "1");
    } catch {
      // The in-memory marker still keeps this runtime fail-closed.
    }
  }

  private clearLogoutUnconfirmed(): void {
    this.logoutUnconfirmed = false;
    try {
      globalThis.localStorage?.removeItem(STAFF_LOGOUT_UNCONFIRMED_KEY);
    } catch {
      // A stale marker can only keep a later bootstrap fail-closed.
    }
  }

  private emit(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.session, this.sessionGeneration, this.identityGeneration);
      } catch {
        // Listener failures never mutate authentication state.
      }
    }
  }
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
}

function awaitWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(abortReason(signal));
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}
