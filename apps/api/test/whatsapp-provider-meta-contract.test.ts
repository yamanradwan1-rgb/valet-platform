import { describe, expect, it, vi } from "vitest";
import { createMetaCloudProvider } from "../src/modules/notifications/providers/meta-cloud-provider.js";
import { acceptedResponse, syntheticAccount, syntheticInput, syntheticUrl } from "./whatsapp-provider-fixture.js";

const accepted = { kind: "ACCEPTED", providerMessageId: "wamid.synthetic123" };

describe("Meta outbound provider — immutable account, templates and transport", () => {
  it("stays disabled by default and does not access secrets or network", async () => {
    const resolver = vi.fn(async () => syntheticAccount());
    const fetcher = vi.fn(async () => acceptedResponse());
    const result = await createMetaCloudProvider({
      resolveAuthorizedAttempt: resolver, fetchImpl: fetcher,
    }).send(syntheticInput());
    expect(result).toEqual({ kind: "PERMANENT", reason: "POLICY" });
    expect(resolver).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(["en", "ar"] as const)("uses approved exact %s template and only fixed Meta host", async (locale) => {
    const name = `guest_access_${locale}_v1`;
    const account = syntheticAccount({ template: {
      catalogVersion: "guest-1", locale, name, status: "APPROVED",
      languageCode: locale === "ar" ? "ar" : "en_US", layout: "BODY_ONE_URL",
      wabaId: "12345678901234",
    } });
    const fetcher = vi.fn(async (...args: Parameters<typeof fetch>) => {
      void args;
      return acceptedResponse();
    });
    const result = await createMetaCloudProvider({
      resolveAuthorizedAttempt: async () => account, mode: "test", globallyEnabled: true,
      fetchImpl: fetcher,
    }).send(syntheticInput({ templateName: name, templateLanguage: locale }));
    expect(result).toEqual(accepted);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://graph.facebook.com/v26.0/123456789012345/messages");
    expect(options?.method).toBe("POST");
    expect(options?.redirect).toBe("error");
    const payload = JSON.parse(String(options?.body));
    expect(payload).toEqual({
      messaging_product: "whatsapp", recipient_type: "individual", to: "962790000001",
      type: "template", biz_opaque_callback_data: "synthetic_random_attempt_123456789",
      template: {
        name, language: { code: locale === "ar" ? "ar" : "en_US" },
        components: [{ type: "body", parameters: [{ type: "text", text: syntheticUrl }] }],
      },
    });
    expect(options?.headers).toMatchObject({ Authorization: "Bearer synthetic-meta-test-credential" });
  });

  it("rejects disabled binding, wrong mode and resolver errors without a POST", async () => {
    const fetcher = vi.fn(async () => acceptedResponse());
    const providerFor = (account: ReturnType<typeof syntheticAccount> | null) =>
      createMetaCloudProvider({ resolveAuthorizedAttempt: async () => account,
        mode: "test", globallyEnabled: true, fetchImpl: fetcher });
    for (const account of [null, syntheticAccount({ enabled: false }),
      syntheticAccount({ environment: "production" })]) {
      expect(await providerFor(account).send(syntheticInput()))
        .toEqual({ kind: "PERMANENT", reason: "POLICY" });
    }
    expect(await createMetaCloudProvider({
      resolveAuthorizedAttempt: async () => { throw new Error("contains sensitive info"); },
      mode: "test", globallyEnabled: true, fetchImpl: fetcher,
    }).send(syntheticInput())).toEqual({ kind: "PERMANENT", reason: "POLICY" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("refuses test recipients not allowlisted and tenant number/token substitution", async () => {
    const fetcher = vi.fn(async () => acceptedResponse());
    const provider = createMetaCloudProvider({ resolveAuthorizedAttempt: async () => syntheticAccount(),
      mode: "test", globallyEnabled: true, fetchImpl: fetcher });
    const invalidInputs = [
      { recipientE164: "+962790000002" }, { phoneNumberId: "56789012345" },
      { phoneNumberId: "123456789012345/messages" }, { graphVersion: "v25.0" },
      { accessToken: "wrong-bearer" }, { templateName: "hello_world" },
      { templateLanguage: "en_US" },
      { guestUrl: syntheticUrl.replace("guest.example.test", "other.example.test") },
      { guestUrl: `https://guest.example.test/evil#guestToken=${"A".repeat(43)}` },
      { guestUrl: "https://guest.example.test/#guestToken=too-short" },
    ];
    for (const entry of invalidInputs) {
      expect(await provider.send(syntheticInput(entry))).toEqual({ kind: "PERMANENT", reason: "POLICY" });
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects forged template approvals and mismatched WABA", async () => {
    const fetcher = vi.fn(async () => acceptedResponse());
    for (const template of [
      { ...syntheticAccount().template, status: "PENDING" as "APPROVED" },
      { ...syntheticAccount().template, wabaId: "99999999999" },
      { ...syntheticAccount().template, languageCode: "ar" as "en_US" },
    ]) {
      const provider = createMetaCloudProvider({
        resolveAuthorizedAttempt: async () => syntheticAccount({ template }),
        mode: "test", globallyEnabled: true, fetchImpl: fetcher,
      });
      expect(await provider.send(syntheticInput())).toEqual({ kind: "PERMANENT", reason: "POLICY" });
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not POST if an attempt expires while resolving tenant configuration", async () => {
    const controller = new AbortController();
    let finishResolution!: (value: ReturnType<typeof syntheticAccount>) => void;
    const fetcher = vi.fn(async () => acceptedResponse());
    const provider = createMetaCloudProvider({
      resolveAuthorizedAttempt: async () => new Promise((resolve) => { finishResolution = resolve; }),
      mode: "test", globallyEnabled: true, fetchImpl: fetcher,
    });
    const pending = provider.send(syntheticInput({ signal: controller.signal }));
    controller.abort();
    finishResolution(syntheticAccount());
    expect(await pending).toEqual({ kind: "UNKNOWN", reason: "TRANSPORT" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
