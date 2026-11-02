export class MfaDisableNotAllowedError extends Error {
  readonly code = "MFA_DISABLE_NOT_ALLOWED";
  constructor() {
    super("MFA disabling is not available for this account.");
  }
}

export class MfaStateChangedError extends Error {
  readonly code = "MFA_STATE_CHANGED";
  constructor() {
    super("Account security changed. Refresh and try again.");
  }
}

export class MfaOperationBusyError extends Error {
  readonly code = "MFA_OPERATION_BUSY";
  constructor() {
    super("Account security is busy. Refresh and try again.");
  }
}

export function isMfaLockConflict(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === "55P03" || code === "40P01" || code === "40001";
}
