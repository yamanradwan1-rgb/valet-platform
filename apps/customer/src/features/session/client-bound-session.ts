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

export function applyCurrentClientSessionUpdate<T>(
  latest: {
    readonly current: {
      readonly client: T;
      readonly value: GuestSafeSession | null;
    };
  },
  activeClient: { readonly current: T },
  client: T,
  snapshot: GuestSafeSession,
  apply: (snapshot: GuestSafeSession) => void,
): void {
  if (activeClient.current !== client) return;
  const current = currentClientSession(latest.current, client);
  if (!current || current.valetSessionId !== snapshot.valetSessionId) return;
  apply(retainCurrentSessionBranding(current, snapshot));
}
