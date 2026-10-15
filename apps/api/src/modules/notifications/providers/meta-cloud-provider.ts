import type { OutboundProvider, OutboundSendInput, OutboundSendResult } from "../contracts/outbound-provider.js";
import {
  META_GRAPH_ORIGIN, META_GRAPH_VERSION, resolveMetaPayload,
  type MetaAccountResolver, type MetaEnvironment,
} from "../config/meta-cloud-policy.js";
import { sendMetaHttp } from "./meta-cloud-http.js";

export type MetaSendMode = "disabled" | MetaEnvironment;

export interface MetaCloudProviderOptions {
  readonly resolveAuthorizedAttempt: MetaAccountResolver;
  readonly mode?: MetaSendMode;
  /** Only the sender bootstrap may set this after durable global, tenant and consent fences. */
  readonly globallyEnabled?: boolean;
  readonly fetchImpl?: typeof fetch;
}

/** Defaults to no network. Caller must obtain account/credential from server-only resolver. */
export function createMetaCloudProvider(options: MetaCloudProviderOptions): OutboundProvider {
  return {
    async send(input: OutboundSendInput): Promise<OutboundSendResult> {
      if (!options.globallyEnabled || !options.mode || options.mode === "disabled")
        return { kind: "PERMANENT", reason: "POLICY" };
      if (input.signal.aborted) return { kind: "UNKNOWN", reason: "TRANSPORT" };

      let account;
      try { account = await options.resolveAuthorizedAttempt(input.attemptHandle); }
      catch { return { kind: "PERMANENT", reason: "POLICY" }; }
      if (!account || account.environment !== options.mode)
        return { kind: "PERMANENT", reason: "POLICY" };
      const payload = resolveMetaPayload(input, account);
      if (!payload) return { kind: "PERMANENT", reason: "POLICY" };
      if (input.signal.aborted) return { kind: "UNKNOWN", reason: "TRANSPORT" };
      // Host, scheme, version and URL path are constants; never interpolate a URL from config.
      const url = `${META_GRAPH_ORIGIN}/${META_GRAPH_VERSION}/${account.phoneNumberId}/messages`;
      return sendMetaHttp({
        url, token: account.accessToken, payload, upstream: input.signal,
        ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
      });
    },
  };
}
