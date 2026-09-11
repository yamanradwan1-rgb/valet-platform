import type {
  StaffPushRegistrationRequest,
  StaffPushRegistrationResponse,
} from "@valet/contracts";
import type {
  EmployeeLocale,
  NativeAuthSnapshot,
} from "@valet/employee-client";

export type NativePushPermissionState =
  "blocked" | "denied" | "granted" | "undetermined" | "unavailable";

export type NativePushRegistrationState =
  "confirmed" | "idle" | "reconciling" | "unconfirmed" | "unavailable";

export type NativePushReconcileReason =
  | "authentication"
  | "foreground"
  | "locale"
  | "network-recovery"
  | "permission"
  | "token-change";

export interface PendingNativePushReconcile {
  readonly generation: number;
  readonly providedToken?: string;
  readonly reason: NativePushReconcileReason;
}

export interface NativePushSnapshot {
  readonly attentionIntentIds: readonly string[];
  readonly channelAvailable: boolean;
  readonly permission: NativePushPermissionState;
  readonly registration: NativePushRegistrationState;
}

export interface NativePushRuntimeMetadata {
  readonly appBuild: string;
  readonly appVersion: string;
}

export interface NativePushRegistrationInput {
  readonly installationId: string;
  readonly locale: EmployeeLocale;
  readonly metadata: NativePushRuntimeMetadata;
  readonly token: string;
}

export interface NativePushPlatformAdapter {
  buildRegistrationRequest(
    input: NativePushRegistrationInput,
  ): StaffPushRegistrationRequest | undefined;
  currentMetadata(): NativePushRuntimeMetadata | undefined;
  deleteCurrentToken(): Promise<void>;
  ensureRetrievalChannel(): Promise<boolean>;
  getCurrentToken(): Promise<string>;
  readPermission(): Promise<NativePushPermissionState>;
  requestPermission(): Promise<NativePushPermissionState>;
  startForegroundPresentation(): () => void;
  subscribeForegroundReceipt(listener: (data: unknown) => void): () => void;
  subscribeToken(listener: (token: string) => void): () => void;
}

export interface NativePushRegistrationTransport {
  reconcile(
    request: StaffPushRegistrationRequest,
  ): Promise<StaffPushRegistrationResponse>;
}

export interface NativePushInstallationId {
  getOrCreate(): Promise<string>;
}

export const emptyNativePushSnapshot = (): NativePushSnapshot => ({
  attentionIntentIds: [],
  channelAvailable: true,
  permission: "unavailable",
  registration: "idle",
});

export const unauthenticatedNativePushAuth = (
  authGeneration: number,
): NativeAuthSnapshot => ({ authGeneration, phase: "unauthenticated" });
