export interface ApiErrorResponsePayload {
  readonly code?: string | undefined;
  readonly message?: string | undefined;
  readonly retryAfter?: number | undefined;
}

export class GuestApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryAfter?: number | undefined;
  readonly isNetworkError: boolean;

  constructor(options: {
    status: number;
    code: string;
    message: string;
    retryAfter?: number | undefined;
    isNetworkError?: boolean | undefined;
  }) {
    super(options.message);
    this.name = 'GuestApiError';
    this.status = options.status;
    this.code = options.code;
    this.retryAfter = options.retryAfter;
    this.isNetworkError = options.isNetworkError ?? false;
  }
}

const safeMessagesByCode: Readonly<Record<string, string>> = {
  ANTI_ABUSE_UNAVAILABLE: 'Service temporarily unavailable. Please try again in a few moments.',
  GUEST_ACCESS_INVALID: 'This valet session link is invalid or has expired.',
  GUEST_ACCESS_RATE_LIMITED: 'Too many requests. Please wait a moment and try again.',
  GUEST_RATING_CONFLICT: 'A rating has already been recorded for this visit.',
  GUEST_RATING_NOT_AVAILABLE: 'Rating is not available for this visit.',
  HANDOFF_VERIFICATION_FAILED: 'Verification failed. Please check your pickup code or QR code.',
  HANDOFF_VERIFICATION_RATE_LIMITED: 'Too many verification attempts. Please wait a moment.',
  HANDOFF_VERIFICATION_NOT_ACTIVE: 'Vehicle is not currently ready for handoff.',
  HANDOFF_VERIFICATION_ALREADY_ISSUED: 'A pickup proof is already active. Use the allowed recovery option.',
  HANDOFF_VERIFICATION_ALREADY_VERIFIED: 'Pickup verification has already been completed.',
  MUTATION_OUTCOME_UNKNOWN: 'The action may have completed. Check current vehicle status before trying again.',
  REQUEST_TIMEOUT: 'The request timed out. Please try again.',
  INVALID_RESPONSE: 'The server response could not be processed.',
  GUEST_REQUEST_CANCELLED: 'The request was cancelled.',
  INVALID_STATE_TRANSITION: 'Unable to perform this action for the vehicle’s current state.',
  RETRIEVAL_REQUEST_NOT_READY: 'Retrieval request is not currently available for this vehicle.',
  VERSION_CONFLICT: 'The session state has changed. Refreshing your status...',
};

export function mapToGuestSafeMessage(status: number, payload?: unknown): {
  code: string;
  message: string;
  retryAfter?: number | undefined;
} {
  if (typeof payload === 'object' && payload !== null) {
    const errorObj = payload as ApiErrorResponsePayload;
    const code = typeof errorObj.code === 'string' ? errorObj.code : 'UNKNOWN_ERROR';
    const retryAfter = typeof errorObj.retryAfter === 'number' ? errorObj.retryAfter : undefined;

    if (safeMessagesByCode[code]) {
      return { code, message: safeMessagesByCode[code], retryAfter };
    }
  }

  if (status === 401 || status === 403) {
    return {
      code: 'GUEST_ACCESS_INVALID',
      message: 'This valet session link is invalid or has expired.',
    };
  }

  if (status === 429) {
    return {
      code: 'GUEST_ACCESS_RATE_LIMITED',
      message: 'Too many requests. Please wait a moment and try again.',
    };
  }

  if (status >= 500) {
    return {
      code: 'SERVICE_UNAVAILABLE',
      message: 'Service is temporarily unavailable. Please try again shortly.',
    };
  }

  return {
    code: 'REQUEST_FAILED',
    message: 'Unable to process your request. Please try again.',
  };
}
