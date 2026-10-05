import type { ShiftPresenceManagementResultQuery } from "@valet/contracts";
import type { StaffAuthClient } from "../../../lib/auth/staff-auth-client";
import type { PresenceTarget } from "./shift-presence-api";

export interface PresenceIntent {
  readonly mutationId: string;
  readonly query: ShiftPresenceManagementResultQuery;
  readonly create?: boolean;
}

/** Safe identities only. The auth client owns the lifetime, never the UI. */
export class PresenceIntentLifetime {
  private readonly intents = new Map<string, PresenceIntent>();
  private readonly listeners = new Set<() => void>();
  private stopWatching: (() => void) | null = null;
  constructor(
    private readonly client: StaffAuthClient,
    readonly identityGeneration: number,
    readonly staffAuthSessionId: string | null,
  ) {}
  isCurrent = () =>
    this.client.getIdentityGeneration() === this.identityGeneration &&
    this.staffAuthSessionId !== null &&
    this.client.getStaffAuthSessionId() === this.staffAuthSessionId;

  // Remains attached across subsection/route unmount, until auth replacement.
  watch() {
    if (this.stopWatching || !this.isCurrent()) return;
    this.stopWatching = this.client.subscribe(() => {
      if (!this.isCurrent()) this.retire();
    });
  }
  retire() {
    this.stopWatching?.();
    this.stopWatching = null;
    this.intents.clear();
    this.emit();
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  get(key: string) {
    return this.isCurrent() ? (this.intents.get(key) ?? null) : null;
  }
  retain(key: string, intent: PresenceIntent) {
    if (!this.isCurrent() || this.intents.has(key)) return false;
    // Explicit allowlist: never retain a caller's body or arbitrary properties.
    this.intents.set(key, {
      mutationId: intent.mutationId,
      query:
        intent.query.kind === "POLICY"
          ? { kind: "POLICY" }
          : { kind: intent.query.kind, entityId: intent.query.entityId },
      ...(intent.create === undefined ? {} : { create: intent.create }),
    });
    this.emit();
    return true;
  }
  clear(key: string, mutationId: string) {
    if (!this.isCurrent() || this.get(key)?.mutationId !== mutationId) return;
    this.intents.delete(key);
    this.emit();
  }
  private emit() {
    for (const listener of this.listeners) listener();
  }
}

const lifetimes = new WeakMap<StaffAuthClient, PresenceIntentLifetime>();
export function presenceIntentLifetime(
  client: StaffAuthClient,
  identityGeneration: number,
  staffAuthSessionId: string | null,
) {
  const prior = lifetimes.get(client);
  if (
    prior?.identityGeneration === identityGeneration &&
    prior.staffAuthSessionId === staffAuthSessionId
  )
    return prior;
  const lifetime = new PresenceIntentLifetime(
    client,
    identityGeneration,
    staffAuthSessionId,
  );
  lifetimes.set(client, lifetime);
  return lifetime;
}

export function presenceIntentScope(target: PresenceTarget) {
  return JSON.stringify([
    target.authority,
    target.organizationId,
    target.locationId,
    target.locationId === null ? "COMPANY_DEFAULTS" : "LOCATION_SETTINGS",
  ]);
}
