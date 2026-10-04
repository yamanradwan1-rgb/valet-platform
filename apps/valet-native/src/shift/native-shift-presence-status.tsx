import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import type { EmployeeShiftPresenceSession } from "@valet/employee-client";
import { EmployeeButton } from "../employee-ui/employee-controls";
import {
  employeeTextStyle,
  employeeTypography,
} from "../employee-ui/employee-typography";
import { useEmployeePalette } from "../appearance/employee-appearance-context";
import type { FoundationLocale } from "../foundation/foundation-locale";
import { getNativePresenceCopy } from "./native-shift-presence-copy";

/** Uses the existing Shift feedback region and control primitives. */
export function NativeShiftPresenceStatus({
  session,
  locale,
  onContinue,
  onCancel,
}: {
  readonly session: EmployeeShiftPresenceSession | undefined;
  readonly locale: FoundationLocale;
  readonly onContinue: () => void;
  readonly onCancel: () => void;
}) {
  const [snapshot, update] = useState(() => session?.snapshot());
  useEffect(() => session?.subscribe(update), [session]);
  const palette = useEmployeePalette();
  if (
    session === undefined ||
    snapshot === undefined ||
    snapshot.phase === "idle" ||
    snapshot.phase === "confirmed" ||
    (snapshot.mode === "OFF" && snapshot.phase !== "denied")
  )
    return null;
  const copy = getNativePresenceCopy(locale);
  const classification = snapshot.summary?.classification;
  const message =
    snapshot.reason === "PRESENCE_REQUIRED"
      ? copy.required
      : classification === "CONFIDENT_OUTSIDE"
        ? copy.outside
        : classification === "AMBIGUOUS_EDGE"
          ? copy.ambiguous
          : classification === "CONFIGURATION_UNUSABLE"
            ? copy.configuration
            : snapshot.summary?.reason === "INACCURATE_FIX"
              ? copy.inaccurate
              : ["STALE_FIX", "FUTURE_FIX"].includes(
                    snapshot.summary?.reason ?? "",
                  )
                ? copy.stale
                : snapshot.reason === "LOCATION_UNAVAILABLE"
                  ? copy.permission
                  : snapshot.reason === "LOCATION_SERVICES_DISABLED"
                    ? copy.services
                    : copy[snapshot.phase];
  const busy = ["discovering", "acquiring", "submitting"].includes(
    snapshot.phase,
  );
  return (
    <View style={{ gap: 8 }} testID="native-shift-presence-status">
      <Text
        accessibilityLiveRegion="polite"
        accessibilityState={{ busy }}
        style={[
          employeeTypography.small,
          { color: palette.textSecondary },
          employeeTextStyle("human", locale === "ar" ? "right" : "left"),
        ]}
      >
        {message}
      </Text>
      {snapshot.phase === "acquiring" ? (
        <Text
          style={[
            employeeTypography.small,
            { color: palette.textMuted },
            employeeTextStyle("human", locale === "ar" ? "right" : "left"),
          ]}
        >
          {copy.pointInTime}
        </Text>
      ) : null}
      {snapshot.overrideReason !== null &&
      snapshot.mode === "REQUIRE_OR_OVERRIDE" &&
      ["unavailable", "denied"].includes(snapshot.phase) ? (
        <EmployeeButton
          label={copy.manager}
          onPress={() => void session.requestManager()}
          variant="secondary"
        />
      ) : null}
      {["pending", "uncertain"].includes(snapshot.phase) ? (
        <EmployeeButton
          label={copy.check}
          onPress={() => void session.checkStatus()}
          variant="secondary"
        />
      ) : null}
      {snapshot.phase === "approved" ? (
        <EmployeeButton
          label={copy.continue}
          onPress={onContinue}
          variant="secondary"
        />
      ) : null}
      {snapshot.phase === "unavailable" ? (
        <EmployeeButton
          label={copy.settings}
          onPress={() => void session.openSettings().catch(() => undefined)}
          variant="secondary"
        />
      ) : null}
      {["discovering", "acquiring"].includes(snapshot.phase) ? (
        <EmployeeButton
          label={copy.cancel}
          onPress={() => {
            onCancel();
            session.cancel();
          }}
          variant="secondary"
        />
      ) : null}
    </View>
  );
}
