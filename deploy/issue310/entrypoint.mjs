import { readFileSync, existsSync } from "node:fs";

const service = process.env.WA310_RUNTIME_SERVICE;
const root = "/run/wa310";
const readMaterial = (name) => readFileSync(`${root}/${name}`, "utf8");

if (service === "api") {
  process.env.GUEST_ACCESS_TRANSPORT_PUBLIC_KEY_PEM = readMaterial("transport-public.pem");
  await import("../../apps/api/dist/main.js");
} else if (service === "sender") {
  process.env.GUEST_ACCESS_TRANSPORT_PRIVATE_KEY_PEM = readMaterial("transport-private.pem");
  if (existsSync(`${root}/meta-access-token`)) {
    process.env.META_WHATSAPP_TEST_ACCESS_TOKEN = readMaterial("meta-access-token").trim();
  }
  await import("../../apps/api/dist/outbound-message-worker-run.js");
} else if (service === "customer") {
  await import("../../apps/customer/scripts/start-production.mjs");
} else {
  throw new Error("Unexpected isolated Issue310 service identity.");
}
