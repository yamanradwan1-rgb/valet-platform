import type {
  StaffPushRegistrationRequest,
  StaffPushRegistrationResponse,
} from "@valet/contracts";
import type { NativeAuthSnapshot } from "@valet/employee-client";

import { NativePushLifecycleOwner } from "../src/notifications/native-push-lifecycle";
import type {
  NativePushPermissionState,
  NativePushPlatformAdapter,
  NativePushRegistrationTransport,
  NativePushRuntimeMetadata,
} from "../src/notifications/native-push-types";

export const fakeInstallationId = "10000000-0000-4000-8000-000000000001";
export const fakeIntentId = "20000000-0000-4000-8000-000000000002";
export const fakeTokenOne = "synthetic-fcm-token-one";
export const fakeTokenTwo = "synthetic-fcm-token-two";

export const authenticated = (authGeneration = 1): NativeAuthSnapshot => ({
  accessExpiresAt: "2026-09-11T12:15:00.000Z",
  authGeneration,
  phase: "authenticated",
  sessionExpiresAt: "2026-10-11T12:00:00.000Z",
});

export const loggedOut = (authGeneration = 2): NativeAuthSnapshot => ({
  authGeneration,
  phase: "unauthenticated",
  reason: "logged-out",
});

export function validWirePayload(intentId = fakeIntentId) {
  return {
    intentId,
    kind: "EMPLOYEE_RETRIEVAL_REQUESTED",
    routeIntent: "TASK_QUEUE",
    schemaVersion: "1",
  };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

export class FakePushPlatform implements NativePushPlatformAdapter {
  channelCalls = 0;
  channelFails = false;
  channelAvailable = true;
  deleteCalls = 0;
  deleteFails = false;
  foregroundListener: ((data: unknown) => void) | undefined;
  foregroundRemoveCalls = 0;
  getTokenCalls = 0;
  metadata: NativePushRuntimeMetadata | undefined = {
    appBuild: "101",
    appVersion: "1.2.3",
  };
  permission: NativePushPermissionState = "granted";
  permissionReads = 0;
  presentationStarts = 0;
  presentationStops = 0;
  requestedPermission: Promise<NativePushPermissionState> | undefined;
  token = fakeTokenOne;
  tokenListener: ((token: string) => void) | undefined;
  tokenRemoveCalls = 0;

  buildRegistrationRequest(input: {
    installationId: string;
    locale: "ar" | "en";
    metadata: NativePushRuntimeMetadata;
    token: string;
  }) {
    return {
      appBuild: input.metadata.appBuild,
      appIdentifier: "com.vaylet.employee" as const,
      appVersion: input.metadata.appVersion,
      installationId: input.installationId,
      locale: input.locale,
      platform: "ANDROID" as const,
      provider: "FCM" as const,
      providerToken: input.token,
    };
  }

  currentMetadata() {
    return this.metadata;
  }

  async deleteCurrentToken() {
    this.deleteCalls += 1;
    if (this.deleteFails) throw new Error("synthetic local delete failure");
  }

  async ensureRetrievalChannel() {
    this.channelCalls += 1;
    if (this.channelFails) throw new Error("synthetic channel failure");
    return this.channelAvailable;
  }

  async getCurrentToken() {
    this.getTokenCalls += 1;
    return this.token;
  }

  async readPermission() {
    this.permissionReads += 1;
    return this.permission;
  }

  requestPermission() {
    if (this.requestedPermission === undefined)
      return Promise.resolve(this.permission);
    return this.requestedPermission.then((permission) => {
      this.permission = permission;
      return permission;
    });
  }

  startForegroundPresentation() {
    this.presentationStarts += 1;
    return () => {
      this.presentationStops += 1;
    };
  }

  subscribeForegroundReceipt(listener: (data: unknown) => void) {
    this.foregroundListener = listener;
    return () => {
      this.foregroundListener = undefined;
      this.foregroundRemoveCalls += 1;
    };
  }

  subscribeToken(listener: (token: string) => void) {
    this.tokenListener = listener;
    return () => {
      this.tokenListener = undefined;
      this.tokenRemoveCalls += 1;
    };
  }

  emitToken(token: string) {
    this.token = token;
    this.tokenListener?.(token);
  }

  emitForeground(data: unknown) {
    this.foregroundListener?.(data);
  }
}

export class FakePushRegistration implements NativePushRegistrationTransport {
  calls: StaffPushRegistrationRequest[] = [];
  failure: unknown | undefined;
  responsePromise: Promise<StaffPushRegistrationResponse> | undefined;

  async reconcile(request: StaffPushRegistrationRequest) {
    this.calls.push(request);
    if (this.failure !== undefined) throw this.failure;
    if (this.responsePromise !== undefined) return this.responsePromise;
    return registrationResponse(request);
  }
}

export function registrationResponse(
  request: StaffPushRegistrationRequest,
): StaffPushRegistrationResponse {
  return {
    appBuild: request.appBuild,
    appIdentifier: request.appIdentifier,
    appVersion: request.appVersion,
    installationId: request.installationId,
    lastConfirmedAt: "2026-09-11T12:00:00.000Z",
    locale: request.locale,
    platform: request.platform,
    provider: request.provider,
    registrationId: "30000000-0000-4000-8000-000000000003",
    state: "ACTIVE",
  };
}

export function pushHarness() {
  const platform = new FakePushPlatform();
  const registration = new FakePushRegistration();
  const installation = { getOrCreate: async () => fakeInstallationId };
  const owner = new NativePushLifecycleOwner(
    platform,
    installation,
    registration,
  );
  owner.start();
  return { installation, owner, platform, registration };
}
