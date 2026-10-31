"use client";

import type { DashboardApiClient } from "../../../../../lib/api/dashboard-api-client";
import { useSensitiveMutation } from "../../../use-sensitive-mutation";
import { studioSettingsCommands } from "./studio-settings-commands";
import { confirmedStudioSettingsMutation } from "./studio-settings-confirmation";
import type {
  StudioSettingKey, StudioSettingsScope, StudioSettingsSnapshot,
} from "./studio-settings-types";

export interface StudioSettingsMutationOptions {
  readonly api: DashboardApiClient;
  readonly scope: StudioSettingsScope;
  readonly snapshot: StudioSettingsSnapshot | null;
  readonly onReload: () => void;
  readonly disabled?: boolean;
}

/**
 * Boolean describes confirmed server success only. MFA, conflict and error
 * preserve the caller's draft; a fresh read supplies the next CAS token.
 */
export function useStudioSettingsMutation(options: StudioSettingsMutationOptions) {
  const { api, snapshot, scope, onReload } = options;
  const intentKey = [
    "policies-studio-settings", scope.kind,
    "organizationId" in scope ? scope.organizationId : "",
    "locationId" in scope ? scope.locationId : "",
    snapshot?.updatedAt ?? "unloaded",
  ].join(":");
  const mutation = useSensitiveMutation(intentKey, onReload);
  const commands = snapshot ? studioSettingsCommands(api, snapshot) : null;

  async function attempt(
    key: StudioSettingKey, value: unknown, clear: boolean,
  ): Promise<boolean> {
    if (!commands || options.disabled) return false;
    return confirmedStudioSettingsMutation(
      mutation.run,
      () => clear ? commands.clear(key) : commands.save(key, value),
      onReload,
    );
  }

  return {
    save: (key: StudioSettingKey, value: unknown) => attempt(key, value, false),
    clear: (key: StudioSettingKey) => attempt(key, undefined, true),
    busy: mutation.busy,
    error: mutation.error,
    mfaOpen: mutation.mfaOpen,
    onMfaAssured: mutation.onMfaAssured,
    closeMfa: mutation.closeMfa,
  } as const;
}
