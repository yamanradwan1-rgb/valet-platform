import {
  EmployeeShiftPresenceSession,
  createEmployeeShiftPresenceTransport,
  type EmployeeShiftStartSession,
  type EmployeeShiftEndSession,
  type NativeAuthSession,
  type PresenceTarget,
  type StaffOperationalContextResponse,
} from "@valet/employee-client";
import { createNativeEmployeeClient } from "../tasks/native-operational-http";
import { NativeShiftPresenceAdapter } from "./native-shift-presence-adapter";
import { ExpoShiftPresenceStore } from "./native-shift-presence-store";

function uuid(): string {
  // The installed Expo native module supplies UUID v4.
  return globalThis.expo.uuidv4();
}

export function createNativeShiftPresenceRuntime(
  apiOrigin: string,
  auth: NativeAuthSession,
  online: () => boolean,
) {
  const startStore = new ExpoShiftPresenceStore("START");
  const endStore = new ExpoShiftPresenceStore("END");
  const sessions: {
    start?: EmployeeShiftStartSession;
    end?: EmployeeShiftEndSession;
  } = {};
  const authorized = (target: PresenceTarget) => {
    const identity = auth.current();
    if (
      !online() ||
      identity.phase !== "authenticated" ||
      identity.authGeneration !== target.identityGeneration
    )
      return false;
    if (target.action === "END") {
      const authority = sessions.end?.current().authority;
      return (
        authority !== null &&
        authority !== undefined &&
        authority.membershipId === target.membershipId &&
        authority.organizationId === target.organizationId &&
        authority.locationId === target.locationId &&
        authority.shiftId === target.shiftId
      );
    }
    return sessions.start?.ownsPresenceTarget(target) === true;
  };
  const transport = createEmployeeShiftPresenceTransport(() =>
    createNativeEmployeeClient(apiOrigin, auth),
  );
  const acquisition = new NativeShiftPresenceAdapter();
  const start = new EmployeeShiftPresenceSession({
    transport,
    store: startStore,
    acquisition,
    createId: uuid,
    isAuthorized: authorized,
  });
  const end = new EmployeeShiftPresenceSession({
    transport,
    store: endStore,
    acquisition,
    createId: uuid,
    isAuthorized: authorized,
  });
  let restored = -1;
  let restoreGeneration = 0;

  async function restore(
    identityGeneration: number,
    response: StaffOperationalContextResponse,
  ): Promise<void> {
    if (restored === identityGeneration) return;
    restored = identityGeneration;
    const generation = ++restoreGeneration;
    for (const [store, coordinator] of [
      [startStore, start],
      [endStore, end],
    ] as const) {
      const descriptor = await store.read();
      if (
        generation !== restoreGeneration ||
        auth.current().authGeneration !== identityGeneration ||
        auth.current().phase !== "authenticated"
      )
        return;
      if (descriptor === undefined) continue;
      if (coordinator.descriptor() !== undefined) continue;
      const target = { ...descriptor.target, identityGeneration };
      const context = response.contexts.find(
        (value) =>
          value.membershipId === target.membershipId &&
          value.organization.organizationId === target.organizationId,
      );
      const location =
        context?.eligibleLocations.find(
          (value) => value.locationId === target.locationId,
        ) ??
        (context?.currentLocation?.locationId === target.locationId
          ? context.currentLocation
          : undefined);
      if (
        (target.action === "START" &&
          (context === undefined || location === undefined)) ||
        (target.action === "END" &&
          response.contexts.some(
            (value) =>
              value.activeShift !== null &&
              (value.activeShift.shiftId !== target.shiftId ||
                value.membershipId !== target.membershipId ||
                value.organization.organizationId !== target.organizationId),
          ))
      ) {
        await store.delete();
        continue;
      }
      if (target.action === "START") {
        const session = sessions.start;
        if (session === undefined) return;
        await session.resumePresenceRecovery(
          {
            identityGeneration,
            membershipId: target.membershipId,
            organizationId: target.organizationId,
            location: location!,
          },
          () => coordinator.restore({ ...descriptor, target }),
        );
      } else {
        const session = sessions.end;
        if (session === undefined) return;
        const authority = {
          identityGeneration,
          membershipId: target.membershipId,
          organizationId: target.organizationId,
          organizationName: context?.organization.name ?? target.organizationId,
          locationId: target.locationId,
          // Historical opaque scope label; this is never a LocationAccess grant.
          locationCode: location?.code ?? target.locationId,
          locationName: location?.name ?? target.locationId,
          currency: target.currency!,
          role: target.role!,
          shiftId: target.shiftId!,
          shiftStartedAt: target.shiftStartedAt!,
        };
        await session.resumePresenceRecovery(
          authority,
          target.cashReported!,
          () => coordinator.restore({ ...descriptor, target }),
        );
      }
    }
  }
  return {
    start,
    end,
    sessions,
    restore,
    async purge() {
      restoreGeneration += 1;
      restored = -1;
      start.clear();
      end.clear();
      await Promise.all([startStore.delete(), endStore.delete()]);
    },
  };
}
