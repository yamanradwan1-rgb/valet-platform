import * as Location from "expo-location";
import { Linking } from "react-native";
import { EmployeeApiError } from "@valet/employee-client";
import { shiftPresenceMeasurementSchema } from "@valet/contracts";
import type {
  PresenceAcquisition,
  PresenceChallenge,
} from "@valet/employee-client";

export const nativePresenceAcquisitionMs = 15_000;
export const nativePresenceSampleCap = 3;

type LocationPort = Pick<
  typeof Location,
  | "getForegroundPermissionsAsync"
  | "requestForegroundPermissionsAsync"
  | "hasServicesEnabledAsync"
  | "watchPositionAsync"
>;

function unavailable(code: string): EmployeeApiError {
  return new EmployeeApiError({
    code,
    message: "Foreground location is unavailable.",
    status: 422,
  });
}

/** Only explicit Shift actions call this adapter. No durable measurement state. */
export class NativeShiftPresenceAdapter implements PresenceAcquisition {
  constructor(
    private readonly location: LocationPort = Location,
    private readonly settings: () => Promise<void> = () =>
      Linking.openSettings(),
    private readonly now: () => number = Date.now,
  ) {}

  openSettings(): Promise<void> {
    return this.settings();
  }

  async acquire(challenge: PresenceChallenge, signal: AbortSignal) {
    let subscription: Location.LocationSubscription | undefined;
    let sample:
      ReturnType<typeof shiftPresenceMeasurementSchema.parse> | undefined;
    let completed = false;
    let finish: (error?: EmployeeApiError) => void = () => undefined;
    const onAbort = () => finish(unavailable("LOCATION_CANCELLED"));
    const result = new Promise<
      ReturnType<typeof shiftPresenceMeasurementSchema.parse>
    >((resolve, reject) => {
      finish = (error) => {
        if (completed) return;
        completed = true;
        if (timer !== undefined) clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
        subscription?.remove();
        subscription = undefined;
        const finalSample = sample;
        sample = undefined;
        if (error !== undefined) reject(error);
        else if (finalSample !== undefined) resolve(finalSample);
        else reject(unavailable("GPS_UNAVAILABLE"));
      };
    });
    const timer = setTimeout(() => finish(), nativePresenceAcquisitionMs);
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
    const current = () => !completed && !signal.aborted;
    const beganAt = this.now();
    const run = async () => {
      if (!current()) return;
      let permission = await this.location.getForegroundPermissionsAsync();
      if (!current()) return;
      if (!permission.granted && permission.canAskAgain) {
        permission = await this.location.requestForegroundPermissionsAsync();
        if (!current()) return;
      }
      if (!permission.granted) {
        finish(unavailable("LOCATION_UNAVAILABLE"));
        return;
      }
      const services = await this.location.hasServicesEnabledAsync();
      if (!current()) return;
      if (!services) {
        finish(unavailable("LOCATION_SERVICES_DISABLED"));
        return;
      }
      let samples = 0;
      const watch = await this.location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 1000,
          distanceInterval: 0,
          mayShowUserSettingsDialog: false,
        },
        (value) => {
          if (!current()) return;
          samples += 1;
          const parsed = shiftPresenceMeasurementSchema.safeParse({
            latitude: value.coords.latitude,
            longitude: value.coords.longitude,
            accuracyMeters: value.coords.accuracy,
            capturedAt:
              Number.isFinite(value.timestamp) &&
              Math.abs(value.timestamp) <= 8.64e15
                ? new Date(value.timestamp).toISOString()
                : "",
            ...(typeof value.mocked === "boolean"
              ? { mocked: value.mocked }
              : {}),
          });
          // A cached callback from before this action is never attendance evidence.
          if (
            parsed.success &&
            value.timestamp >= beganAt &&
            value.timestamp <= this.now() + 5000
          ) {
            sample = parsed.data;
            if (sample.accuracyMeters <= challenge.presence.maxAccuracyMeters)
              finish();
          }
          if (samples >= nativePresenceSampleCap) finish();
        },
        () => finish(unavailable("GPS_UNAVAILABLE")),
      );
      if (!current()) watch.remove();
      else subscription = watch;
    };
    void run().catch(() => finish(unavailable("GPS_UNAVAILABLE")));
    return result;
  }
}
