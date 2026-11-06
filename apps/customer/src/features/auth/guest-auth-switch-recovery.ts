import { GuestApiClient } from '../../lib/api/guest-api-client';
import {
  isTerminalGuestAuthBootstrapFailure,
  requireGuestBrowserAuthority,
  switchGuestBrowserContextTransport,
} from './guest-auth-bootstrap';

export function createGuestSwitchRecovery(token: string, previouslyAmbiguous: boolean) {
  let ambiguous = previouslyAmbiguous;
  let reconcile = false;
  return {
    get isAmbiguous() {
      return ambiguous;
    },
    async attempt() {
      if (!reconcile) {
        try {
          await switchGuestBrowserContextTransport(new GuestApiClient(token), () => {
            ambiguous = true;
          });
          return;
        } catch (error) {
          if (!ambiguous || !isTerminalGuestAuthBootstrapFailure(error)) throw error;
          // Promotion can clear the pending cookies before its body is lost.
          reconcile = true;
        }
      }
      const client = GuestApiClient.browserSession();
      const result = await client.reconcileBrowserContextSwitch();
      if (result.result === 'NONE') await requireGuestBrowserAuthority(client);
    },
  };
}
