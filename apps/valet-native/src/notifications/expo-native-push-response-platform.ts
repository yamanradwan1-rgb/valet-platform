import * as Notifications from "expo-notifications";

import type { NativePushResponsePlatform } from "./native-push-response-types";

export class ExpoNativePushResponsePlatform implements NativePushResponsePlatform {
  readonly defaultActionIdentifier = Notifications.DEFAULT_ACTION_IDENTIFIER;

  async clearLastResponse(): Promise<void> {
    Notifications.clearLastNotificationResponse();
  }

  async getLastResponse(): Promise<unknown | null> {
    return Notifications.getLastNotificationResponse();
  }

  subscribeResponse(listener: (response: unknown) => void): () => void {
    try {
      const subscription =
        Notifications.addNotificationResponseReceivedListener(listener);
      return () => {
        try {
          subscription.remove();
        } catch {
          // Response cleanup cannot affect application operation.
        }
      };
    } catch {
      return () => undefined;
    }
  }
}
