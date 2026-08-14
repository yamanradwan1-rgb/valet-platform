import {
  guestHandoffMaterialResponseSchema,
  guestSafeSessionResponseSchema,
} from '@valet/contracts';

import { getGuestApiBaseUrl } from './api-config';
import { GuestApiError, mapToGuestSafeMessage } from './api-error';
import type {
  GuestHandoffMaterial,
  GuestSafeSession,
  HandoffStandardMethod,
} from './guest-api-types';

interface RequestOptions {
  method?: 'GET' | 'POST' | undefined;
  body?: unknown;
  signal?: AbortSignal | undefined;
}

export class GuestApiClient {
  private readonly baseUrl: string;
  private readonly bearerToken: string;

  constructor(bearerToken: string, customBaseUrl?: string | undefined) {
    this.bearerToken = bearerToken;
    this.baseUrl = customBaseUrl ?? getGuestApiBaseUrl();
  }

  private async request<T>(
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const { method = 'GET', body, signal } = options;
    const url = `${this.baseUrl}${path}`;

    const headers: Record<string, string> = {
      Accept: 'application/json',
      Authorization: `Bearer ${this.bearerToken}`,
    };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const fetchInit: RequestInit = {
      method,
      cache: 'no-store',
      headers,
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
    } catch (networkErr: unknown) {
      if (signal?.aborted) {
        throw networkErr;
      }
      throw new GuestApiError({
        status: 0,
        code: 'NETWORK_ERROR',
        message: 'Network connection unavailable. Please check your internet connection.',
        isNetworkError: true,
      });
    }

    const text = await response.text();
    let payload: unknown;
    if (text.length > 0) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }

    if (!response.ok) {
      const mapped = mapToGuestSafeMessage(response.status, payload);
      throw new GuestApiError({
        status: response.status,
        code: mapped.code,
        message: mapped.message,
        retryAfter: mapped.retryAfter,
      });
    }

    return payload as T;
  }

  async loadSession(signal?: AbortSignal | undefined): Promise<GuestSafeSession> {
    const raw = await this.request<unknown>('/session', {
      method: 'GET',
      signal,
    });
    return guestSafeSessionResponseSchema.parse(raw);
  }

  async requestRetrieval(signal?: AbortSignal | undefined): Promise<GuestSafeSession> {
    const raw = await this.request<unknown>('/session/request-retrieval', {
      method: 'POST',
      body: {},
      signal,
    });
    return guestSafeSessionResponseSchema.parse(raw);
  }

  async cancelRetrieval(signal?: AbortSignal | undefined): Promise<GuestSafeSession> {
    const raw = await this.request<unknown>('/session/cancel-retrieval', {
      method: 'POST',
      body: {},
      signal,
    });
    return guestSafeSessionResponseSchema.parse(raw);
  }

  async issueHandoff(
    method: HandoffStandardMethod,
    signal?: AbortSignal | undefined,
  ): Promise<GuestHandoffMaterial> {
    const raw = await this.request<unknown>('/session/handoff-verification/issue', {
      method: 'POST',
      body: { method },
      signal,
    });
    return guestHandoffMaterialResponseSchema.parse(raw);
  }

  async rotateHandoff(
    method: HandoffStandardMethod,
    signal?: AbortSignal | undefined,
  ): Promise<GuestHandoffMaterial> {
    const raw = await this.request<unknown>('/session/handoff-verification/rotate', {
      method: 'POST',
      body: { method },
      signal,
    });
    return guestHandoffMaterialResponseSchema.parse(raw);
  }
}
