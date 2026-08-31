import { Injectable } from "@nestjs/common";
import type { WebPushServerConfig } from "@valet/config";
import webPush from "web-push";

import { WEB_PUSH_DELIVERY } from "./web-push-delivery-constants";

export interface WebPushSendRequest {
  readonly auth: string;
  readonly endpoint: string;
  readonly p256dh: string;
  readonly payload: string;
  readonly ttlSeconds: number;
}

export interface WebPushSendResult {
  readonly networkError?: true;
  readonly retryAfter?: string;
  readonly statusCode?: number;
}

export interface WebPushSender {
  send(request: WebPushSendRequest): Promise<WebPushSendResult>;
}

export function webPushErrorMetadata(
  error: unknown,
): WebPushSendResult | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const candidate = error as {
    headers?: Record<string, unknown>;
    statusCode?: unknown;
  };
  if (typeof candidate.statusCode !== "number") return undefined;
  const header =
    candidate.headers?.["retry-after"] ?? candidate.headers?.["Retry-After"];
  const retryAfter = Array.isArray(header) ? header[0] : header;
  return {
    statusCode: candidate.statusCode,
    ...(typeof retryAfter === "string" ? { retryAfter } : {}),
  };
}

@Injectable()
export class NodeWebPushSender implements WebPushSender {
  constructor(private readonly config: WebPushServerConfig) {}

  async send(request: WebPushSendRequest): Promise<WebPushSendResult> {
    if (!this.config.enabled || this.config.vapid === undefined) {
      return { statusCode: 401 };
    }
    try {
      const response = await webPush.sendNotification(
        {
          endpoint: request.endpoint,
          keys: { auth: request.auth, p256dh: request.p256dh },
        },
        request.payload,
        {
          TTL: request.ttlSeconds,
          timeout: WEB_PUSH_DELIVERY.providerTimeoutMilliseconds,
          vapidDetails: {
            privateKey: this.config.vapid.privateKey,
            publicKey: this.config.vapid.publicKey,
            subject: this.config.vapid.subject,
          },
        },
      );
      return { statusCode: response.statusCode };
    } catch (error) {
      return webPushErrorMetadata(error) ?? { networkError: true };
    }
  }
}
