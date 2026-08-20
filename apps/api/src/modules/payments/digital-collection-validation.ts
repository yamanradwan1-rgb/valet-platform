import { DigitalCollectionError } from "./digital-collection-errors";
import type { InitiateDigitalCollectionRequest } from "./digital-collection-types";
import type {
  DigitalCollectionInitiationResult,
  DigitalPaymentProviderPort,
  DigitalPaymentProviderRegistry,
  DigitalProviderBindingContext,
} from "./digital-payment-provider";

const canonicalUuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const normalizedSafeCode = /^[A-Z0-9][A-Z0-9_.:-]{0,99}$/;

function isNormalizedReference(value: string): boolean {
  return (
    value.length >= 1 &&
    value.length <= 400 &&
    [...value].every((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code > 31 && code !== 127;
    })
  );
}

export function validateDigitalCollectionRequest(
  request: InitiateDigitalCollectionRequest,
): void {
  if (
    typeof request.valetSessionId !== "string" ||
    !canonicalUuid.test(request.valetSessionId) ||
    typeof request.submissionIdempotencyKey !== "string" ||
    request.submissionIdempotencyKey.length > 200 ||
    request.submissionIdempotencyKey.trim() === "" ||
    request.submissionIdempotencyKey.includes("\0")
  ) {
    throw new DigitalCollectionError("DIGITAL_COLLECTION_STATE_CONFLICT");
  }
}

export function normalizeProviderIdentifier(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length <= 100 && isNormalizedReference(normalized)
    ? normalized
    : null;
}

export function resolveConfiguredProvider(
  registry: DigitalPaymentProviderRegistry,
  context: DigitalProviderBindingContext,
): string | null {
  try {
    return normalizeProviderIdentifier(registry.configuredProviderFor(context));
  } catch {
    return null;
  }
}

export function resolveDigitalProvider(
  registry: DigitalPaymentProviderRegistry,
  provider: string,
): DigitalPaymentProviderPort | null {
  try {
    return registry.providerFor(provider);
  } catch {
    return null;
  }
}

function safeCode(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === "string" && normalizedSafeCode.test(value)
    ? value
    : undefined;
}

export function normalizeDigitalCollectionResult(
  value: unknown,
): DigitalCollectionInitiationResult {
  if (typeof value !== "object" || value === null) {
    return { kind: "OUTCOME_UNKNOWN", safeResultCode: null };
  }
  const candidate = value as Record<string, unknown>;
  const code = safeCode(candidate.safeResultCode);
  if (code === undefined) {
    return { kind: "OUTCOME_UNKNOWN", safeResultCode: null };
  }
  if (candidate.kind === "OUTCOME_UNKNOWN") {
    return { kind: "OUTCOME_UNKNOWN", safeResultCode: code };
  }
  if (candidate.kind === "REJECTED") {
    return { kind: "REJECTED", safeResultCode: code };
  }
  if (
    candidate.kind === "REFERENCE_ATTACHED" &&
    typeof candidate.providerReference === "string"
  ) {
    const reference = candidate.providerReference.trim();
    if (isNormalizedReference(reference)) {
      return {
        kind: "REFERENCE_ATTACHED",
        providerReference: reference,
        safeResultCode: code,
      };
    }
  }
  return { kind: "OUTCOME_UNKNOWN", safeResultCode: null };
}
