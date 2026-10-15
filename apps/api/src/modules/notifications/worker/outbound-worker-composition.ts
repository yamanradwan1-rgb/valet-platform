import type { PostgresPool } from "../../../common/database/postgres";
import type { OutboundProvider } from "../contracts/outbound-provider";
import { OutboundDeliveryWorker } from "./outbound-delivery-worker";
import { PostgresOutboundLeaseRepository } from "./outbound-postgres-repository";
import { assertOutboundSenderPrivileges } from "./outbound-sender-preflight";
import { senderEnvelopeOpenerFromEnv } from "./outbound-worker-envelope-opener";
import type { OutboundWorkerLoopPorts } from "./outbound-worker-loop";
import { senderRecipientDigestFromEnv } from "./outbound-worker-recipient-digest";
import type { ResolveOutboundSenderConfig } from "./outbound-postgres-types";

/** Prime wires W3 approved-template/credential resolution in the sender only. */
export interface OutboundSenderAssembly {
  readonly provider: OutboundProvider;
  readonly resolveAuthorizedConfig: ResolveOutboundSenderConfig;
}

export function createOutboundWorkerPorts(
  pool: PostgresPool,
  env: NodeJS.ProcessEnv,
  assembly: OutboundSenderAssembly,
): OutboundWorkerLoopPorts {
  const sendEnabled = env.OUTBOUND_MESSAGING_SEND_ENABLED === "true";
  const mode = env.OUTBOUND_MESSAGING_MODE;
  if (sendEnabled &&
    (mode !== "test" && mode !== "production" ||
      (env.NODE_ENV === "production") !== (mode === "production"))) {
    throw new Error("OUTBOUND_SENDER_MODE_INVALID");
  }
  const requireReady = () => assertOutboundSenderPrivileges(pool);
  if (!sendEnabled) {
    return {
      leases: new PostgresOutboundLeaseRepository(pool, () => {
        throw new Error("OUTBOUND_SENDER_DISABLED");
      }, assembly.resolveAuthorizedConfig),
      worker: { runBatch: async () => 0 },
      checkReady: requireReady,
      sendingEnabled: false,
    };
  }

  const opener = senderEnvelopeOpenerFromEnv(env);
  const recipientDigest = senderRecipientDigestFromEnv(env);
  const origin = env.GUEST_ACCESS_MESSAGE_ORIGIN;
  if (!origin) throw new Error("OUTBOUND_SENDER_ORIGIN_NOT_READY");
  const leases = new PostgresOutboundLeaseRepository(
    pool, recipientDigest, assembly.resolveAuthorizedConfig,
  );
  return {
    leases,
    worker: new OutboundDeliveryWorker({
      leases,
      material: leases,
      opener,
      provider: assembly.provider,
      guestOrigin: origin,
    }),
    checkReady: requireReady,
    sendingEnabled: true,
  };
}
