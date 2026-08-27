export interface TruthfulLogoutDependencies {
  readonly clearRefreshTimer: () => void;
  readonly clearSession: () => void;
  readonly markFailed: () => void;
  readonly markSignedOut: () => void;
  readonly markStarted: () => void;
  readonly publishSignedOut: () => void;
  readonly runLocked: (action: () => Promise<void>) => Promise<void>;
  readonly serverLogout: () => Promise<void>;
}

/**
 * Completes local sign-out only after the server confirms revocation.
 *
 * A failed request is an unknown revocation result: the refresh cookie may
 * still identify a live server session. The current tab discards its bearer
 * to fail closed, publishes no sibling event, and moves to a blocked retry
 * posture. A later restore remains free to report the server's truth.
 */
export async function runTruthfulLogout(
  dependencies: TruthfulLogoutDependencies,
): Promise<void> {
  dependencies.markStarted();
  try {
    await dependencies.runLocked(async () => {
      dependencies.clearRefreshTimer();
      await dependencies.serverLogout();
      dependencies.clearSession();
      dependencies.markSignedOut();
      dependencies.publishSignedOut();
    });
  } catch (error) {
    dependencies.clearRefreshTimer();
    dependencies.clearSession();
    dependencies.markFailed();
    throw error;
  }
}
