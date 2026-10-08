import { GuestRequestAdmission } from "../src/modules/guest-access/guest-request-admission";
import { TrustedClientAddressResolver } from "../src/modules/anti-abuse/client-address";
import { GuestAuthOriginPolicy } from "../src/modules/guest-access/guest-browser-transport";
import { GuestCredentialAuthorizer } from "../src/modules/guest-access/guest-credential-authorizer";

// Transport/cache fixture only. Exact SQL/counter behavior has disposable-PG tests.
export function guestAdmissionQueryStub(
  reserve: () => Promise<{ allowed: boolean; retryAfter?: number }>,
) {
  return {
    query: async () => {
      const decision = await reserve();
      return {
        rows: [
          {
            id: "admission",
            retry_after: decision.allowed ? 0 : decision.retryAfter,
          },
        ],
      };
    },
  };
}

export const guestAuthorizerTestProviders = [
  GuestAuthOriginPolicy,
  GuestRequestAdmission,
  GuestCredentialAuthorizer,
  {
    provide: TrustedClientAddressResolver,
    useValue: { resolve: () => "127.0.0.1" },
  },
] as const;
