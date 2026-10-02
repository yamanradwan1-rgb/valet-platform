import type { GuestSafeSession } from "../../lib/api/guest-api-types";

export function currentClientSession<T>(
  envelope: { readonly client: T; readonly value: GuestSafeSession | null },
  client: T,
): GuestSafeSession | null {
  return client !== null && envelope.client === client ? envelope.value : null;
}

export function retainCurrentSessionBranding(
  current: GuestSafeSession | null,
  next: GuestSafeSession,
): GuestSafeSession {
  return current?.valetSessionId === next.valetSessionId && current.branding
    ? { ...next, branding: next.branding ?? current.branding }
    : next;
}
