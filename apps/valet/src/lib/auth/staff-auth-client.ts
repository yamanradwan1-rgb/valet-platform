import {
  staffAuthAccessResponseSchema,
  staffLoginRequestSchema,
  type StaffAuthAccessResponse,
  type StaffLoginRequest,
} from "@valet/contracts";

import {
  EmployeeApiError,
  normalizeEmployeeApiError,
} from "../api/employee-api-errors";
import {
  classifyRefreshFailure,
  ensureAccessTokenDetailed,
  StaffAuthRefreshError,
} from "./staff-auth-recovery";
import type { StaffAuthSession } from "./staff-auth-types";

export type SessionChangeListener = (
  session: StaffAuthSession | null,
  sessionGeneration: number,
) => void;

export interface StaffAuthClientOptions {
  readonly baseUrl?: string | undefined;
}

export class StaffAuthClient {
  private readonly baseUrl: string;
  private session: StaffAuthSession | null = null;
  private sessionGeneration = 0;
  private refreshPromise: Promise<StaffAuthAccessResponse> | null = null;
  private readonly listeners = new Set<SessionChangeListener>();

  constructor(options: StaffAuthClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? "";
  }

  getSession(): StaffAuthSession | null {
    return this.session;
  }

  getSessionGeneration(): number {
    return this.sessionGeneration;
  }

  getAccessToken(): string | null {
    return this.session?.accessToken ?? null;
  }

  isTokenFresh(bufferSeconds = 60): boolean {
    if (!this.session) return false;
    const expiresAt = new Date(this.session.accessExpiresAt).getTime();
    return expiresAt - Date.now() > bufferSeconds * 1000;
  }

  subscribe(listener: SessionChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setSession(session: StaffAuthSession | null): void {
    this.session = session;
    this.sessionGeneration++;
    for (const listener of this.listeners) {
      try {
        listener(this.session, this.sessionGeneration);
      } catch {
        // Prevent subscriber errors from disrupting auth client state
      }
    }
  }

  async login(
    credentials: StaffLoginRequest,
    signal?: AbortSignal | undefined,
  ): Promise<StaffAuthAccessResponse> {
    const validated = staffLoginRequestSchema.parse(credentials);
    const url = `${this.baseUrl}/v1/staff/auth/login`;

    const fetchInit: RequestInit = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(validated),
      credentials: "include",
      cache: "no-store",
    };
    if (signal !== undefined) {
      fetchInit.signal = signal;
    }

    const response = await this.executeFetch(url, fetchInit);
    const payload = await this.parseJsonPayload(response);

    if (!response.ok) {
      throw normalizeEmployeeApiError(
        response.status,
        payload,
        "Staff authentication failed.",
      );
    }

    const accessResponse = staffAuthAccessResponseSchema.parse(payload);
    this.setSession({
      accessToken: accessResponse.accessToken,
      tokenType: accessResponse.tokenType,
      accessExpiresAt: accessResponse.accessExpiresAt,
      sessionExpiresAt: accessResponse.sessionExpiresAt,
    });

    return accessResponse;
  }

  async refresh(
    signal?: AbortSignal | undefined,
  ): Promise<StaffAuthAccessResponse> {
    if (signal?.aborted) {
      throw (
        signal.reason ??
        new DOMException("The operation was aborted.", "AbortError")
      );
    }

    if (this.refreshPromise === null) {
      this.refreshPromise = this.performRefresh().finally(() => {
        this.refreshPromise = null;
      });
    }

    const activeRefresh = this.refreshPromise;

    if (!signal) {
      return activeRefresh;
    }

    return new Promise<StaffAuthAccessResponse>((resolve, reject) => {
      const onAbort = () => {
        reject(
          signal.reason ??
            new DOMException("The operation was aborted.", "AbortError"),
        );
      };

      signal.addEventListener("abort", onAbort, { once: true });

      activeRefresh
        .then((result) => {
          signal.removeEventListener("abort", onAbort);
          resolve(result);
        })
        .catch((error) => {
          signal.removeEventListener("abort", onAbort);
          reject(error);
        });
    });
  }

  private async performRefresh(): Promise<StaffAuthAccessResponse> {
    try {
      const url = `${this.baseUrl}/v1/staff/auth/refresh`;

      const fetchInit: RequestInit = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({}),
        credentials: "include",
        cache: "no-store",
      };

      const response = await this.executeFetch(url, fetchInit);
      const payload = await this.parseJsonPayload(response);

      if (!response.ok) {
        // A transient refresh failure (5xx/network) is NOT evidence that the
        // authenticated session ended; only definitive rejections may clear it.
        const normalized = normalizeEmployeeApiError(
          response.status,
          payload,
          "Staff session refresh failed.",
        );
        const kind = classifyRefreshFailure(normalized);
        if (kind === "definitive") {
          this.setSession(null);
        }
        throw new StaffAuthRefreshError(kind, normalized);
      }

      const accessResponse = staffAuthAccessResponseSchema.parse(payload);
      this.setSession({
        accessToken: accessResponse.accessToken,
        tokenType: accessResponse.tokenType,
        accessExpiresAt: accessResponse.accessExpiresAt,
        sessionExpiresAt: accessResponse.sessionExpiresAt,
      });

      return accessResponse;
    } catch (error: unknown) {
      if (error instanceof StaffAuthRefreshError) {
        throw error;
      }
      // Network-level refresh outages are transient by definition.
      const normalized =
        error instanceof EmployeeApiError
          ? error
          : new EmployeeApiError({
              code: "NETWORK_ERROR",
              isNetworkError: true,
              message:
                "Network connection unavailable. Please check your internet connection.",
              status: 0,
            });
      throw new StaffAuthRefreshError(
        classifyRefreshFailure(normalized),
        normalized,
      );
    }
  }

  async tryRefresh(
    signal?: AbortSignal | undefined,
  ): Promise<StaffAuthAccessResponse | null> {
    try {
      return await this.refresh(signal);
    } catch {
      return null;
    }
  }

  async logout(signal?: AbortSignal | undefined): Promise<void> {
    const url = `${this.baseUrl}/v1/staff/auth/logout`;

    const fetchInit: RequestInit = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({}),
      credentials: "include",
      cache: "no-store",
    };
    if (signal !== undefined) {
      fetchInit.signal = signal;
    }

    try {
      const response = await this.executeFetch(url, fetchInit);
      if (!response.ok) {
        const payload = await this.parseJsonPayload(response);
        throw normalizeEmployeeApiError(
          response.status,
          payload,
          "Staff logout failed.",
        );
      }
    } finally {
      this.setSession(null);
    }
  }

  async ensureFreshToken(
    bufferSeconds = 60,
    signal?: AbortSignal | undefined,
  ): Promise<string | null> {
    const outcome = await ensureAccessTokenDetailed(
      this,
      bufferSeconds,
      signal,
    );
    return outcome.token;
  }

  private async executeFetch(
    url: string,
    init: RequestInit,
  ): Promise<Response> {
    try {
      return await fetch(url, init);
    } catch (error: unknown) {
      if (init.signal?.aborted) {
        throw error;
      }
      throw new EmployeeApiError({
        status: 0,
        code: "NETWORK_ERROR",
        message:
          "Network connection unavailable. Please check your internet connection.",
        isNetworkError: true,
      });
    }
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
