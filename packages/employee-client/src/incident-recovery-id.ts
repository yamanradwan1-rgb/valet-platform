import { incidentRecoveryIdSchema } from "@valet/contracts";

export function createIncidentRecoveryId(cryptoProvider?: {
  getRandomValues(array: Uint8Array): Uint8Array;
}): string {
  const provider = cryptoProvider ?? globalThis.crypto;
  if (typeof provider?.getRandomValues !== "function") {
    throw new Error("Secure UUID generation is unavailable.");
  }
  const bytes = provider.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x80;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0"));
  const value = [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
  return incidentRecoveryIdSchema.parse(value);
}
