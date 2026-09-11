import * as Application from "expo-application";
import * as Notifications from "expo-notifications";
import { PermissionStatus } from "expo-notifications";
import { Platform } from "react-native";
import { staffPushRegistrationRequestSchema } from "@valet/contracts";

import type {
  NativePushPermissionState,
  NativePushPlatformAdapter,
  NativePushRegistrationInput,
  NativePushRuntimeMetadata,
} from "./native-push-types";

export const nativeRetrievalChannelId = "vaylet-operational-retrieval";

function permissionState(
  permission: Notifications.NotificationPermissionsStatus,
): NativePushPermissionState {
  if (permission.granted || permission.status === PermissionStatus.GRANTED) {
    return "granted";
  }
  if (permission.status === PermissionStatus.UNDETERMINED) {
    return permission.canAskAgain ? "undetermined" : "blocked";
  }
  if (permission.status === PermissionStatus.DENIED) {
    return permission.canAskAgain ? "denied" : "blocked";
  }
  return "unavailable";
}

function androidProviderToken(value: Notifications.DevicePushToken): string {
  if (
    value.type !== "android" ||
    typeof value.data !== "string" ||
    value.data.length === 0 ||
    value.data.length > 4_096 ||
    value.data.trim().length === 0
  ) {
    throw new Error("Native push token is unavailable.");
  }
  return value.data;
}

function subscribeSafely(create: () => { remove(): void }): () => void {
  try {
    const subscription = create();
    return () => {
      try {
        subscription.remove();
      } catch {
        // Notification capability cleanup cannot affect application operation.
      }
    };
  } catch {
    return () => undefined;
  }
}

export class AndroidExpoNotificationAdapter implements NativePushPlatformAdapter {
  private channelReady = false;
  private channelSetup: Promise<void> | undefined;

  buildRegistrationRequest(input: NativePushRegistrationInput) {
    const parsed = staffPushRegistrationRequestSchema.safeParse({
      appBuild: input.metadata.appBuild,
      appIdentifier: "com.vaylet.employee",
      appVersion: input.metadata.appVersion,
      installationId: input.installationId,
      locale: input.locale,
      platform: "ANDROID",
      provider: "FCM",
      providerToken: input.token,
    });
    return parsed.success ? parsed.data : undefined;
  }

  currentMetadata(): NativePushRuntimeMetadata | undefined {
    const appVersion = Application.nativeApplicationVersion;
    const appBuild = Application.nativeBuildVersion;
    if (
      typeof appVersion !== "string" ||
      appVersion.trim() === "" ||
      typeof appBuild !== "string" ||
      appBuild.trim() === ""
    ) {
      return undefined;
    }
    return { appBuild, appVersion };
  }

  async deleteCurrentToken(): Promise<void> {
    if (Platform.OS !== "android") return;
    await Notifications.unregisterForNotificationsAsync();
  }

  async ensureRetrievalChannel(): Promise<boolean> {
    if (Platform.OS !== "android") return false;
    if (!this.channelReady) {
      if (this.channelSetup === undefined) {
        const setup = Notifications.setNotificationChannelAsync(
          nativeRetrievalChannelId,
          {
            description: "Operational retrieval alerts",
            importance: Notifications.AndroidImportance.DEFAULT,
            name: "Retrieval updates",
          },
        ).then(() => {
          this.channelReady = true;
        });
        this.channelSetup = setup;
      }
      try {
        await this.channelSetup;
      } finally {
        this.channelSetup = undefined;
      }
    }
    const channel = await Notifications.getNotificationChannelAsync(
      nativeRetrievalChannelId,
    );
    return (
      channel !== null &&
      channel.importance !== Notifications.AndroidImportance.NONE
    );
  }

  async getCurrentToken(): Promise<string> {
    if (Platform.OS !== "android") {
      throw new Error("Native push is unavailable on this platform.");
    }
    return androidProviderToken(await Notifications.getDevicePushTokenAsync());
  }

  async readPermission(): Promise<NativePushPermissionState> {
    if (Platform.OS !== "android") return "unavailable";
    return permissionState(await Notifications.getPermissionsAsync());
  }

  async requestPermission(): Promise<NativePushPermissionState> {
    if (Platform.OS !== "android") return "unavailable";
    return permissionState(await Notifications.requestPermissionsAsync());
  }

  startForegroundPresentation(): () => void {
    try {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldPlaySound: false,
          shouldSetBadge: false,
          shouldShowBanner: false,
          shouldShowList: false,
        }),
      });
      return () => {
        try {
          Notifications.setNotificationHandler(null);
        } catch {
          // Notification cleanup cannot affect application operation.
        }
      };
    } catch {
      return () => undefined;
    }
  }

  subscribeForegroundReceipt(listener: (data: unknown) => void): () => void {
    return subscribeSafely(() =>
      Notifications.addNotificationReceivedListener((notification) =>
        listener(notification.request.content.data),
      ),
    );
  }

  subscribeToken(listener: (token: string) => void): () => void {
    return subscribeSafely(() =>
      Notifications.addPushTokenListener((candidate) => {
        try {
          listener(androidProviderToken(candidate));
        } catch {
          // Invalid provider callbacks are ignored without exposing their value.
        }
      }),
    );
  }
}
