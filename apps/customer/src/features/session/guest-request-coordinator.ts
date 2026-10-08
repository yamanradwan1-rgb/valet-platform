import { GuestApiError } from '../../lib/api/api-error';
import type { GuestApiClient } from '../../lib/api/guest-api-client';
import type { GuestSafeSession } from '../../lib/api/guest-api-types';
import { retainCurrentSessionBranding } from './client-bound-session';
import { GUEST_FOREGROUND_STALE_TARGET_MS } from './guest-read-schedule';

export interface GuestCoordinatorState {
  readonly session: GuestSafeSession | null;
  readonly lastAuthoritativeAt: number | null;
  readonly lastAttemptAt: number | null;
  readonly isReading: boolean;
  readonly isMutating: boolean;
  readonly error: unknown;
  readonly isExpired: boolean;
  readonly cooldownUntil: number;
  readonly mutationCooldownUntil: number;
  readonly failures: number;
}

export interface GuestMutationTicket {
  readonly isCurrent: () => boolean;
  readonly finish: (session?: GuestSafeSession, failure?: unknown) => Promise<void>;
}
export type BeginGuestMutation = () => GuestMutationTicket | null;

// All Guest session reads and protected mutations share this single ownership boundary.
// The server always supplies session authority; this object only orders browser effects.
export class GuestRequestCoordinator {
  private state: GuestCoordinatorState;
  private readPromise: Promise<void> | null = null;
  private readAbort: AbortController | null = null;
  private readGeneration = 0;
  private mutationGeneration = 0;
  private pendingMutation = 0;
  private disposed = false;
  private lastUserOrWakeTriggerAt = -Infinity;

  constructor(
    readonly client: GuestApiClient,
    private readonly publish: (state: GuestCoordinatorState) => void,
    private readonly acceptSession: (session: GuestSafeSession) => void,
    initialSession: GuestSafeSession | null = null,
    private readonly now: () => number = Date.now,
  ) {
    this.state = {
      session: initialSession,
      lastAuthoritativeAt: null,
      lastAttemptAt: null,
      isReading: false,
      isMutating: false,
      error: null,
      isExpired: false,
      cooldownUntil: 0,
      mutationCooldownUntil: 0,
      failures: 0,
    };
  }

  get snapshot(): GuestCoordinatorState {
    return this.state;
  }

  get isCurrent(): boolean {
    return !this.disposed;
  }

  get isTrusted(): boolean {
    return this.isFresh() && !this.state.isMutating &&
      this.now() >= this.state.mutationCooldownUntil;
  }

  isFresh(maxAgeMilliseconds = GUEST_FOREGROUND_STALE_TARGET_MS): boolean {
    const last = this.state.lastAuthoritativeAt;
    return !this.disposed && !this.state.isExpired && this.state.error === null &&
      !this.state.isMutating && last !== null &&
      this.now() - last <= maxAgeMilliseconds;
  }

  // Several focus/online/pageshow events from one wake (or rapid taps) are
  // one logical refresh, even when the first server read is unusually fast.
  async triggerRead(): Promise<void> {
    const now = this.now();
    // A rejected trigger during server cooldown is not a performed refresh.
    // It must not delay the first permitted user retry after Retry-After ends.
    if (this.disposed || this.state.isExpired || this.pendingMutation !== 0 ||
        now < this.state.cooldownUntil) return;
    if (now - this.lastUserOrWakeTriggerAt < 2_000) {
      if (this.readPromise) await this.readPromise;
      return;
    }
    this.lastUserOrWakeTriggerAt = now;
    await this.read();
  }

