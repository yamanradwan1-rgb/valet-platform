import { GuestCredentialAuthorizer } from "../src/modules/guest-access/guest-credential-authorizer";
import { GuestRequestAdmission } from "../src/modules/guest-access/guest-request-admission";

export const guestAdmissionProviders = [
  GuestRequestAdmission,
  GuestCredentialAuthorizer,
];
