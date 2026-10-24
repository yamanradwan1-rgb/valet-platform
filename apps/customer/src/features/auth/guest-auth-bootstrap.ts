import { GuestApiError } from '../../lib/api/api-error';
import { GuestApiClient } from '../../lib/api/guest-api-client';
import { guestPresentationContext } from '../../lib/guest-presentation-context';
import { guestAuthRetryNotBefore } from './guest-auth-rate-limit';

export type GuestContextConflictScope = 'ACTIVE' | 'POST_VISIT';
export type GuestAuthBootstrapStage = 'PREPARE' | 'EXCHANGE' | 'RECONCILE_SWITCH';

export interface GuestTokenBootstrapState {
  readonly token: string | null;
  readonly client: GuestApiClient | null;
  readonly contextConflictScope: GuestContextConflictScope | null;
  readonly isComplete: boolean;
  readonly isContextSwitching: boolean;
  readonly isSwitchOutcomeAmbiguous: boolean;
  readonly isTemporarilyUnavailable: boolean;
  readonly retryStage: GuestAuthBootstrapStage | null;
  readonly retryNotBefore?: number | undefined;
}

export interface GuestAuthBootstrapResult {
  readonly token: string | null;
  readonly client: GuestApiClient;
  readonly contextConflictScope: GuestContextConflictScope | null;
}

export function isRetryableGuestAuthBootstrapFailure(error: unknown): boolean {
  return (
    error instanceof GuestApiError &&
    (error.status === 429 || error.isNetworkError || (error.status >= 500 && error.status <= 599))
  );
}

function isAmbiguousGuestAuthMutationFailure(error: unknown): boolean {
  return error instanceof GuestApiError &&
    (error.isNetworkError || (error.status >= 500 && error.status <= 599));
}

function isTerminalGuestAuthBootstrapFailure(error: unknown): boolean {
  return error instanceof GuestApiError &&
    error.status !== 429 && error.code === 'GUEST_ACCESS_INVALID';
}

async function exchangeBrowserSessionWithRecovery(
  bootstrapClient: GuestApiClient,
): Promise<void> {
  try {
    await bootstrapClient.exchangeBrowserSession();
  } catch (error) {
    if (!isAmbiguousGuestAuthMutationFailure(error)) throw error;
    await bootstrapClient.exchangeBrowserSession();
  }
  // A fresh successful exchange adopts a new credential context. SAME_VISIT
  // bypasses this path and preserves deliberate presentation decisions.
  guestPresentationContext(true);
}

export async function switchGuestBrowserContextTransport(
  bootstrapClient: GuestApiClient,
): Promise<void> {
  try {
    await bootstrapClient.switchBrowserContext();
  } catch (error) {
    if (!isAmbiguousGuestAuthMutationFailure(error)) throw error;
    await bootstrapClient.switchBrowserContext();
  }
}

export async function runGuestAuthBootstrap(
  fragmentToken: string | null,
  enrollmentEnabled: boolean,
  onStage?: (stage: GuestAuthBootstrapStage) => void,
): Promise<GuestAuthBootstrapResult> {
  if (fragmentToken === null) {
    const browserClient = GuestApiClient.browserSession();
    if (enrollmentEnabled) {
      onStage?.('RECONCILE_SWITCH');
      await browserClient.reconcileBrowserContextSwitch();
    }
    return {
      token: null,
      client: GuestApiClient.browserSession(),
      contextConflictScope: null,
    };
  }

  if (!enrollmentEnabled) {
    return {
      token: fragmentToken,
      client: new GuestApiClient(fragmentToken),
      contextConflictScope: null,
    };
  }

  const bootstrapClient = new GuestApiClient(fragmentToken);
  onStage?.('PREPARE');
  const prepared = await bootstrapClient.prepareBrowserSession();
  if (prepared.result === 'SAME_VISIT') {
    return {
      token: null,
      client: GuestApiClient.browserSession(),
      contextConflictScope: null,
    };
  }
  if (prepared.result === 'CONTEXT_CONFLICT') {
    return {
      token: fragmentToken,
      client: GuestApiClient.browserSession(),
      contextConflictScope: prepared.currentScope,
    };
  }

  onStage?.('EXCHANGE');
  await exchangeBrowserSessionWithRecovery(bootstrapClient);
  return {
    token: null,
    client: GuestApiClient.browserSession(),
    contextConflictScope: null,
  };
}

