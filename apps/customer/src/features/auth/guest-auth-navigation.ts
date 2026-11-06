import { readBrowserContextMarker } from '../../lib/api/guest-browser-context-marker';
import { GUEST_CONTEXT_CHANGED_EVENT, GuestApiClient } from '../../lib/api/guest-api-client';
import {
  beginGuestContextSwitchState,
  completedBootstrapState,
  continueCurrentGuestVisitState,
  failedBootstrapState,
  failedGuestContextSwitchState,
  isTerminalGuestAuthBootstrapFailure,
  retryGuestAuthBootstrapTransport,
  runGuestAuthBootstrap,
  type GuestAuthBootstrapStage,
  type GuestTokenBootstrapState,
} from './guest-auth-bootstrap';
import { recoverGuestAuth429Once, waitForScheduledGuestAuthRetry } from './guest-auth-rate-limit';
import { createGuestSwitchRecovery } from './guest-auth-switch-recovery';
import { extractGuestFragmentToken } from './guest-token-adapter';

type PublishState = (state: GuestTokenBootstrapState) => void;
const navigationEvents = ['hashchange', 'popstate', 'pageshow'] as const;
const mountedFlows = new WeakMap<Window, GuestAuthNavigation>();

export function connectGuestAuthNavigation(
  browser: Window,
  initial: GuestTokenBootstrapState,
  publish: PublishState,
  readInitialFragment: boolean,
) {
  const flow = mountedFlows.get(browser) ?? new GuestAuthNavigation(browser, initial);
  mountedFlows.set(browser, flow);
  return { flow, disconnect: flow.connect(initial, publish, readInitialFragment) };
}

export function noteGuestSessionDenied(client: GuestApiClient) {
  mountedFlows.get(window)?.noteDenied(client);
}

export class GuestAuthNavigation {
  private publish: PublishState | null = null;
  private queuedToken: string | null = null;
  private operation: { token: string | null; stage: GuestAuthBootstrapStage | 'SWITCH' } | null = null;
  private epoch = 0;
  private requestInFlight = false;
  private marker = readBrowserContextMarker();
  private legacyToken: string | null;
  private deniedClient: GuestApiClient | null = null;
  private exchangeClient: GuestApiClient | null = null;
  private readonly enrollmentEnabled =
    process.env.NEXT_PUBLIC_GUEST_BROWSER_SESSION_ENROLLMENT_ENABLED === 'true';

  constructor(
    private readonly browser: Window,
    private state: GuestTokenBootstrapState,
  ) {
    this.legacyToken = state.token;
  }

  connect(initial: GuestTokenBootstrapState, publish: PublishState, readInitialFragment: boolean) {
    this.publish = publish;
    for (const event of navigationEvents) this.browser.addEventListener(event, this.ingest);
    this.browser.addEventListener(GUEST_CONTEXT_CHANGED_EVENT, this.contextChanged);
    // Strict Mode replays effect setup before this microtask. The first setup
    // must not scrub a fragment or start a request on behalf of its replacement.
    queueMicrotask(() => {
      if (this.publish !== publish) return;
      publish(this.state);
      if (readInitialFragment) this.ingest();
      this.startIfPending();
    });
    return () => {
      if (this.publish !== publish) return;
      for (const event of navigationEvents) this.browser.removeEventListener(event, this.ingest);
      this.browser.removeEventListener(GUEST_CONTEXT_CHANGED_EVENT, this.contextChanged);
      this.publish = null;
      this.queuedToken = null;
      if (this.operation && !this.requiresRecovery &&
        (!this.enrollmentEnabled || this.operation.stage === 'PREPARE')) {
        this.epoch += 1;
        this.update(initial);
        this.legacyToken = initial.token;
      }
      this.releaseIfDetached();
    };
  }

  private releaseIfDetached() {
    // An actual provider remount in this document must wait for the same
    // cookie-writing operation or inherit its exact pending recovery.
    if (!this.publish && !this.operation && !this.requiresRecovery) {
      mountedFlows.delete(this.browser);
    }
  }

