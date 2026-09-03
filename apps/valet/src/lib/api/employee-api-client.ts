import {
  EmployeeClient,
  employeeAuthenticationRequiredError,
  employeeSessionServiceUnavailableError,
  type EmployeeAuthorizationRefreshResult,
  type EmployeeHttpMethod,
} from "@valet/employee-client";

import type { StaffAuthClient } from "../auth/staff-auth-client";
import {
  ensureAccessTokenDetailed,
  StaffAuthRefreshError,
} from "../auth/staff-auth-recovery";
import { EmployeeApiBrowserTransport } from "./employee-api-browser-transport";

export type HttpMethod = EmployeeHttpMethod;

export interface EmployeeRequestOptions {
  readonly body?: unknown | undefined;
  readonly headers?: Record<string, string> | undefined;
  readonly method?: HttpMethod | undefined;
  readonly params?:
    Record<string, string | number | boolean | undefined | null> | undefined;
  readonly requireAuth?: boolean | undefined;
  readonly signal?: AbortSignal | undefined;
  readonly skipProactiveRefresh?: boolean | undefined;
}

export interface EmployeeApiClientOptions {
  readonly authClient: StaffAuthClient;
  readonly baseUrl?: string | undefined;
  readonly onAuthorizationLoss?: (() => void) | undefined;
}

/**
 * Web wiring for the portable Employee client. Browser transport, cookies,
 * AbortSignal, and the Web StaffAuthClient stay on this side of the boundary.
 */
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
    const {
      method = "GET",
      body,
      params,
      headers,
      signal,
      requireAuth = true,
      skipProactiveRefresh = false,
    } = options;

    if (requireAuth) {
      const token = await this.resolveInitialAccessToken(
        skipProactiveRefresh,
        signal,
      );
      if (token === null) {
        this.onAuthorizationLoss?.();
        throw employeeAuthenticationRequiredError();
      }
    }

    const client = new EmployeeClient({
      transport: new EmployeeApiBrowserTransport({
        baseUrl: this.baseUrl,
        getAccessToken: () => this.authClient.getAccessToken(),
        requireAuth,
        signal,
      }),
      authorizationRecovery: {
        allowRefresh: requireAuth,
        onAuthorizationLoss: this.onAuthorizationLoss,
        refreshAuthorization: () => this.refreshAuthorization(signal),
      },
    });

    return client.request<T>({ body, headers, method, params, path });
  }

  private async resolveInitialAccessToken(
    skipProactiveRefresh: boolean,
    signal?: AbortSignal | undefined,
  ): Promise<string | null> {
    if (skipProactiveRefresh) return this.authClient.getAccessToken();

    const ensured = await ensureAccessTokenDetailed(
      this.authClient,
      60,
      signal,
    );
    if (ensured.token === null && ensured.failureKind === "transient") {
      throw employeeSessionServiceUnavailableError();
    }
    return ensured.token;
  }

  private async refreshAuthorization(
    signal?: AbortSignal | undefined,
  ): Promise<EmployeeAuthorizationRefreshResult> {
    try {
      await this.authClient.refresh(signal);
      return "refreshed";
    } catch (error: unknown) {
      if (error instanceof StaffAuthRefreshError) {
        return error.kind === "definitive"
          ? "definitive-failure"
          : "transient-failure";
      }
      // Preserve the pre-extraction fallback: only an explicitly classified
      // transient refresh failure suppresses authorization-loss handling.
      return "definitive-failure";
    }
  }
}
