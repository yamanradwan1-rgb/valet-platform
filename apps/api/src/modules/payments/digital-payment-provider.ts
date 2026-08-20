export interface DigitalCollectionInitiationInput {
  readonly amount: string;
  readonly currency: string;
  readonly operationId: string;
}

export type DigitalCollectionInitiationResult =
  | {
      readonly kind: "REFERENCE_ATTACHED";
      readonly providerReference: string;
      readonly safeResultCode: string | null;
    }
  | {
      readonly kind: "REJECTED";
      readonly safeResultCode: string | null;
    }
  | {
      readonly kind: "OUTCOME_UNKNOWN";
      readonly safeResultCode: string | null;
    };

export interface DigitalPaymentProviderPort {
  initiateCollection(
    input: DigitalCollectionInitiationInput,
  ): Promise<DigitalCollectionInitiationResult>;
}

export interface DigitalProviderBindingContext {
  readonly locationId: string;
  readonly organizationId: string;
  readonly paymentId: string;
}

export abstract class DigitalPaymentProviderRegistry {
  abstract configuredProviderFor(
    context: DigitalProviderBindingContext,
  ): string | null;

  abstract providerFor(provider: string): DigitalPaymentProviderPort | null;
}

export class UnconfiguredDigitalPaymentProviderRegistry extends DigitalPaymentProviderRegistry {
  configuredProviderFor(): null {
    return null;
  }

  providerFor(): null {
    return null;
  }
}
