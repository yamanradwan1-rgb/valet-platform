import { META_GRAPH_VERSION } from "../config/meta-cloud-policy";
import { META_SANDBOX_WABA_ID, META_SANDBOX_PHONE_ID } from "../config/meta-sandbox-assets";
import { createMetaCloudProvider } from "../providers/meta-cloud-provider";
import { templateApprovedForAccount } from "../whatsapp-template-authority";
import type { OutboundSenderAssembly } from "./outbound-worker-composition";
import type {
  OutboundVerifiedSenderConfig,
  ResolveOutboundSenderConfig,
} from "./outbound-postgres-types";

/** Deployment-pinned Meta *sandbox* assets. Never resolve a production account here. */
export { META_SANDBOX_WABA_ID, META_SANDBOX_PHONE_ID };

const e164 = /^\+[1-9][0-9]{7,14}$/;
const aliasPattern = /^[A-Za-z0-9._-]{1,64}$/;
const versionPattern = /^[A-Za-z0-9_.-]{1,64}$/;
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

interface SandboxAuthority {
  readonly credential: string;
  readonly credentialExpiresAt: number;
  readonly origin: string;
  readonly recipient: string;
  readonly alias: string;
  readonly organizationId: string;
  readonly locationId: string;
}

/** Both deployment and explicit sandbox switches are mandatory; production stays closed. */
function sandboxAuthority(env: NodeJS.ProcessEnv): SandboxAuthority | null {
  if ((env.NODE_ENV !== "development" && env.NODE_ENV !== "test") ||
      env.OUTBOUND_MESSAGING_MODE !== "test" ||
      env.OUTBOUND_MESSAGING_SEND_ENABLED !== "true" ||
      env.OUTBOUND_META_SANDBOX_ACTIVATION_ENABLED !== "true" ||
      env.META_WHATSAPP_GRAPH_VERSION !== META_GRAPH_VERSION ||
      env.META_WHATSAPP_TEST_TOKEN_REVOKED !== "false") return null;

  const credential = env.META_WHATSAPP_TEST_ACCESS_TOKEN;
  const recipient = env.OUTBOUND_META_TEST_RECIPIENT_E164;
  const alias = env.META_WHATSAPP_TEST_CONFIG_ALIAS;
  const organizationId = env.OUTBOUND_META_TEST_ORGANIZATION_ID;
  const locationId = env.OUTBOUND_META_TEST_LOCATION_ID;
  const expectedDbName = env.OUTBOUND_META_TEST_DATABASE_NAME;
  const senderDbUrl = env.OUTBOUND_MESSAGING_WORKER_DATABASE_URL;
  const rawOrigin = env.GUEST_ACCESS_MESSAGE_ORIGIN;
  const expires = env.META_WHATSAPP_TEST_TOKEN_EXPIRES_AT;
  if (!credential || credential.length > 4096 || /\s/.test(credential) ||
      !recipient || !e164.test(recipient) ||
      !alias || !aliasPattern.test(alias) ||
      !organizationId || !uuid.test(organizationId) ||
      !locationId || !uuid.test(locationId) ||
      !expectedDbName || !/^[A-Za-z0-9_-]{1,63}$/.test(expectedDbName) ||
      !senderDbUrl ||
      !rawOrigin || !expires ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(expires)) return null;
  const credentialExpiresAt = Date.parse(expires);
  if (!Number.isFinite(credentialExpiresAt) ||
      credentialExpiresAt <= Date.now() + 10_000) return null;
  try {
    const parsed = new URL(rawOrigin);
    const senderDb = new URL(senderDbUrl);
    if ((senderDb.protocol !== "postgresql:" && senderDb.protocol !== "postgres:") ||
        decodeURIComponent(senderDb.pathname.slice(1)) !== expectedDbName ||
        !senderDb.username || !senderDb.password) return null;
    if (parsed.protocol !== "https:" || !parsed.hostname ||
        parsed.username || parsed.password || parsed.port || parsed.pathname !== "/" ||
        parsed.search || parsed.hash ||
        (rawOrigin !== parsed.origin && rawOrigin !== `${parsed.origin}/`)) return null;
    return {
      credential,
      credentialExpiresAt,
      origin: parsed.origin,
      recipient,
      alias,
      organizationId,
      locationId,
    };
  } catch {
    return null;
  }
}

/** SQL already selected the exact verified binding and pinned policy revision. */
export function sandboxSenderConfigResolver(
  env: NodeJS.ProcessEnv,
): ResolveOutboundSenderConfig {
  return async (scope): Promise<OutboundVerifiedSenderConfig | undefined> => {
    const authority = sandboxAuthority(env);
    if (!authority || scope.environment !== "test" ||
        scope.organizationId !== authority.organizationId ||
        scope.locationId !== authority.locationId ||
        scope.wabaId !== META_SANDBOX_WABA_ID ||
        scope.phoneNumberId !== META_SANDBOX_PHONE_ID ||
        scope.configAlias !== authority.alias ||
        !versionPattern.test(scope.templateVersion) ||
        !templateApprovedForAccount(env, scope.organizationId, scope.wabaId,
          scope.templateVersion, scope.language)) return undefined;
    return {
      bindingId: scope.bindingId,
      phoneNumberId: scope.phoneNumberId,
      wabaId: scope.wabaId,
      environment: "test",
      accessToken: authority.credential,
      graphVersion: META_GRAPH_VERSION,
      templateName: "guest_access",
      templateVersion: scope.templateVersion,
      language: scope.language,
      sandbox: {
        customerOrigin: authority.origin,
        allowedRecipient: authority.recipient,
        credentialExpiresAt: authority.credentialExpiresAt,
        template: {
          catalogVersion: scope.templateVersion,
          locale: scope.language,
          languageCode: scope.language === "ar" ? "ar" : "en_US",
          name: "guest_access",
          status: "APPROVED",
          layout: "BODY_ONE_URL",
          wabaId: scope.wabaId,
        },
      },
    };
  };
}

/** Authenticated attempts are available only after a successful SQL confirm fence. */
export function sandboxSenderAssembly(env: NodeJS.ProcessEnv): OutboundSenderAssembly {
  if (env.OUTBOUND_MESSAGING_SEND_ENABLED === "true" && !sandboxAuthority(env)) {
    throw new Error("OUTBOUND_META_SANDBOX_NOT_READY");
  }
  return {
    resolveAuthorizedConfig: sandboxSenderConfigResolver(env),
    createProvider: (leases) => createMetaCloudProvider({
      mode: "test",
      globallyEnabled: sandboxAuthority(env) !== null,
      resolveAuthorizedAttempt: async (handle) => {
        const account = await leases.resolveAuthorizedMetaAttempt(handle);
        const current = sandboxAuthority(env);
        if (!account || !current || account.accessToken !== current.credential ||
            account.customerOrigin !== current.origin ||
            account.organizationId !== current.organizationId ||
            account.locationId !== current.locationId ||
            account.configAlias !== current.alias ||
            account.testRecipientAllowlist.length !== 1 ||
            account.testRecipientAllowlist[0] !== current.recipient ||
            !templateApprovedForAccount(env, account.organizationId,
              account.wabaId, account.template.catalogVersion,
              account.template.locale)) return null;
        return account;
      },
    }),
  };
}
