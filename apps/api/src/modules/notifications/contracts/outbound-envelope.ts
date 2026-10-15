/** Never include raw bearer material in database rows, diagnostics or traces. */
export interface OutboundEnvelopeAAD {
  readonly version: 1;
  readonly organizationId: string;
  readonly locationId: string;
  readonly sessionId: string;
  readonly customerId: string;
  readonly intentId: string;
  readonly credentialGeneration: number;
  readonly recipientDigest: string;
  readonly expiresAt: string;
}

export interface SealedOutboundEnvelope {
  readonly algorithm: "RSA-OAEP-SHA256";
  readonly keyVersion: string;
  readonly ciphertext: Uint8Array;
  readonly aad: OutboundEnvelopeAAD;
  readonly purgeAt: Date;
}

/** Public key in the issuer; only isolated sender has the corresponding private key. */
export interface OutboundEnvelopeSealer {
  seal(token: string, aad: OutboundEnvelopeAAD): SealedOutboundEnvelope;
}

export interface OutboundEnvelopeOpener {
  open(sealed: SealedOutboundEnvelope, expectedAAD: OutboundEnvelopeAAD): string;
}
