import "reflect-metadata";

import { startOutboundMessageWorker } from "./outbound-message-worker";
import { createOutboundWorkerPorts } from "./modules/notifications/worker/outbound-worker-composition";
import { sandboxSenderAssembly } from "./modules/notifications/worker/outbound-sandbox-sender";

/** Dedicated sender: cleanup remains available with outbound sending switched OFF. */
void startOutboundMessageWorker(async (senderPool) => {
  return createOutboundWorkerPorts(senderPool, process.env,
    sandboxSenderAssembly(process.env));
});
