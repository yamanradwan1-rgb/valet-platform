import * as Location from "expo-location";
import { Linking } from "react-native";

export type NativeTaskLocationAccess =
  | { readonly kind: "granted" }
  | { readonly canAskAgain: boolean; readonly kind: "denied" }
  | { readonly kind: "services-disabled" };

export interface NativeTaskLocationFix {
  readonly accuracyMeters: number | null;
  readonly latitude: number;
  readonly longitude: number;
  readonly timestamp: number;
}

export interface NativeTaskLocationWatcher {
  remove(): void;
}

export interface NativeTaskLocationPort {
  ensureAccess(requestPermission: boolean): Promise<NativeTaskLocationAccess>;
  inspectAccess(): Promise<NativeTaskLocationAccess>;
  openSettings(): Promise<void>;
  watch(
    onFix: (fix: NativeTaskLocationFix) => void,
    onError: () => void,
  ): Promise<NativeTaskLocationWatcher>;
}

type ExpoLocationPort = Pick<
  typeof Location,
  | "getForegroundPermissionsAsync"
  | "requestForegroundPermissionsAsync"
  | "hasServicesEnabledAsync"
  | "watchPositionAsync"
>;

export class NativeTaskLocationAdapter implements NativeTaskLocationPort {
  constructor(
    private readonly location: ExpoLocationPort = Location,
    private readonly settings: () => Promise<void> = () => Linking.openSettings(),
  ) {}

  async ensureAccess(requestPermission: boolean): Promise<NativeTaskLocationAccess> {
    let permission = await this.location.getForegroundPermissionsAsync();
    if (!permission.granted && permission.canAskAgain && requestPermission) {
      permission = await this.location.requestForegroundPermissionsAsync();
    }
    if (!permission.granted) {
      return { canAskAgain: permission.canAskAgain, kind: "denied" };
    }
    return (await this.location.hasServicesEnabledAsync())
      ? { kind: "granted" }
      : { kind: "services-disabled" };
  }

  inspectAccess(): Promise<NativeTaskLocationAccess> {
    return this.ensureAccess(false);
  }

  openSettings(): Promise<void> {
    return this.settings();
  }

  async watch(
    onFix: (fix: NativeTaskLocationFix) => void,
    onError: () => void,
  ): Promise<NativeTaskLocationWatcher> {
    return this.location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        distanceInterval: 0,
        mayShowUserSettingsDialog: false,
        timeInterval: 1_000,
      },
      (value) =>
        onFix({
          accuracyMeters: value.coords.accuracy,
          latitude: value.coords.latitude,
          longitude: value.coords.longitude,
          timestamp: value.timestamp,
        }),
      onError,
    );
  }
}
