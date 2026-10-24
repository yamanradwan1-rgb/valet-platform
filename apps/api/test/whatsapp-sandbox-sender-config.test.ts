import { describe, expect, it, vi } from "vitest";
import {
  META_SANDBOX_PHONE_ID, META_SANDBOX_WABA_ID,
  sandboxSenderAssembly, sandboxSenderConfigResolver,
} from "../src/modules/notifications/worker/outbound-sandbox-sender";

const organizationId = "33333333-3333-4333-8333-333333333333";
const locationId = "44444444-4444-4444-8444-444444444444";
const bindingId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const recipient = "+962799123456";
const scope = {
  organizationId, locationId, bindingId,
  wabaId: META_SANDBOX_WABA_ID, phoneNumberId: META_SANDBOX_PHONE_ID,
  configAlias: "approved-test-alias", environment: "test" as const,
  templateVersion: "guest-access-catalog-1", language: "ar" as const,
};

function sandboxEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "development",
    OUTBOUND_MESSAGING_MODE: "test",
    OUTBOUND_MESSAGING_SEND_ENABLED: "true",
    OUTBOUND_META_SANDBOX_ACTIVATION_ENABLED: "true",
    META_WHATSAPP_GRAPH_VERSION: "v26.0",
    META_WHATSAPP_TEST_ACCESS_TOKEN: "synthetic-restricted-sender-token",
    META_WHATSAPP_TEST_TOKEN_REVOKED: "false",
    META_WHATSAPP_TEST_TOKEN_EXPIRES_AT: new Date(Date.now() + 3_600_000).toISOString(),
    META_WHATSAPP_TEST_CONFIG_ALIAS: "approved-test-alias",
    OUTBOUND_META_TEST_ORGANIZATION_ID: organizationId,
    OUTBOUND_META_TEST_LOCATION_ID: locationId,
    OUTBOUND_META_TEST_DATABASE_NAME: "issue310_sandbox",
    OUTBOUND_MESSAGING_WORKER_DATABASE_URL:
      "postgresql://synthetic_sender:synthetic_password@127.0.0.1:5432/issue310_sandbox",
    OUTBOUND_META_TEST_RECIPIENT_E164: recipient,
    GUEST_ACCESS_MESSAGE_ORIGIN: "https://customer.example.test",
    OUTBOUND_APPROVED_META_TEMPLATES_JSON: JSON.stringify([
      { organizationId, wabaId: META_SANDBOX_WABA_ID,
        catalogVersion: scope.templateVersion, locale: "ar" },
      { organizationId, wabaId: META_SANDBOX_WABA_ID,
        catalogVersion: scope.templateVersion, locale: "en" },
    ]),
    ...overrides,
  };
}

