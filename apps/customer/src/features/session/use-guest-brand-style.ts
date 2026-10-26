import { useContext } from 'react';

import { ThemeContext } from '../../theme/theme-provider';
import { guestBrandStyle } from './guest-branding';
import { GuestSessionContext } from './use-guest-session';

// Local inheritance boundaries (shell and sibling sheets) share one selector.
// Never write tenant tokens to document/root state where another visit can leak.
export function useGuestBrandStyle(dark?: boolean) {
  const guest = useContext(GuestSessionContext);
  const theme = useContext(ThemeContext);
  const session = guest && !guest.isExpired && !guest.isNetworkError && !guest.error
    ? guest.session : null;
  return guestBrandStyle(session, dark ?? theme?.isDark ?? false);
}
