import { TrustedClientAddressResolver } from "../src/modules/anti-abuse/client-address";
import { GuestAuthOriginPolicy } from "../src/modules/guest-access/guest-browser-transport";
import { GuestCredentialAuthorizer } from "../src/modules/guest-access/guest-credential-authorizer";

export const guestAuthorizerTestProviders = [
  GuestAuthOriginPolicy,
  GuestCredentialAuthorizer,
  {
    provide: TrustedClientAddressResolver,
    useValue: { resolve: () => "127.0.0.1" },
  },
] as const;
