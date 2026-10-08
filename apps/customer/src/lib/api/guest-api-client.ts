import {
  GUEST_BROWSER_CSRF_HEADER,
  GUEST_BROWSER_CSRF_VALUE,
  guestBrowserPrepareResponseSchema,
  guestBrowserSwitchReconcileResponseSchema,
  guestBrowserSwitchResponseSchema,
  guestHandoffMaterialResponseSchema,
  guestSafeSessionResponseSchema,
  guestSessionReadResponseSchema,
  type GuestBrowserPrepareResponse,
  type GuestBrowserSwitchReconcileResponse,
  type GuestBrowserSwitchResponse,
} from "@valet/contracts";

import { getGuestApiBaseUrl } from "./api-config";
import { GuestApiError } from "./api-error";
import { executeGuestHttpRequest } from './guest-http-transport';
import {
  announceBrowserContextChange,
  readBrowserContextMarker,
} from "./guest-browser-context-marker";
import type {
  GuestHandoffMaterial,
  GuestSafeSession,
  HandoffStandardMethod,
} from "./guest-api-types";

interface RequestOptions {
  method?: "GET" | "POST" | undefined;
  body?: unknown;
  signal?: AbortSignal | undefined;
  omitAuthorization?: boolean | undefined;
  requireBrowserCsrf?: boolean | undefined;
  allowBrowserContextChange?: boolean | undefined;
}

export { GUEST_CONTEXT_CHANGED_EVENT } from "./guest-browser-context-marker";

const customerSessionReadSchema = guestSessionReadResponseSchema.extend({
  branding: guestSessionReadResponseSchema.shape.branding
    .optional()
    .catch(undefined),
});

export class GuestApiClient {
  private readonly baseUrl: string;
  private readonly bearerToken: string | null;
  private readonly browserContextMarker: string | null;

  constructor(
    bearerToken: string | null,
    customBaseUrl?: string | undefined,
  ) {
    this.bearerToken = bearerToken;
    this.baseUrl = customBaseUrl ?? getGuestApiBaseUrl();
    this.browserContextMarker =
      bearerToken === null ? readBrowserContextMarker() : null;
  }

  static browserSession(customBaseUrl?: string | undefined): GuestApiClient {
    return new GuestApiClient(null, customBaseUrl);
  }

  private async request<T>(
    path: string,
    options: RequestOptions = {},
    parse?: (raw: unknown) => T,
  ): Promise<T> {
    const {
      method = "GET",
      body,
      signal,
      omitAuthorization = false,
      requireBrowserCsrf = false,
      allowBrowserContextChange = false,
    } = options;
    if (this.bearerToken === null && !allowBrowserContextChange) {
      this.assertBrowserContextCurrent();
    }
    const url = `${this.baseUrl}${path}`;

    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (!omitAuthorization && this.bearerToken !== null) {
      headers.Authorization = `Bearer ${this.bearerToken}`;
    }
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }
    if (
      requireBrowserCsrf ||
      (method === "POST" && this.bearerToken === null)
    ) {
      headers[GUEST_BROWSER_CSRF_HEADER] = GUEST_BROWSER_CSRF_VALUE;
    }

    const fetchInit: RequestInit = {
      method,
      cache: "no-store",
      credentials: "same-origin",
      headers,
    };
    if (body !== undefined) {
      fetchInit.body = JSON.stringify(body);
    }

