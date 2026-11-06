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
  readonly preservesBrowserContext?: true;
}

export function isRetryableGuestAuthBootstrapFailure(error: unknown): boolean {
  return (
    error instanceof GuestApiError &&
    (error.status === 429 || isAmbiguousGuestAuthMutationFailure(error))
  );
}

function isAmbiguousGuestAuthMutationFailure(error: unknown): boolean {
  return error instanceof GuestApiError &&
    (error.code === 'MUTATION_OUTCOME_UNKNOWN' ||
      error.isNetworkError || (error.status >= 500 && error.status <= 599));
}

export function isTerminalGuestAuthBootstrapFailure(error: unknown): boolean {
  return error instanceof GuestApiError &&
    error.status === 401 && error.code === 'GUEST_ACCESS_INVALID';
}

async function exchangeBrowserSessionWithRecovery(
  bootstrapClient: GuestApiClient,
  resumingExchange = false,
): Promise<void> {
  let outcomeMayBeCommitted = resumingExchange;
  try {
    try {
      await bootstrapClient.exchangeBrowserSession();
    } catch (error) {
      if (!isAmbiguousGuestAuthMutationFailure(error)) throw error;
      outcomeMayBeCommitted = true;
      await bootstrapClient.exchangeBrowserSession();
    }
  } catch (error) {
    if (!outcomeMayBeCommitted || !isTerminalGuestAuthBootstrapFailure(error)) throw error;
    // A cookie may authorize a different visit. Only the bearer-bound
    // exchange response can confirm this enrollment after an unknown outcome.
    throw guestAuthOutcomeUnknown();
  }
  // A fresh successful exchange adopts a new credential context. SAME_VISIT
  // bypasses this path and preserves deliberate presentation decisions.
  guestPresentationContext(true);
}

export function guestAuthOutcomeUnknown(): GuestApiError {
  return new GuestApiError({
    status: 0,
    code: 'MUTATION_OUTCOME_UNKNOWN',
    message: 'The Guest browser context could not be confirmed.',
  });
}

export async function switchGuestBrowserContextTransport(
  bootstrapClient: GuestApiClient,
  onAmbiguousOutcome?: () => void,
  hasOriginalSource?: () => boolean,
): Promise<void> {
  const attempt = () => {
    if (hasOriginalSource?.() === false) throw guestAuthOutcomeUnknown();
    return bootstrapClient.switchBrowserContext();
  };
  try {
    await attempt();
  } catch (error) {
    if (!isAmbiguousGuestAuthMutationFailure(error)) throw error;
    onAmbiguousOutcome?.();
    await attempt();
  }
}

export async function runGuestAuthBootstrap(
  fragmentToken: string | null,
  enrollmentEnabled: boolean,
  onStage?: (stage: GuestAuthBootstrapStage) => void,
  canStartExchange?: () => boolean,
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
      preservesBrowserContext: true,
    };
  }
  if (prepared.result === 'CONTEXT_CONFLICT') {
    return {
      token: fragmentToken,
      client: GuestApiClient.browserSession(),
      contextConflictScope: prepared.currentScope,
      preservesBrowserContext: true,
    };
  }

  if (canStartExchange?.() === false) throw new Error('Guest bootstrap lost ownership.');
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
  canStartExchange?: () => boolean,
): Promise<GuestAuthBootstrapResult> {
  if (enrollmentEnabled && retryStage === 'EXCHANGE') {
    if (fragmentToken === null) throw new Error('Missing Guest bootstrap bearer.');
    const bootstrapClient = new GuestApiClient(fragmentToken);
    await exchangeBrowserSessionWithRecovery(bootstrapClient, true);
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
  return runGuestAuthBootstrap(fragmentToken, enrollmentEnabled, onStage, canStartExchange);
}

export function completedBootstrapState(
  result: GuestAuthBootstrapResult,
): GuestTokenBootstrapState {
  return {
    token: result.token,
    client: result.client,
    contextConflictScope: result.contextConflictScope,
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
  client: GuestApiClient,
  error: unknown,
  retryStage: GuestAuthBootstrapStage,
): GuestTokenBootstrapState {
  if (isRetryableGuestAuthBootstrapFailure(error)) {
    return {
      token: fragmentToken,
      client,
      contextConflictScope: null,
      isComplete: true,
      isContextSwitching: false,
      isSwitchOutcomeAmbiguous: false,
      isTemporarilyUnavailable: true,
      retryStage,
      retryNotBefore: guestAuthRetryNotBefore(error) ?? undefined,
    };
  }
  return completedBootstrapState({ token: null, client, contextConflictScope: null });
}
