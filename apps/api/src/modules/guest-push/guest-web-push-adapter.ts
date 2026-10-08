import {
  generateRequestDetails,
  type PushSubscription,
  type RequestDetails,
} from "web-push";

import type { GuestWebPushConfig } from "./guest-web-push-config";
import type {
  GuestPushProvider,
  GuestPushProviderResultClass,
} from "./guest-push-provider";

const MAX_RETRY_AFTER_SECONDS = 86_400;

export function guestWebPushEndpointAllowed(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    const host = url.hostname.toLowerCase();
    const appleHost =
      host !== "push.apple.com" && host.endsWith(".push.apple.com");
    return (
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.port === "" &&
      url.hash === "" &&
      url.pathname.length > 1 &&
      (host === "fcm.googleapis.com" || appleHost)
    );
  } catch {
    return false;
  }
}

function retryAfterSeconds(
  raw: string | null,
  nowMilliseconds: number,
): number | undefined {
  if (raw === null) return undefined;
  if (/^\d+$/.test(raw)) {
    return Math.min(MAX_RETRY_AFTER_SECONDS, Math.max(1, Number(raw)));
  }
  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) return undefined;
  return Math.min(
    MAX_RETRY_AFTER_SECONDS,
    Math.max(1, Math.ceil((timestamp - nowMilliseconds) / 1_000)),
  );
}

export function classifyGuestWebPushStatus(
  statusCode: number,
): GuestPushProviderResultClass {
  if (statusCode >= 200 && statusCode < 300) return "ACCEPTED";
  if (statusCode === 404 || statusCode === 410) return "INVALID_ENDPOINT";
  if (statusCode === 429) return "RATE_LIMITED";
  if (statusCode === 401 || statusCode === 403) return "CONFIGURATION";
  if (
    statusCode === 408 ||
    statusCode === 425 ||
    (statusCode >= 500 && statusCode < 600)
  ) {
    return "TRANSIENT";
  }
  if (statusCode >= 400 && statusCode < 500) return "PERMANENT";
  return "UNKNOWN";
}

export class GuestWebPushAdapter implements GuestPushProvider {
  constructor(
    private readonly config: GuestWebPushConfig,
    private readonly nowMilliseconds: () => number = Date.now,
    private readonly request: typeof fetch = fetch,
    private readonly prepare: typeof generateRequestDetails =
      generateRequestDetails,
  ) {}

  async send(request: Parameters<GuestPushProvider["send"]>[0]) {
    const message = request.messageForTransport();
    if (message === undefined) {
      return { kind: "EXPIRED_BEFORE_TRANSPORT" } as const;
    }
    if (!guestWebPushEndpointAllowed(message.endpoint)) {
      return {
        kind: "PROVIDER_RESULT",
        result: { resultClass: "INVALID_ENDPOINT" },
      } as const;
    }
    const subscription: PushSubscription = {
      endpoint: message.endpoint,
      keys: { auth: message.auth, p256dh: message.p256dh },
    };
    const payload = JSON.stringify({
      schemaVersion: 1,
      kind: "GUEST_VEHICLE_READY",
      intentId: message.intentId,
      routeIntent: "GUEST_STATUS",
      locale: message.locale,
    });
    let details: RequestDetails;
    try {
      details = this.prepare(subscription, payload, {
          TTL: message.ttlSeconds,
          contentEncoding: "aes128gcm",
          urgency: "high",
          vapidDetails: {
            privateKey: this.config.privateKey,
            publicKey: this.config.publicKey,
            subject: this.config.subject,
          },
        });
    } catch {
      return {
        kind: "PROVIDER_RESULT",
        result: { resultClass: "CONFIGURATION" },
      } as const;
    }
    if (
      details.endpoint !== message.endpoint ||
      !guestWebPushEndpointAllowed(details.endpoint)
    ) {
      return {
        kind: "PROVIDER_RESULT",
        result: { resultClass: "PERMANENT" },
      } as const;
    }
    const abort = new AbortController();
    const timer = setTimeout(
      () => abort.abort(),
      this.config.timeoutMilliseconds,
    );
    try {
      const response = await this.request(details.endpoint, {
        body: details.body,
        credentials: "omit",
        headers: details.headers,
        method: details.method,
        redirect: "error",
        signal: abort.signal,
      });
      const resultClass = classifyGuestWebPushStatus(response.status);
      const retryAfter =
        resultClass === "RATE_LIMITED"
          ? retryAfterSeconds(
              response.headers.get("retry-after"),
              this.nowMilliseconds(),
            )
          : undefined;
      return {
        kind: "PROVIDER_RESULT",
        result:
          retryAfter === undefined
            ? { resultClass }
            : { resultClass, retryAfterSeconds: retryAfter },
      } as const;
    } catch {
      return {
        kind: "PROVIDER_RESULT",
        result: { resultClass: "UNKNOWN" },
      } as const;
    } finally {
      clearTimeout(timer);
    }
  }
}
