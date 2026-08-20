export type ProviderEventKind =
  | "COLLECTION_SUCCEEDED"
  | "COLLECTION_FAILED"
  | "REFUND_SUCCEEDED"
  | "REFUND_FAILED"
  | "NO_FINANCIAL_CHANGE";

interface NormalizedProviderEventBase {
  readonly kind: ProviderEventKind;
  readonly providerEventId: string;
  readonly providerReference: string | null;
  readonly safeResultCode: string | null;
}

export interface NormalizedCollectionProviderEvent extends NormalizedProviderEventBase {
  readonly kind:
    "COLLECTION_SUCCEEDED" | "COLLECTION_FAILED" | "NO_FINANCIAL_CHANGE";
  readonly operationId: string;
  readonly subject: "COLLECTION";
}

export interface NormalizedRefundProviderEvent extends NormalizedProviderEventBase {
  readonly kind: "REFUND_SUCCEEDED" | "REFUND_FAILED";
  readonly refundId: string;
  readonly subject: "REFUND";
}

export type NormalizedProviderEvent =
  NormalizedCollectionProviderEvent | NormalizedRefundProviderEvent;

export interface AuthenticatedProviderEvent {
  readonly binding: {
    readonly organizationId: string;
    readonly provider: string;
  };
  readonly event: NormalizedProviderEvent;
}

export interface ProviderEventAuthenticator {
  authenticateAndNormalize(raw: unknown): Promise<unknown>;
}

export interface ProviderEventProcessingResult {
  readonly duplicate: boolean;
  readonly eventId: string | null;
  readonly persisted: boolean;
  readonly processingStatus: "PROCESSED" | "IGNORED";
}

export interface ProviderEventProcessorOptions {
  readonly auditEventIdFactory?: () => string;
  readonly eventIdFactory?: () => string;
}

export type ProviderEventIngress = (
  raw: unknown,
) => Promise<ProviderEventProcessingResult>;