describe("Issue #310 sandbox sender — source of approved account authority", () => {
  it("assembles only the Meta test account and canonical BODY_ONE_URL template", async () => {
    const config = await sandboxSenderConfigResolver(sandboxEnv())(scope);
    expect(config).toMatchObject({
      bindingId, wabaId: META_SANDBOX_WABA_ID, phoneNumberId: META_SANDBOX_PHONE_ID,
      environment: "test", templateName: "guest_access", graphVersion: "v26.0",
      sandbox: {
        customerOrigin: "https://customer.example.test", allowedRecipient: recipient,
        template: { name: "guest_access", languageCode: "ar",
          locale: "ar", layout: "BODY_ONE_URL", status: "APPROVED" },
      },
    });
    expect((await sandboxSenderConfigResolver(sandboxEnv())({
      ...scope, language: "en",
    }))?.sandbox?.template.languageCode).toBe("en_US");
  });

  it.each([
    ["wrong WABA", { wabaId: "973567505807372" }],
    ["wrong phone ID", { phoneNumberId: "1297848693422065" }],
    ["production binding", { environment: "production" }],
    ["wrong secret alias", { configAlias: "forged-alias" }],
    ["unapproved catalog", { templateVersion: "other-catalog" }],
    ["wrong tenant", { organizationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }],
    ["wrong Location", { locationId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }],
  ] as const)("rejects %s even with a configured credential", async (_label, change) => {
    expect(await sandboxSenderConfigResolver(sandboxEnv())({
      ...scope, ...change,
    })).toBeUndefined();
  });

  it.each([
    ["missing activation", { OUTBOUND_META_SANDBOX_ACTIVATION_ENABLED: "false" }],
    ["production node", { NODE_ENV: "production" }],
    ["production mode", { OUTBOUND_MESSAGING_MODE: "production" }],
    ["missing token", { META_WHATSAPP_TEST_ACCESS_TOKEN: "" }],
    ["revoked token", { META_WHATSAPP_TEST_TOKEN_REVOKED: "true" }],
    ["expired token", { META_WHATSAPP_TEST_TOKEN_EXPIRES_AT: "2025-01-01T00:00:00Z" }],
    ["wrong Graph version", { META_WHATSAPP_GRAPH_VERSION: "v25.0" }],
    ["port-bearing Customer origin", { GUEST_ACCESS_MESSAGE_ORIGIN: "https://customer.example.test:8443" }],
    ["untrusted recipient", { OUTBOUND_META_TEST_RECIPIENT_E164: "962799123456" }],
    ["unattested Location", { OUTBOUND_META_TEST_LOCATION_ID: "" }],
    ["unattested Organization", { OUTBOUND_META_TEST_ORGANIZATION_ID: "" }],
    ["wrong database name", { OUTBOUND_META_TEST_DATABASE_NAME: "other_database" }],
    ["missing sender identity", { OUTBOUND_MESSAGING_WORKER_DATABASE_URL: "" }],
    ["missing registry", { OUTBOUND_APPROVED_META_TEMPLATES_JSON: "" }],
  ] as const)("fails closed for %s", async (_label, change) => {
    const env = sandboxEnv(change);
    if ("OUTBOUND_APPROVED_META_TEMPLATES_JSON" in change) {
      expect(await sandboxSenderConfigResolver(env)(scope)).toBeUndefined();
    } else {
      expect(() => sandboxSenderAssembly(env)).toThrow("OUTBOUND_META_SANDBOX_NOT_READY");
      expect(await sandboxSenderConfigResolver(env)(scope)).toBeUndefined();
    }
  });

  it("keeps the sender transport unavailable while send is OFF", async () => {
    const env = sandboxEnv({ OUTBOUND_MESSAGING_SEND_ENABLED: "false" });
    const assembly = sandboxSenderAssembly(env);
    const provider = assembly.createProvider({
      resolveAuthorizedMetaAttempt: vi.fn(async () => {
        throw new Error("resolver must not be called");
      }),
    } as never);
    const result = await provider.send({
      attemptHandle: "opaque", recipientE164: recipient, templateName: "guest_access",
      templateLanguage: "ar", guestUrl: "https://customer.example.test/#guestToken=" + "A".repeat(43),
      phoneNumberId: META_SANDBOX_PHONE_ID, accessToken: "synthetic-restricted-sender-token",
      graphVersion: "v26.0", signal: new AbortController().signal,
    });
    expect(result).toEqual({ kind: "PERMANENT", reason: "POLICY" });
  });

  it("posts only an exact SQL-authorized sandbox attempt to mocked Meta HTTP", async () => {
    const env = sandboxEnv();
    const approved = (await sandboxSenderConfigResolver(env)(scope))!.sandbox!;
    const account = {
      organizationId, locationId, bindingId,
      configAlias: scope.configAlias, environment: "test" as const,
      wabaId: META_SANDBOX_WABA_ID, phoneNumberId: META_SANDBOX_PHONE_ID,
      accessToken: env.META_WHATSAPP_TEST_ACCESS_TOKEN!, enabled: true,
      recipientE164: recipient, customerOrigin: approved.customerOrigin,
      template: approved.template, testRecipientAllowlist: [recipient],
    };
    const lookup = vi.fn(async (handle: string) => handle === "authorized-handle"
      ? account : null);
    const fetcher = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
      void _url;
      void _init;
      return new Response(JSON.stringify({
        messaging_product: "whatsapp", messages: [{ id: "wamid.synthetic.test123" }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetcher);
    try {
      const provider = sandboxSenderAssembly(env).createProvider({
        resolveAuthorizedMetaAttempt: lookup,
      } as never);
      const input = {
        attemptHandle: "authorized-handle",
        recipientE164: recipient,
        templateName: "guest_access",
        templateLanguage: "ar",
        guestUrl: "https://customer.example.test/#guestToken=" + "Z".repeat(43),
        phoneNumberId: META_SANDBOX_PHONE_ID,
        accessToken: env.META_WHATSAPP_TEST_ACCESS_TOKEN!,
        graphVersion: "v26.0",
        signal: new AbortController().signal,
      };
      expect(await provider.send({ ...input, attemptHandle: "forged-handle" }))
        .toEqual({ kind: "PERMANENT", reason: "POLICY" });
      expect(fetcher).not.toHaveBeenCalled();
      expect(await provider.send(input)).toEqual({
        kind: "ACCEPTED", providerMessageId: "wamid.synthetic.test123",
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
      const [url, init] = fetcher.mock.calls[0]!;
      expect(url).toBe(`https://graph.facebook.com/v26.0/${META_SANDBOX_PHONE_ID}/messages`);
      const body = JSON.parse(String(init?.body));
      expect(body.to).toBe(recipient.slice(1));
      expect(body.template).toEqual({
        name: "guest_access", language: { code: "ar" },
        components: [{ type: "body", parameters: [{
          type: "text", text: input.guestUrl,
        }] }],
      });
      env.META_WHATSAPP_TEST_CONFIG_ALIAS = "new-alias";
      expect(await provider.send(input)).toEqual({ kind: "PERMANENT", reason: "POLICY" });
      expect(fetcher).toHaveBeenCalledTimes(1);
      env.META_WHATSAPP_TEST_CONFIG_ALIAS = scope.configAlias;
      env.META_WHATSAPP_TEST_TOKEN_REVOKED = "true";
      expect(await provider.send(input)).toEqual({ kind: "PERMANENT", reason: "POLICY" });
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
