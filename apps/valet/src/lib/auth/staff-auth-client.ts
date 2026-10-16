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
  ensureAccessTokenDetailed,
  StaffAuthRefreshError,
} from "./staff-auth-recovery";
import { StaffAuthBoundary } from "./staff-auth-boundary";
import { performStaffAuthRefreshRequest } from "./staff-auth-refresh-operation";
import {
  executeStaffAuthFetch,
  parseStaffAuthJsonPayload,
} from "./staff-auth-transport";
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
  private authEpoch = 0;
  private refreshPromise: Promise<StaffAuthAccessResponse> | null = null;
  private readonly listeners = new Set<SessionChangeListener>();
  private readonly boundary = new StaffAuthBoundary(() => {
    this.authEpoch++;
    if (this.session !== null) this.setSession(null);
  });

  constructor(options: StaffAuthClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? "";
  }

  getSession(): StaffAuthSession | null {
    this.boundary.snapshot();
    return this.session;
  }

  getSessionGeneration(): number {
    return this.sessionGeneration;
  }

  isSilentRestoreBlocked(): boolean {
    return this.boundary.isSilentAuthBlocked();
  }

  getAccessToken(): string | null {
    return this.getSession()?.accessToken ?? null;
  }

  isTokenFresh(bufferSeconds = 60): boolean {
    const session = this.getSession();
    if (!session) return false;
    const expiresAt = new Date(session.accessExpiresAt).getTime();
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
    const started = this.boundary.snapshot();
    const epoch = ++this.authEpoch;
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

    const response = await executeStaffAuthFetch(url, fetchInit);
    const payload = await parseStaffAuthJsonPayload(response);

    if (!response.ok) {
      throw normalizeEmployeeApiError(
        response.status,
        payload,
        "Staff authentication failed.",
      );
    }

    const accessResponse = staffAuthAccessResponseSchema.parse(payload);
    if (epoch !== this.authEpoch || !this.boundary.completeInteractiveLogin(started)) {
      throw new Error("Staff authentication changed during sign-in. Please sign in again.");
    }
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
    if (this.boundary.isSilentAuthBlocked()) {
      throw new StaffAuthRefreshError("definitive", new EmployeeApiError({
        status: 401, code: "STAFF_LOGOUT_PENDING",
        message: "Sign in again to continue after signing out.",
      }));
    }
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
    const started = this.boundary.snapshot();
    const epoch = this.authEpoch;
    const isCurrent = () => epoch === this.authEpoch &&
      this.boundary.isUnchanged(started) && !this.boundary.isSilentAuthBlocked();
    return performStaffAuthRefreshRequest(this.baseUrl, (accessResponse) => {
      if (!isCurrent()) {
        throw new StaffAuthRefreshError("definitive", new EmployeeApiError({
          status: 401, code: "STAFF_AUTH_EPOCH_CHANGED",
          message: "Authentication changed while renewing the staff session.",
        }));
      }
      this.setSession({
        accessToken: accessResponse.accessToken,
        tokenType: accessResponse.tokenType,
        accessExpiresAt: accessResponse.accessExpiresAt,
        sessionExpiresAt: accessResponse.sessionExpiresAt,
      });
    }, () => {
      if (isCurrent()) this.setSession(null);
    });
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
    this.authEpoch++;
    let started: ReturnType<StaffAuthBoundary["beginLogout"]>;
    try {
      started = this.boundary.beginLogout();
    } finally {
      // Discard local authority immediately, including unknown network outcomes.
      this.setSession(null);
    }
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

    const response = await executeStaffAuthFetch(url, fetchInit);
    if (!response.ok) {
      const payload = await parseStaffAuthJsonPayload(response);
      throw normalizeEmployeeApiError(
        response.status,
        payload,
        "Staff logout failed.",
      );
    }
    this.boundary.confirmLogout(started);
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
}
