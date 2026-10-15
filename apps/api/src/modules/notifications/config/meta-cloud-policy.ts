import type { OutboundSendInput } from "../contracts/outbound-provider.js";

/** Reviewed against Meta's official Cloud API collection; change only after a compatibility review. */
export const META_GRAPH_VERSION = "v26.0" as const;
export const META_GRAPH_ORIGIN = "https://graph.facebook.com" as const;
export const META_HTTP_TIMEOUT_MS = 10_000;
export const META_RESPONSE_MAX_BYTES = 8_192;

export type MetaLanguage = "ar" | "en";
export type MetaEnvironment = "test" | "production";

/** Persisted provider approval must be verified against the tenant's own WABA. */
export interface ApprovedMetaTemplate {
  readonly catalogVersion: string;
  readonly locale: MetaLanguage;
  readonly languageCode: "ar" | "en_US";
  readonly name: string;
  readonly status: "APPROVED";
  readonly layout: "BODY_ONE_URL";
  readonly wabaId: string;
}

/** The resolver is server-only and must authorize this exact immutable attempt. */
export interface MetaAuthorizedAttempt {
  readonly organizationId: string;
  readonly bindingId: string;
  readonly environment: MetaEnvironment;
  readonly wabaId: string;
  readonly phoneNumberId: string;
  readonly accessToken: string;
  readonly enabled: boolean;
  readonly recipientE164: string;
  readonly customerOrigin: string;
  readonly template: ApprovedMetaTemplate;
  readonly testRecipientAllowlist: readonly string[];
}

export type MetaAccountResolver = (
  attemptHandle: string,
) => Promise<MetaAuthorizedAttempt | null>;

export function normalizeMetaRecipient(value: string): string | null {
  return /^\+[1-9][0-9]{7,14}$/.test(value) ? value.slice(1) : null;
}

function canonicalCustomerOrigin(rawOrigin: string): string | null {
  try {
    const url = new URL(rawOrigin);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
        url.pathname !== "/" || url.port || url.hostname === "") return null;
    return url.origin;
  } catch { return null; }
}

export function resolveMetaPayload(input: OutboundSendInput, account: MetaAuthorizedAttempt): object | null {
  const recipient = normalizeMetaRecipient(input.recipientE164);
  const origin = canonicalCustomerOrigin(account.customerOrigin);
  const approval = account.template;
  if (!account.enabled || !recipient || recipient !== normalizeMetaRecipient(account.recipientE164) ||
      !origin || !/^[0-9]{5,25}$/.test(account.phoneNumberId) ||
      !/^[0-9]{5,25}$/.test(account.wabaId) ||
      !/^[A-Za-z0-9_-]{1,512}$/.test(input.attemptHandle) ||
      !account.accessToken || account.accessToken.length > 4096 || /\s/.test(account.accessToken) ||
      input.accessToken !== account.accessToken ||
      input.phoneNumberId !== account.phoneNumberId || input.graphVersion !== META_GRAPH_VERSION ||
      approval.status !== "APPROVED" || approval.layout !== "BODY_ONE_URL" ||
      approval.wabaId !== account.wabaId ||
      !/^[a-z0-9_]{1,512}$/.test(approval.name) ||
      !/^[A-Za-z0-9_.-]{1,64}$/.test(approval.catalogVersion) ||
      approval.name !== input.templateName || approval.locale !== input.templateLanguage ||
      approval.languageCode !== (approval.locale === "ar" ? "ar" : "en_US")) return null;
  if (account.environment === "test" && !account.testRecipientAllowlist.includes(input.recipientE164)) return null;
  const guestUrl = `${origin}/#guestToken=`;
  if (!input.guestUrl.startsWith(guestUrl) ||
      !/^[A-Za-z0-9_-]{43}$/.test(input.guestUrl.slice(guestUrl.length)) ||
      input.guestUrl.length > 2048) return null;
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: recipient,
    type: "template",
    biz_opaque_callback_data: input.attemptHandle,
    template: {
      name: approval.name,
      language: { code: approval.languageCode },
      components: [{ type: "body", parameters: [{ type: "text", text: input.guestUrl }] }],
    },
  };
}
