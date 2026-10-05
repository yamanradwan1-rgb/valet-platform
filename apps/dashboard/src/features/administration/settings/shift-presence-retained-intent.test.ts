import { describe, expect, it, vi } from "vitest";
import type { StaffAuthClient } from "../../../lib/auth/staff-auth-client";
import {
  presenceIntentLifetime,
  presenceIntentScope,
  type PresenceIntent,
} from "./shift-presence-retained-intent";

function fixture() {
  let identity = 1;
  let session = 1;
  let sessionId: string | null = "session-a";
  let changed = () => {};
  const unsubscribe = vi.fn();
  const client = {
    getIdentityGeneration: () => identity,
    getSessionGeneration: () => session,
    getStaffAuthSessionId: () => sessionId,
    subscribe: (listener: () => void) => {
      changed = listener;
      return unsubscribe;
    },
  } as unknown as StaffAuthClient;
  const lifetime = presenceIntentLifetime(client, identity, sessionId);
  lifetime.watch();
  return {
    client,
    lifetime,
    unsubscribe,
    replace: (identityChanged: boolean) => {
      session++;
      sessionId = "session-b";
      if (identityChanged) identity++;
      changed();
    },
    refresh: () => {
      session++;
      changed();
    },
    lose: () => {
      sessionId = null;
      identity++;
      session++;
      changed();
    },
  };
}
const location = {
  authority: "COMPANY_ADMIN" as const,
  organizationId: "organization-a",
  locationId: "location-a",
};
const key = presenceIntentScope(location);
const intent: PresenceIntent = {
  mutationId: "mutation-a",
  create: true,
  query: { kind: "ZONE", entityId: "zone-a" },
};

describe("feature-owned safe presence reconciliation lifetime", () => {
  it("retains exactly the allowlisted descriptor after UI unsubscribe/re-entry", () => {
    const { client, lifetime } = fixture();
    const notify = vi.fn();
    const unsubscribe = lifetime.subscribe(notify);
    lifetime.retain(key, {
      ...intent,
      latitude: 31,
      accuracy: 12,
      body: "private",
      credentials: "private",
    } as PresenceIntent);
    unsubscribe();
    const returning = presenceIntentLifetime(client, 1, "session-a");
    expect(returning).toBe(lifetime);
    expect(returning.get(key)).toEqual(intent);
    expect(Object.keys(returning.get(key)!)).toEqual([
      "mutationId",
      "query",
      "create",
    ]);
    expect(notify).toHaveBeenCalledOnce();
    expect(returning.retain(key, { ...intent, mutationId: "duplicate" })).toBe(
      false,
    );
  });
  it("fences Company, Location, Organization and authority without forgetting first A", () => {
    const { lifetime } = fixture();
    lifetime.retain(key, intent);
    for (const target of [
      { ...location, locationId: null },
      { ...location, locationId: "location-b" },
      { ...location, organizationId: "organization-b" },
      { ...location, authority: "LOCATION_MANAGER" as const },
    ])
      expect(lifetime.get(presenceIntentScope(target))).toBeNull();
    expect(lifetime.get(key)).toEqual(intent);
  });
  it.each([false, true])(
    "auth replacement (identity changed=%s) purges and retires old writers",
    (identityChanged) => {
      const { client, lifetime, replace, unsubscribe } = fixture();
      lifetime.retain(key, intent);
      replace(identityChanged);
      expect(lifetime.get(key)).toBeNull();
      expect(unsubscribe).toHaveBeenCalledOnce();
      expect(lifetime.retain(key, intent)).toBe(false);
      const replacement = presenceIntentLifetime(
        client,
        client.getIdentityGeneration(),
        client.getStaffAuthSessionId(),
      );
      replacement.watch();
      expect(replacement.get(key)).toBeNull();
      replacement.retain(key, { ...intent, mutationId: "replacement" });
      lifetime.clear(key, "replacement");
      expect(replacement.get(key)?.mutationId).toBe("replacement");
    },
  );
  it("only matching receipt/rejection clears, and retired completion cannot clear a later intent", () => {
    const { lifetime } = fixture();
    lifetime.retain(key, intent);
    lifetime.clear(key, "wrong-result");
    expect(lifetime.get(key)).toEqual(intent);
    lifetime.clear(key, intent.mutationId);
    expect(lifetime.get(key)).toBeNull();
    lifetime.retain(key, { ...intent, mutationId: "next" });
    lifetime.clear(key, intent.mutationId);
    expect(lifetime.get(key)?.mutationId).toBe("next");
  });
  it("ordinary refresh advances credential generation but preserves exact descriptor", () => {
    const { client, lifetime, refresh, unsubscribe } = fixture();
    lifetime.retain(key, intent);
    refresh();
    expect(client.getSessionGeneration()).toBe(2);
    expect(client.getStaffAuthSessionId()).toBe("session-a");
    expect(presenceIntentLifetime(client, 1, "session-a")).toBe(lifetime);
    expect(lifetime.get(key)).toEqual(intent);
    expect(unsubscribe).not.toHaveBeenCalled();
  });
  it("logout or definitive auth loss retires continuity and safe descriptors", () => {
    const { lifetime, lose } = fixture();
    lifetime.retain(key, intent);
    lose();
    expect(lifetime.isCurrent()).toBe(false);
    expect(lifetime.get(key)).toBeNull();
    expect(lifetime.retain(key, intent)).toBe(false);
  });
});
