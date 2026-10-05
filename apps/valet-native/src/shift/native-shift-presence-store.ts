import * as SecureStore from "expo-secure-store";
import {
  parseInstallationAuthState,
  type PresenceDescriptor,
  type PresenceStore,
} from "@valet/employee-client";
import {
  shiftPresenceChallengeIntentSchema,
  staffOperationalRoleSchema,
} from "@valet/contracts";
import { ExpoInstallationAuthStateStore } from "../auth/native-auth-storage";

const options: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  keychainService: "com.vaylet.employee.shift-presence",
};

export function parseNativePresenceDescriptor(
  value: unknown,
): PresenceDescriptor | undefined {
  if (value === null || typeof value !== "object") return;
  const candidate = value as PresenceDescriptor;
  if (
    Object.keys(candidate).sort().join() !==
      [
        "operationId",
        "target",
        "version",
        ...(candidate.stage === undefined ? [] : ["stage"]),
        ...(candidate.localFailure === undefined ? [] : ["localFailure"]),
      ]
        .sort()
        .join() ||
    (candidate.stage !== undefined &&
      !["LOCAL", "SHIFT_MAY_HAVE_LEFT", "EXCEPTION_MAY_HAVE_LEFT"].includes(
        candidate.stage,
      )) ||
    (candidate.localFailure !== undefined &&
      (candidate.stage !== "LOCAL" ||
        !["LOCATION_UNAVAILABLE", "GPS_UNAVAILABLE"].includes(
          candidate.localFailure,
        ))) ||
    candidate.version !== 1 ||
    candidate.target === null ||
    typeof candidate.target !== "object"
  )
    return;
  const target = candidate.target;
  const keys = [
    "action",
    "cashReported",
    "identityGeneration",
    "locationId",
    "membershipId",
    "organizationId",
    "shiftId",
    ...(target.action === "END" ? ["currency", "shiftStartedAt", "role"] : []),
  ]
    .sort()
    .join();
  if (
    Object.keys(target).sort().join() !== keys ||
    !Number.isSafeInteger(target.identityGeneration) ||
    target.identityGeneration < 0
  )
    return;
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (
    ![target.membershipId, target.organizationId, target.locationId].every(
      (id) => typeof id === "string" && uuid.test(id),
    )
  )
    return;
  if (
    target.action === "START" &&
    (target.shiftId !== null || target.cashReported !== null)
  )
    return;
  if (
    target.action === "END" &&
    (typeof target.shiftStartedAt !== "string" ||
      !Number.isFinite(Date.parse(target.shiftStartedAt)) ||
      !staffOperationalRoleSchema.safeParse(target.role).success ||
      !/^[A-Z]{3}$/.test(target.currency ?? ""))
  )
    return;
  const intent =
    target.action === "START"
      ? {
          action: target.action,
          targetLocationId: target.locationId,
          operationId: candidate.operationId,
        }
      : {
          action: target.action,
          shiftId: target.shiftId,
          cashReported: target.cashReported,
          operationId: candidate.operationId,
        };
  return shiftPresenceChallengeIntentSchema.safeParse(intent).success
    ? candidate
    : undefined;
}

/** Serializes writes/deletes so logout cannot be overtaken by an old write. */
export class ExpoShiftPresenceStore implements PresenceStore {
  private pending: Promise<unknown> = Promise.resolve();
  private readonly key: string;
  constructor(action: "START" | "END") {
    this.key = `vaylet.employee.shift-presence.${action.toLowerCase()}.v1`;
  }
  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = this.pending.then(work, work);
    this.pending = result.catch(() => undefined);
    return result;
  }
  write(descriptor: PresenceDescriptor): Promise<void> {
    return this.enqueue(async () => {
      const installation = parseInstallationAuthState(
        await new ExpoInstallationAuthStateStore().read(),
      );
      if (
        installation === undefined ||
        installation.restoreBlocked ||
        parseNativePresenceDescriptor(descriptor) === undefined
      )
        throw new Error("Presence recovery storage unavailable.");
      await SecureStore.setItemAsync(
        this.key,
        JSON.stringify({
          installationGeneration: installation.generation,
          descriptor,
        }),
        options,
      );
    });
  }
  delete(): Promise<void> {
    return this.enqueue(() => SecureStore.deleteItemAsync(this.key, options));
  }
  read(): Promise<PresenceDescriptor | undefined> {
    return this.enqueue(async () => {
      const installation = parseInstallationAuthState(
        await new ExpoInstallationAuthStateStore().read(),
      );
      const raw = await SecureStore.getItemAsync(this.key, options);
      if (
        raw === null ||
        installation === undefined ||
        installation.restoreBlocked
      )
        return;
      try {
        const stored = JSON.parse(raw) as {
          installationGeneration?: unknown;
          descriptor?: unknown;
        };
        return stored.installationGeneration === installation.generation
          ? parseNativePresenceDescriptor(stored.descriptor)
          : undefined;
      } catch {
        return;
      }
    });
  }
}