  // The host owns timer cadence. This method is safe for initial/manual/poll/wake.
  async read(): Promise<void> {
    if (this.disposed || this.state.isExpired) return;
    if (this.pendingMutation !== 0) {
      return;
    }
    if (this.now() < this.state.cooldownUntil) return;
    if (this.readPromise !== null) return this.readPromise;

    const generation = ++this.readGeneration;
    const abort = new AbortController();
    this.readAbort = abort;
    this.setState({ isReading: true, lastAttemptAt: this.now() });
    const operation = (async () => {
      try {
        const next = await this.client.loadSession(abort.signal);
        if (!this.canAcceptRead(generation)) return;
        if (this.state.session && this.state.session.valetSessionId !== next.valetSessionId) {
          // An implicit visit swap is never authorized by a plain GET.
          this.setState({ error: new Error('Guest visit identity changed.'), isReading: false });
          return;
        }
        const session = retainCurrentSessionBranding(this.state.session, next);
        this.acceptSession(session);
        this.setState({
          session, lastAuthoritativeAt: this.now(), error: null,
          isExpired: false, cooldownUntil: 0, failures: 0,
        });
      } catch (error) {
        if (!this.canAcceptRead(generation)) return;
        if (error instanceof GuestApiError && error.code === 'GUEST_CONTEXT_CHANGED') {
          this.clearProtected(error);
        } else if (error instanceof GuestApiError && error.code === 'GUEST_ACCESS_INVALID') {
          this.clearProtected(error, true);
        } else {
          const retryAfter = error instanceof GuestApiError ? error.retryAfter : undefined;
          this.setState({
            error,
            failures: this.state.failures + 1,
            cooldownUntil: retryAfter !== undefined && Number.isFinite(retryAfter)
              ? this.now() + Math.max(0, retryAfter) * 1000 : 0,
          });
        }
      } finally {
        if (this.readAbort === abort) this.readAbort = null;
        if (this.canAcceptRead(generation)) this.setState({ isReading: false });
      }
    })();
    this.readPromise = operation;
    try {
      await operation;
    } finally {
      if (this.readPromise === operation) this.readPromise = null;
    }
  }

  beginMutation(): GuestMutationTicket | null {
    if (!this.isTrusted || !this.state.session || this.pendingMutation !== 0) return null;
    const clientSessionId = this.state.session.valetSessionId;
    const mutationId = ++this.mutationGeneration;
    this.pendingMutation = mutationId;
    ++this.readGeneration;
    this.readAbort?.abort();
    // The old GET belongs to the previous read generation. Do not wait for
    // its body/abort cleanup before starting post-mutation reconciliation.
    this.readPromise = null;
    this.setState({ isMutating: true, isReading: false });
    const isCurrent = () => !this.disposed && this.pendingMutation === mutationId &&
      this.state.session?.valetSessionId === clientSessionId;
    let finished = false;
    return {
      isCurrent,
      finish: async (updated?: GuestSafeSession, failure?: unknown) => {
        if (finished) return;
        finished = true;
        if (!isCurrent()) return;
        if (failure instanceof GuestApiError && failure.status === 429) {
          const seconds = failure.retryAfter;
          // Mutation class throttling is independent of GET reconciliation.
          // An authoritative read must never erase a protected POST cooldown.
          const delayMs = seconds !== undefined && Number.isFinite(seconds) && seconds >= 0
            ? seconds * 1_000 : 2_000;
          this.setState({
            mutationCooldownUntil: Math.max(this.state.mutationCooldownUntil, this.now() + delayMs),
          });
        }
        if (updated && updated.valetSessionId === clientSessionId) {
          const session = retainCurrentSessionBranding(this.state.session, updated);
          this.acceptSession(session);
          this.setState({ session });
        }
        this.pendingMutation = 0;
        // A mutation response can be authoritative, but the next eligible
        // action still waits for a fresh canonical read (including on timeout).
        this.setState({ isMutating: false, lastAuthoritativeAt: null });
        if (!this.disposed && this.state.session?.valetSessionId === clientSessionId) {
          await this.read();
        }
      },
    };
  }

  clearProtected(error: unknown, expired = false): void {
    ++this.readGeneration;
    this.readAbort?.abort();
    this.pendingMutation = 0;
    this.setState({ session: null, lastAuthoritativeAt: null, error,
      isExpired: expired, isReading: false, isMutating: false });
  }

  // Backwards-compatible push entry point. Do not use for new protected actions;
  // they must acquire beginMutation before sending the operation.
  updateSession(session: GuestSafeSession): void {
    if (!this.isTrusted || this.state.session?.valetSessionId !== session.valetSessionId) return;
    const retained = retainCurrentSessionBranding(this.state.session, session);
    ++this.readGeneration;
    this.readAbort?.abort();
    this.acceptSession(retained);
    this.setState({ session: retained, lastAuthoritativeAt: null });
    void this.read();
  }

  dispose(): void {
    this.disposed = true;
    ++this.readGeneration;
    this.readAbort?.abort();
    this.pendingMutation = 0;
  }

  private canAcceptRead(generation: number): boolean {
    return !this.disposed && generation === this.readGeneration &&
      this.pendingMutation === 0;
  }

  private setState(change: Partial<GuestCoordinatorState>): void {
    if (this.disposed) return;
    this.state = { ...this.state, ...change };
    this.publish(this.state);
  }
}