export async function bootstrapGuestAuthTransport(
  fragmentToken: string | null,
  enrollmentEnabled: boolean,
): Promise<GuestAuthBootstrapResult> {
  return runGuestAuthBootstrap(fragmentToken, enrollmentEnabled);
}

export async function retryGuestAuthBootstrapTransport(
  fragmentToken: string | null,
  enrollmentEnabled: boolean,
  retryStage: GuestAuthBootstrapStage,
  onStage?: (stage: GuestAuthBootstrapStage) => void,
): Promise<GuestAuthBootstrapResult> {
  if (enrollmentEnabled && retryStage === 'EXCHANGE') {
    if (fragmentToken === null) throw new Error('Missing Guest bootstrap bearer.');
    const bootstrapClient = new GuestApiClient(fragmentToken);
    await exchangeBrowserSessionWithRecovery(bootstrapClient);
    return {
      token: null,
      client: GuestApiClient.browserSession(),
      contextConflictScope: null,
    };
  }
  if (enrollmentEnabled && retryStage === 'RECONCILE_SWITCH') {
    const browserClient = GuestApiClient.browserSession();
    await browserClient.reconcileBrowserContextSwitch();
    return {
      token: null,
      client: GuestApiClient.browserSession(),
      contextConflictScope: null,
    };
  }
  return runGuestAuthBootstrap(fragmentToken, enrollmentEnabled, onStage);
}

export function completedBootstrapState(
  result: GuestAuthBootstrapResult,
): GuestTokenBootstrapState {
  return {
    ...result,
    isComplete: true,
    isContextSwitching: false,
    isSwitchOutcomeAmbiguous: false,
    isTemporarilyUnavailable: false,
    retryStage: null,
  };
}

export function continueCurrentGuestVisitState(
  current: GuestTokenBootstrapState,
): GuestTokenBootstrapState {
  if (current.isSwitchOutcomeAmbiguous) return current;
  return {
    ...current,
    token: null,
    contextConflictScope: null,
    isContextSwitching: false,
    isSwitchOutcomeAmbiguous: false,
  };
}

export function beginGuestContextSwitchState(
  current: GuestTokenBootstrapState,
): GuestTokenBootstrapState {
  return { ...current, isContextSwitching: true };
}

export function failedGuestContextSwitchState(
  current: GuestTokenBootstrapState,
  error: unknown,
): GuestTokenBootstrapState {
  if (error instanceof GuestApiError && error.status === 429) {
    return {
      ...current,
      isContextSwitching: false,
      isSwitchOutcomeAmbiguous: false,
      retryNotBefore: guestAuthRetryNotBefore(error) ?? undefined,
    };
  }
  if (isAmbiguousGuestAuthMutationFailure(error)) {
    return {
      ...current,
      isContextSwitching: false,
      isSwitchOutcomeAmbiguous: true,
    };
  }
  return {
    ...current,
    token: null,
    contextConflictScope: null,
    isContextSwitching: false,
    isSwitchOutcomeAmbiguous: false,
  };
}

export function failedBootstrapState(
  fragmentToken: string | null,
  enrollmentEnabled: boolean,
  error: unknown,
  retryStage: GuestAuthBootstrapStage,
): GuestTokenBootstrapState {
  const browserClient = enrollmentEnabled ? GuestApiClient.browserSession() : null;
  if (enrollmentEnabled && isRetryableGuestAuthBootstrapFailure(error)) {
    return {
      token: fragmentToken,
      client: browserClient,
      contextConflictScope: null,
      isComplete: true,
      isContextSwitching: false,
      isSwitchOutcomeAmbiguous: false,
      isTemporarilyUnavailable: true,
      retryStage,
      retryNotBefore: guestAuthRetryNotBefore(error) ?? undefined,
    };
  }
  if (enrollmentEnabled && isTerminalGuestAuthBootstrapFailure(error)) {
    return {
      token: null,
      client: browserClient,
      contextConflictScope: null,
      isComplete: true,
      isContextSwitching: false,
      isSwitchOutcomeAmbiguous: false,
      isTemporarilyUnavailable: false,
      retryStage: null,
    };
  }
  return {
    token: enrollmentEnabled ? fragmentToken : null,
    client: browserClient,
    contextConflictScope: null,
    isComplete: true,
    isContextSwitching: false,
    isSwitchOutcomeAmbiguous: false,
    isTemporarilyUnavailable: false,
    retryStage: null,
  };
}