  private get requiresRecovery() {
    return this.state.retryStage === 'EXCHANGE' || this.state.retryStage === 'RECONCILE_SWITCH' ||
      this.state.isSwitchOutcomeAmbiguous;
  }

  private update(state: GuestTokenBootstrapState) {
    if (state.client !== this.state.client) {
      this.marker = readBrowserContextMarker();
      this.deniedClient = null;
    }
    this.state = state;
    this.publish?.(state);
  }

  noteDenied(client: GuestApiClient) {
    if (this.state.client === client) this.deniedClient = client;
  }

  private readonly ingest = () => {
    const token = extractGuestFragmentToken();
    if (token === null || token === this.operation?.token || token === this.state.token ||
      token === this.legacyToken) return;
    this.queuedToken = token;
    this.drain();
  };

  private drain() {
    if (!this.publish || this.operation || this.state.retryStage !== null ||
      this.state.contextConflictScope !== null || this.queuedToken === null) return;
    const token = this.queuedToken;
    this.queuedToken = null;
    void this.bootstrap(token);
  }

  private startIfPending() {
    this.drain();
    if (this.publish && !this.state.isComplete && !this.operation) void this.bootstrap(null);
  }

  private readonly contextChanged = () => {
    // Prepare and switch can themselves change the marker. Let their owning
    // operation settle before replacing the client, and keep unknown outcomes.
    if (this.marker === readBrowserContextMarker()) return;
    if (this.requiresRecovery || (this.enrollmentEnabled && this.requestInFlight) ||
      this.operation?.stage === 'EXCHANGE' || this.operation?.stage === 'SWITCH' ||
      this.operation?.stage === 'RECONCILE_SWITCH') return;
    this.adoptCurrentCookie();
  };

  private adoptCurrentCookie() {
    this.epoch += 1;
    this.legacyToken = null;
    this.update(completedBootstrapState({
      token: null, client: GuestApiClient.browserSession(), contextConflictScope: null,
    }));
    this.drain();
  }

  private async run(
    token: string | null,
    stage: GuestAuthBootstrapStage | 'SWITCH',
    work: (owns: () => boolean, canRequest: () => boolean) => Promise<void>,
  ) {
    const epoch = ++this.epoch;
    const owns = () => this.epoch === epoch;
    const canRequest = () => owns() && this.publish !== null;
    this.operation = { token, stage };
    try {
      await work(owns, canRequest);
    } finally {
      this.operation = null;
      this.startIfPending();
      this.releaseIfDetached();
    }
  }

  private async request<T>(attempt: () => Promise<T>): Promise<T> {
    this.requestInFlight = true;
    try {
      return await attempt();
    } finally {
      this.requestInFlight = false;
    }
  }

