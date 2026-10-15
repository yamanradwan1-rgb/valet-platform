import { vi } from "vitest";
import type { OutboundEnvelopeAAD, OutboundEnvelopeOpener } from "../src/modules/notifications/contracts/outbound-envelope";
import type { OutboundClaim, OutboundLeaseRepository } from "../src/modules/notifications/contracts/outbound-lease";
import type { OutboundProvider, OutboundSendInput } from "../src/modules/notifications/contracts/outbound-provider";
import type { OutboundPermitTransportSource, OutboundTransportMaterial } from "../src/modules/notifications/worker/outbound-transport-source";

export const syntheticClaim: OutboundClaim = {
  deliveryId: "11111111-1111-4111-8111-111111111111",
  leaseToken: "22222222-2222-4222-8222-222222222222",
  leaseExpiresAt: new Date("2026-10-16T00:00:00.000Z"),
};

const aad: OutboundEnvelopeAAD = {
  version: 1,
  organizationId: "33333333-3333-4333-8333-333333333333",
  locationId: "44444444-4444-4444-8444-444444444444",
  sessionId: "55555555-5555-4555-8555-555555555555",
  customerId: "66666666-6666-4666-8666-666666666666",
  intentId: "77777777-7777-4777-8777-777777777777",
  credentialGeneration: 1,
  recipientDigest: "test-keyed-hmac-only",
  expiresAt: "2026-10-16T00:00:00.000Z",
};

export const syntheticMaterial: OutboundTransportMaterial = {
  expectedAAD: aad,
  sealed: {
    algorithm: "RSA-OAEP-SHA256",
    keyVersion: "fixture-key",
    ciphertext: new Uint8Array([1, 2, 3]),
    aad,
    purgeAt: new Date("2026-10-16T00:00:00.000Z"),
  },
  recipientE164: "+962799123456",
  templateName: "guest_initial_access",
  templateLanguage: "ar",
  phoneNumberId: "1234567890123",
  accessToken: "synthetic-adapter-token",
  graphVersion: "v26.0",
};

export function createWorkerFakes() {
  const leases = {
    claimDue: vi.fn(async () => [syntheticClaim]),
    prepareDispatch: vi.fn(async () => ({
      kind: "DISPATCH" as const,
      attemptId: "88888888-8888-4888-8888-888888888888",
      attemptHandle: "opaque-attempt-handle",
      remainingMs: 30_000,
    })),
    finalizeAttempt: vi.fn(async () => undefined),
    expireAndPurge: vi.fn(async () => 0),
  } satisfies OutboundLeaseRepository;
  const material = {
    loadForPermit: vi.fn(async () => syntheticMaterial),
    confirmPermit: vi.fn(async () => ({ remainingMs: 25_000 })),
  } satisfies OutboundPermitTransportSource;
  const opener = {
    open: vi.fn(() => "A".repeat(43)),
  } satisfies OutboundEnvelopeOpener;
  const provider = {
    send: vi.fn(async (input: OutboundSendInput) => {
      void input;
      return { kind: "ACCEPTED" as const, providerMessageId: "provider-fixture-id" };
    }),
  } satisfies OutboundProvider;
  return { leases, material, opener, provider, guestOrigin: "https://guest.example.test" };
}
