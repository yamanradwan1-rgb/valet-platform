import { ProviderEventError } from "./provider-event-errors";
import type {
  AuthenticatedProviderEvent,
  NormalizedProviderEvent,
  ProviderEventKind,
} from "./provider-event-types";

const canonicalUuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const safeCodePattern = /^[A-Z0-9][A-Z0-9_.:-]{0,99}$/;
const kinds = new Set<ProviderEventKind>([
  "COLLECTION_SUCCEEDED",
  "COLLECTION_FAILED",
  "REFUND_SUCCEEDED",
  "REFUND_FAILED",
  "NO_FINANCIAL_CHANGE",
]);

function boundedText(value: unknown, maximum: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maximum) return null;
  return [...normalized].every((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code > 31 && code !== 127;
  })
    ? normalized
    : null;
}

function optionalReference(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  return boundedText(value, 400) ?? undefined;
}

function optionalSafeCode(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  return typeof value === "string" && safeCodePattern.test(value)
    ? value
    : undefined;
}

function reject(): never {
  throw new ProviderEventError("PROVIDER_EVENT_REJECTED");
}

export function validateAuthenticatedProviderEvent(
  value: unknown,
): AuthenticatedProviderEvent {
  if (typeof value !== "object" || value === null) return reject();
  const envelope = value as Record<string, unknown>;
  if (typeof envelope.binding !== "object" || envelope.binding === null)
    return reject();
  if (typeof envelope.event !== "object" || envelope.event === null)
    return reject();
  const binding = envelope.binding as Record<string, unknown>;
  const candidate = envelope.event as Record<string, unknown>;
  const organizationId = binding.organizationId;
  const provider = boundedText(binding.provider, 100);
  const kind = candidate.kind;
  const providerEventId = boundedText(candidate.providerEventId, 200);
  const providerReference = optionalReference(candidate.providerReference);
  const safeResultCode = optionalSafeCode(candidate.safeResultCode);
  if (
    typeof organizationId !== "string" ||
    !canonicalUuid.test(organizationId) ||
    provider === null ||
    typeof kind !== "string" ||
    !kinds.has(kind as ProviderEventKind) ||
    providerEventId === null ||
    providerReference === undefined ||
    safeResultCode === undefined
  ) {
    return reject();
  }
  const normalizedKind = kind as ProviderEventKind;
  let event: NormalizedProviderEvent;
  if (kind === "REFUND_SUCCEEDED" || kind === "REFUND_FAILED") {
    if (
      typeof candidate.refundId !== "string" ||
      !canonicalUuid.test(candidate.refundId)
    )
      return reject();
    if (kind === "REFUND_SUCCEEDED" && providerReference === null)
      return reject();
    event = {
      kind: normalizedKind as "REFUND_SUCCEEDED" | "REFUND_FAILED",
      providerEventId,
      providerReference,
      refundId: candidate.refundId,
      safeResultCode,
      subject: "REFUND",
    };
  } else {
    if (
      typeof candidate.operationId !== "string" ||
      !canonicalUuid.test(candidate.operationId)
    )
      return reject();
    if (kind !== "NO_FINANCIAL_CHANGE" && providerReference === null)
      return reject();
    event = {
      kind: normalizedKind as
        "COLLECTION_SUCCEEDED" | "COLLECTION_FAILED" | "NO_FINANCIAL_CHANGE",
      operationId: candidate.operationId,
      providerEventId,
      providerReference,
      safeResultCode,
      subject: "COLLECTION",
    };
  }
  return { binding: { organizationId, provider }, event };
}
