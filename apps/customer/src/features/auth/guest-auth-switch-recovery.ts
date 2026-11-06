import { GuestApiClient } from '../../lib/api/guest-api-client';
import { readBrowserContextMarker } from '../../lib/api/guest-browser-context-marker';
import {
  guestAuthOutcomeUnknown,
  isTerminalGuestAuthBootstrapFailure,
  switchGuestBrowserContextTransport,
} from './guest-auth-bootstrap';

export function createGuestSwitchRecovery(
  token: string,
  previouslyAmbiguous: boolean,
  sourceMarker: string | null,
) {
  let ambiguous = previouslyAmbiguous;
  let reconcile = false;
  const hasOriginalSource = () =>
    sourceMarker === readBrowserContextMarker() && (sourceMarker !== null || !ambiguous);
  return {
    get isAmbiguous() {
      return ambiguous;
    },
    async attempt() {
      if (!reconcile) {
        try {
          await switchGuestBrowserContextTransport(new GuestApiClient(token), () => {
            ambiguous = true;
          }, hasOriginalSource);
          return;
        } catch (error) {
          if (!ambiguous || !isTerminalGuestAuthBootstrapFailure(error)) throw error;
          // Promotion can clear the pending cookies before its body is lost.
          reconcile = true;
        }
      }
      // Reconcile can restore an already committed cookie-bound transition.
      // Neither response identifies the bearer chosen by this mounted flow.
      if (!hasOriginalSource()) throw guestAuthOutcomeUnknown();
      await GuestApiClient.browserSession().reconcileBrowserContextSwitch();
      throw guestAuthOutcomeUnknown();
    },
  };
}