  private bootstrap(token: string | null, retry?: GuestTokenBootstrapState) {
    let stage = retry?.retryStage ?? (token === null ? 'RECONCILE_SWITCH' : 'PREPARE');
    const previous = this.state;
    return this.run(token, stage, async (owns, canRequest) => {
      if (previous.retryNotBefore !== undefined &&
        !await waitForScheduledGuestAuthRetry(previous.retryNotBefore, canRequest)) {
        if (canRequest() && !retry) {
          this.update({ ...previous, token, retryStage: stage, isTemporarilyUnavailable: true });
        }
        return;
      }
      if (retry) this.update({ ...previous, isComplete: false });
      const onStage = (next: GuestAuthBootstrapStage) => {
        stage = next;
        if (this.operation) this.operation.stage = next;
        if (next === 'EXCHANGE') {
          this.exchangeClient = readBrowserContextMarker() === null ? null : GuestApiClient.browserSession();
        }
      };
      const attempt = (resume: boolean) => this.request(async () => {
        // With enrollment disabled there is no authorized context-transfer
        // protocol. Keep current authority unless the server has denied it.
        if (!this.enrollmentEnabled && token !== null && previous.client !== null) {
          try {
            await previous.client.loadSession();
            return null;
          } catch (error) {
            if (!isTerminalGuestAuthBootstrapFailure(error)) throw error;
            if (!canRequest()) return null;
          }
        }
        return resume
          ? retryGuestAuthBootstrapTransport(
            token, this.enrollmentEnabled, stage, onStage, canRequest, this.exchangeClient,
          )
          : runGuestAuthBootstrap(token, this.enrollmentEnabled, onStage, canRequest);
      });
      try {
        const result = await recoverGuestAuth429Once(
          () => attempt(retry !== undefined), () => attempt(true), canRequest,
        );
        if (!owns()) return;
        if (result === null) {
          this.update({
            ...previous, token: this.legacyToken, isComplete: true,
            isTemporarilyUnavailable: false, retryStage: null, retryNotBefore: undefined,
          });
          return;
        }
        const client = result.preservesBrowserContext && this.legacyToken === null &&
          previous.client !== this.deniedClient && this.marker !== null &&
          this.marker === readBrowserContextMarker() ? previous.client ?? result.client : result.client;
        this.exchangeClient = null;
        this.legacyToken = this.enrollmentEnabled ? null : result.token;
        this.update(completedBootstrapState({ ...result, client }));
      } catch (error) {
        if (!owns()) return;
        const preserveClient = this.marker === readBrowserContextMarker() || !this.enrollmentEnabled;
        const client = preserveClient && previous.client ? previous.client : GuestApiClient.browserSession();
        this.update(failedBootstrapState(token, client, error, stage));
        if (!this.requiresRecovery) this.exchangeClient = null;
      }
    });
  }

  retryBootstrap(expected: GuestTokenBootstrapState): Promise<void> | undefined {
    if (this.operation || this.state !== expected || expected.retryStage === null) return;
    return this.bootstrap(expected.token, expected);
  }

  continueCurrentVisit(expected: GuestTokenBootstrapState) {
    if (this.operation || this.state !== expected || expected.isSwitchOutcomeAmbiguous) return;
    this.update(continueCurrentGuestVisitState(expected));
    this.drain();
  }

  openNewVisit(expected: GuestTokenBootstrapState): Promise<void> | undefined {
    const token = expected.token;
    if (this.operation || this.state !== expected || token === null ||
      expected.contextConflictScope === null) return;
    return this.run(token, 'SWITCH', async (owns, canRequest) => {
      if (expected.retryNotBefore !== undefined &&
        !await waitForScheduledGuestAuthRetry(expected.retryNotBefore, canRequest)) return;
      if (!expected.isSwitchOutcomeAmbiguous && this.marker !== readBrowserContextMarker()) {
        this.adoptCurrentCookie();
        return;
      }
      this.update(beginGuestContextSwitchState(expected));
      const recovery = createGuestSwitchRecovery(token, expected.isSwitchOutcomeAmbiguous);
      const attempt = () => this.request(recovery.attempt);
      try {
        await recoverGuestAuth429Once(attempt, attempt, canRequest);
        if (!owns()) return;
        this.update(completedBootstrapState({
          token: null, client: GuestApiClient.browserSession(), contextConflictScope: null,
        }));
      } catch (error) {
        if (!owns()) return;
        const failed = failedGuestContextSwitchState(expected, error);
        this.update(recovery.isAmbiguous
          ? { ...failed, token, contextConflictScope: expected.contextConflictScope, isSwitchOutcomeAmbiguous: true }
          : failed);
      }
    });
  }

  setToken(token: string | null) {
    if (this.operation || this.requiresRecovery) return;
    this.epoch += 1;
    this.queuedToken = null;
    this.legacyToken = token;
    this.update({
      ...continueCurrentGuestVisitState(this.state),
      token,
      client: token === null ? null : new GuestApiClient(token),
      isComplete: true,
      isTemporarilyUnavailable: false,
      retryStage: null,
      retryNotBefore: undefined,
    });
  }
}