    const value = await executeGuestHttpRequest<T>({
      url, init: fetchInit, callerSignal: signal, parse,
    });
    if (this.bearerToken === null && !allowBrowserContextChange) {
      this.assertBrowserContextCurrent();
    }
    return value;
  }

  private assertBrowserContextCurrent(): void {
    if (this.browserContextMarker === readBrowserContextMarker()) return;
    announceBrowserContextChange();
    throw new GuestApiError({
      status: 409,
      code: "GUEST_CONTEXT_CHANGED",
      message: "The guest browser context changed.",
    });
  }

  async prepareBrowserSession(
    signal?: AbortSignal | undefined,
  ): Promise<GuestBrowserPrepareResponse> {
    if (this.bearerToken === null) {
      throw new Error("Guest browser-session prepare requires a bootstrap bearer.");
    }
    return this.request<GuestBrowserPrepareResponse>("/browser-session/prepare", {
      method: "POST",
      body: {},
      signal,
      requireBrowserCsrf: true,
    }, (raw) => guestBrowserPrepareResponseSchema.parse(raw));
  }

  async enrollBrowserSession(
    signal?: AbortSignal | undefined,
  ): Promise<void> {
    await this.request<void>("/browser-session/enroll", {
      method: "POST",
      body: {},
      signal,
      omitAuthorization: true,
      requireBrowserCsrf: true,
    });
  }

  async exchangeBrowserSession(
    signal?: AbortSignal | undefined,
  ): Promise<void> {
    if (this.bearerToken === null) {
      throw new Error("Guest browser-session exchange requires a bootstrap bearer.");
    }
    await this.request<void>("/browser-session/exchange", {
      method: "POST",
      body: {},
      signal,
      requireBrowserCsrf: true,
    });
  }

  async switchBrowserContext(
    signal?: AbortSignal | undefined,
  ): Promise<GuestBrowserSwitchResponse> {
    if (this.bearerToken === null) {
      throw new Error("Guest browser context switch requires a bootstrap bearer.");
    }
    return this.request<GuestBrowserSwitchResponse>("/browser-session/switch", {
      method: "POST",
      body: {},
      signal,
      requireBrowserCsrf: true,
    }, (raw) => guestBrowserSwitchResponseSchema.parse(raw));
  }

  async reconcileBrowserContextSwitch(
    signal?: AbortSignal | undefined,
  ): Promise<GuestBrowserSwitchReconcileResponse> {
    if (this.bearerToken !== null) {
      throw new Error("Guest browser switch reconciliation requires cookie authority.");
    }
    return this.request<GuestBrowserSwitchReconcileResponse>("/browser-session/switch/reconcile", {
      method: "POST",
      body: {},
      signal,
      requireBrowserCsrf: true,
      allowBrowserContextChange: true,
    }, (raw) => guestBrowserSwitchReconcileResponseSchema.parse(raw));
  }

  async loadSession(
    signal?: AbortSignal | undefined,
  ): Promise<GuestSafeSession> {
    return this.request<GuestSafeSession>("/session", {
      method: "GET",
      signal,
    }, (raw) => customerSessionReadSchema.parse(raw));
  }

  async requestRetrieval(
    signal?: AbortSignal | undefined,
  ): Promise<GuestSafeSession> {
    return this.request<GuestSafeSession>("/session/request-retrieval", {
      method: "POST",
      body: {},
      signal,
    }, (raw) => guestSafeSessionResponseSchema.parse(raw));
  }

  async cancelRetrieval(
    signal?: AbortSignal | undefined,
  ): Promise<GuestSafeSession> {
    return this.request<GuestSafeSession>("/session/cancel-retrieval", {
      method: "POST",
      body: {},
      signal,
    }, (raw) => guestSafeSessionResponseSchema.parse(raw));
  }

  async issueHandoff(
    method: HandoffStandardMethod,
    signal?: AbortSignal | undefined,
  ): Promise<GuestHandoffMaterial> {
    return this.request<GuestHandoffMaterial>(
      "/session/handoff-verification/issue",
      {
        method: "POST",
        body: { method },
        signal,
      }, (raw) => guestHandoffMaterialResponseSchema.parse(raw),
    );
  }

  async rotateHandoff(
    method: HandoffStandardMethod,
    signal?: AbortSignal | undefined,
  ): Promise<GuestHandoffMaterial> {
    return this.request<GuestHandoffMaterial>(
      "/session/handoff-verification/rotate",
      {
        method: "POST",
        body: { method },
        signal,
      }, (raw) => guestHandoffMaterialResponseSchema.parse(raw),
    );
  }
}
