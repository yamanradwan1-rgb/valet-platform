import "reflect-metadata";

import { startOutboundMessageWorker } from "./outbound-message-worker";
import { createMetaCloudProvider } from "./modules/notifications/providers/meta-cloud-provider";
import { createOutboundWorkerPorts } from "./modules/notifications/worker/outbound-worker-composition";

/** Safe operational entrypoint for recovery/expiry while activation is gated. */
void startOutboundMessageWorker(async (senderPool) => {
  // Onboarding, recipient consent and verified AR/EN fragment template tests
  // have not been authorized/completed. Keep external sending fail-closed.
  if (process.env.OUTBOUND_MESSAGING_SEND_ENABLED === "true") {
    throw new Error("OUTBOUND_REAL_SENDING_ACTIVATION_GATE_CLOSED");
  }
  return createOutboundWorkerPorts(senderPool, process.env, {
    provider: createMetaCloudProvider({
      mode: "disabled",
      globallyEnabled: false,
      resolveAuthorizedAttempt: async () => null,
    }),
    resolveAuthorizedConfig: async () => undefined,
  });
});
