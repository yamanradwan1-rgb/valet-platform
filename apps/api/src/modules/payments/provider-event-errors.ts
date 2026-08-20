export type ProviderEventErrorCode =
  "PROVIDER_EVENT_REJECTED" | "PROVIDER_EVENT_PROCESSING_FAILED";

const messages: Record<ProviderEventErrorCode, string> = {
  PROVIDER_EVENT_PROCESSING_FAILED: "Provider event processing failed.",
  PROVIDER_EVENT_REJECTED: "Provider event was rejected.",
};

export class ProviderEventError extends Error {
  readonly code: ProviderEventErrorCode;

  constructor(code: ProviderEventErrorCode) {
    super(messages[code]);
    this.code = code;
    this.name = "ProviderEventError";
  }
}
