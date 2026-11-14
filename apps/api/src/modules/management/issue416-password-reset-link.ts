import {
  STAFF_PASSWORD_RESET_PAGE_PATH,
  staffPasswordResetTokenSchema,
} from "@valet/contracts";
import { Issue416ResetUnavailableError } from "./issue416-password-reset-boundary";

/** Validate public HTTPS origin BEFORE a mutating issuance can commit. */
export function issue416PasswordResetLink(token: string): string {
  const configured = process.env.STAFF_PASSWORD_RESET_PUBLIC_ORIGIN;
  if (configured === undefined) throw new Issue416ResetUnavailableError();
  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Issue416ResetUnavailableError();
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.pathname !== "/" ||
    parsed.search !== "" ||
    parsed.hash !== "" ||
    (configured !== parsed.origin && configured !== `${parsed.origin}/`)
  ) {
    throw new Issue416ResetUnavailableError();
  }
  if (!staffPasswordResetTokenSchema.safeParse(token).success) {
    throw new Issue416ResetUnavailableError();
  }
  return `${parsed.origin}${STAFF_PASSWORD_RESET_PAGE_PATH}#reset=${token}`;
}
