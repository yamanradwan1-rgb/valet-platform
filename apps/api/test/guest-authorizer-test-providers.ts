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
            id: decision.allowed ? "00000000-0000-4000-8000-000000000001" : null,
            // The protected S04 SQL function returns a numeric zero for a
            // successful admitted request; undefined is not a valid result.
            retry_after: decision.allowed ? 0 : decision.retryAfter ?? 30,
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
