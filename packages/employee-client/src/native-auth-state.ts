import { staffNativeRefreshRequestSchema } from "@valet/contracts/staff-auth";

import type {
  InstallationAuthState,
  SecureRefreshEnvelope,
} from "./native-auth-types";

const generationPattern = /^[A-Za-z0-9._-]{16,128}$/;

export function parseInstallationAuthState(
  value: unknown,
): InstallationAuthState | undefined {
  if (
    value === null ||
    typeof value !== "object" ||
    !("version" in value) ||
    value.version !== 1 ||
    !("generation" in value) ||
    typeof value.generation !== "string" ||
    !generationPattern.test(value.generation) ||
    !("restoreBlocked" in value) ||
    typeof value.restoreBlocked !== "boolean"
  ) {
    return undefined;
  }
  return {
    generation: value.generation,
    restoreBlocked: value.restoreBlocked,
    version: 1,
  };
}

export function parseSecureRefreshEnvelope(
  value: unknown,
): SecureRefreshEnvelope | undefined {
  if (
    value === null ||
    typeof value !== "object" ||
    !("version" in value) ||
    value.version !== 1 ||
    !("installationGeneration" in value) ||
    typeof value.installationGeneration !== "string" ||
    !generationPattern.test(value.installationGeneration) ||
    !("refreshToken" in value)
  ) {
    return undefined;
  }
  const parsedToken = staffNativeRefreshRequestSchema.safeParse({
    refreshToken: value.refreshToken,
  });
  if (!parsedToken.success) return undefined;
  return {
    installationGeneration: value.installationGeneration,
    refreshToken: parsedToken.data.refreshToken,
    version: 1,
  };
}

export function installationState(
  generation: string,
  restoreBlocked: boolean,
): InstallationAuthState {
  const parsed = parseInstallationAuthState({
    generation,
    restoreBlocked,
    version: 1,
  });
  if (parsed === undefined) {
    throw new Error("Installation authentication state is unavailable.");
  }
  return parsed;
}
