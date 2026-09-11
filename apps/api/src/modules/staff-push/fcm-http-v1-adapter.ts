import { GoogleAuth } from "google-auth-library";

import type { FcmHttpV1Config } from "./fcm-http-v1-config";
import { mapFcmResult } from "./fcm-result-mapper";
import type {
  StaffPushProvider,
  StaffPushProviderResult,
  StaffPushProviderSendResult,
} from "./staff-push-provider";
import { isValidRetrievalAttentionMessage } from "./staff-push-payload";

const MESSAGING_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const RESPONSE_LIMIT_BYTES = 64 * 1_024;

export interface FcmAccessTokenSource {
  accessToken(): Promise<string>;
}

export type FcmFetch = typeof fetch;

export class GoogleAdcAccessTokenSource implements FcmAccessTokenSource {
  private readonly auth = new GoogleAuth({ scopes: [MESSAGING_SCOPE] });

  async accessToken(): Promise<string> {
    const client = await this.auth.getClient();
    const response = await client.getAccessToken();
    if (typeof response.token !== "string" || response.token === "") {
      throw new Error("FCM access token unavailable.");
    }
    return response.token;
  }
}

async function safeJson(response: Response): Promise<unknown | undefined> {
  const contentLength = response.headers.get("Content-Length");
  if (
    contentLength !== null &&
    /^\d+$/.test(contentLength) &&
    Number(contentLength) > RESPONSE_LIMIT_BYTES
  ) {
    return undefined;
  }
  if (response.body === null) return undefined;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    length += next.value.byteLength;
    if (length > RESPONSE_LIMIT_BYTES) {
      await reader.cancel();
      return undefined;
    }
    chunks.push(next.value);
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(body)) as unknown;
  } catch {
    return undefined;
  }
}

export class FcmHttpV1Adapter implements StaffPushProvider {
  constructor(
    private readonly config: FcmHttpV1Config,
    private readonly tokens: FcmAccessTokenSource = new GoogleAdcAccessTokenSource(),
    private readonly request: FcmFetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  async send(
    request: Parameters<StaffPushProvider["send"]>[0],
  ): Promise<StaffPushProviderSendResult> {
    const initialMessage = request.messageForTransport();
    if (initialMessage === undefined) {
      return { kind: "EXPIRED_BEFORE_TRANSPORT" };
    }
    if (!isValidRetrievalAttentionMessage(initialMessage)) {
      return providerResult({ resultClass: "PERMANENT" });
    }
    const abort = new AbortController();
    const timeout = setTimeout(
      () => abort.abort(),
      this.config.timeoutMilliseconds,
    );
    try {
      let accessToken: string;
      try {
        accessToken = await Promise.race([
          this.tokens.accessToken(),
          new Promise<never>((_resolve, reject) =>
            abort.signal.addEventListener(
              "abort",
              () => reject(new Error("FCM provider boundary timed out.")),
              { once: true },
            ),
          ),
        ]);
      } catch {
        if (request.messageForTransport() === undefined) {
          return { kind: "EXPIRED_BEFORE_TRANSPORT" };
        }
        return providerResult({
          resultClass: abort.signal.aborted ? "UNKNOWN" : "CONFIGURATION",
        });
      }
      const message = request.messageForTransport();
      if (message === undefined) return { kind: "EXPIRED_BEFORE_TRANSPORT" };
      if (!isValidRetrievalAttentionMessage(message)) {
        return providerResult({ resultClass: "PERMANENT" });
      }
      const response = await this.request(
        `https://fcm.googleapis.com/v1/projects/${this.config.projectId}/messages:send`,
        {
          body: JSON.stringify({ message }),
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          method: "POST",
          signal: abort.signal,
        },
      );
      return providerResult(
        mapFcmResult({
          body: await safeJson(response),
          httpStatus: response.status,
          nowMilliseconds: this.now(),
          payloadProvenValid: true,
          retryAfter: response.headers.get("Retry-After"),
        }),
      );
    } catch {
      return providerResult({ resultClass: "UNKNOWN" });
    } finally {
      clearTimeout(timeout);
    }
  }
}

function providerResult(
  result: StaffPushProviderResult,
): StaffPushProviderSendResult {
  return { kind: "PROVIDER_RESULT", result };
}
