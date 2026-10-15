import type { OutboundSendInput } from "../src/modules/notifications/contracts/outbound-provider.js";
import type { MetaAuthorizedAttempt } from "../src/modules/notifications/config/meta-cloud-policy.js";

export const syntheticToken = "A".repeat(43);
export const syntheticUrl = `https://guest.example.test/#guestToken=${syntheticToken}`;

export function syntheticInput(overrides: Partial<OutboundSendInput> = {}): OutboundSendInput {
  return {
    attemptHandle: "synthetic_random_attempt_123456789",
    recipientE164: "+962790000001",
    templateName: "guest_access_en_v1",
    templateLanguage: "en",
    guestUrl: syntheticUrl,
    phoneNumberId: "123456789012345",
    accessToken: "synthetic-meta-test-credential",
    graphVersion: "v26.0",
    signal: new AbortController().signal,
    ...overrides,
  };
}

export function syntheticAccount(overrides: Partial<MetaAuthorizedAttempt> = {}): MetaAuthorizedAttempt {
  return {
    organizationId: "synthetic-organization",
    bindingId: "synthetic-binding",
    environment: "test",
    wabaId: "12345678901234",
    phoneNumberId: "123456789012345",
    accessToken: "synthetic-meta-test-credential",
    enabled: true,
    recipientE164: "+962790000001",
    customerOrigin: "https://guest.example.test",
    testRecipientAllowlist: ["+962790000001"],
    template: {
      catalogVersion: "guest-1",
      locale: "en",
      languageCode: "en_US",
      name: "guest_access_en_v1",
      status: "APPROVED",
      layout: "BODY_ONE_URL",
      wabaId: "12345678901234",
    },
    ...overrides,
  };
}

export const acceptedResponse = () => new Response(JSON.stringify({
  messaging_product: "whatsapp", messages: [{ id: "wamid.synthetic123" }],
}), { status: 200, headers: { "Content-Type": "application/json" } });
