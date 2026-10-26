import { useEffect, useState, useSyncExternalStore } from "react";
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
  onCheck,
  recoveryPending = false,
}: {
  readonly session: EmployeeShiftPresenceSession | undefined;
  readonly locale: FoundationLocale;
  readonly onContinue: () => void;
  readonly onCancel: () => void;
  readonly onCheck?: () => void;
  readonly recoveryPending?: boolean;
}) {
  const [snapshot, update] = useState(() => session?.snapshot());
  useEffect(() => session?.subscribe(update), [session]);
  const palette = useEmployeePalette();
  if (
    session === undefined ||
    snapshot === undefined ||
    (snapshot.phase === "idle" && !recoveryPending) ||
    (snapshot.phase === "confirmed" && !recoveryPending) ||
    (snapshot.mode === "OFF" &&
      snapshot.phase !== "denied" &&
      !recoveryPending &&
      snapshot.checkStatus === undefined)
  )
    return null;
  const copy = getNativePresenceCopy(locale);
  const classification = snapshot.summary?.classification;
  const historicalMessage =
    snapshot.phase === "expired" && recoveryPending
      ? copy.requestUnusable
      : snapshot.reason === "APPROVER_AUTHORITY_REVOKED"
        ? copy.approverRevoked
        : snapshot.reason === "PRESENCE_REQUIRED"
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
                        : snapshot.phase === "confirmed"
                          ? copy.checkFeedback.unresolved
                          : snapshot.phase === "idle"
                            ? copy.checkFeedback["no-attempt"]
                            : copy[snapshot.phase];
  const checking = snapshot.checkStatus === "checking";
  const feedback = snapshot.checkStatus;
  const message =
    feedback === "denied" && onCheck !== undefined
      ? `${copy.checkedDenied} ${historicalMessage}`
      : feedback === "expired" && onCheck !== undefined
        ? recoveryPending
          ? copy.requestUnusable
          : copy.checkedExpired
        : feedback === "context-required"
          ? `${historicalMessage} ${copy.contextRequired}`
          : feedback === "denied" || feedback === "expired"
            ? historicalMessage
            : feedback === "pending" && snapshot.phase === "uncertain"
              ? copy.checkPending
              : feedback === "not-sent"
                ? historicalMessage
                : feedback !== undefined &&
                    feedback !== "approved" &&
                    feedback !== "pending"
                  ? copy.checkFeedback[feedback]
                  : snapshot.phase === "idle"
                    ? copy.checkFeedback["no-attempt"]
                    : historicalMessage;
  const busy =
    checking ||
    ["discovering", "acquiring", "submitting"].includes(snapshot.phase);
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
      (snapshot.mode === "REQUIRE_OR_OVERRIDE" ||
        (snapshot.mode === null && snapshot.phase === "denied")) &&
      ["unavailable", "denied"].includes(snapshot.phase) ? (
        <EmployeeButton
          disabled={checking || recoveryPending}
          label={copy.manager}
          onPress={() => void session.requestManager()}
          variant="secondary"
        />
      ) : null}
      {recoveryPending || ["pending", "uncertain"].includes(snapshot.phase) ? (
        <EmployeeButton
          busy={checking}
          label={copy.check}
          onPress={onCheck ?? (() => void session.checkStatus())}
          variant="secondary"
        />
      ) : null}
      {snapshot.phase === "approved" ? (
        <EmployeeButton
          disabled={checking}
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

/** Keep the existing parent controls consistent with the child recovery lock. */
export function useNativeEndPresenceState(
  session: EmployeeShiftPresenceSession | undefined,
) {
  const state = useSyncExternalStore(
    (notify) => session?.subscribe(notify) ?? (() => undefined),
    () => session?.snapshot(),
  );
  const checking = state?.checkStatus === "checking";
  return {
    checking,
    inputLocked:
      checking ||
      ["uncertain", "pending", "approved", "submitting"].includes(
        state?.phase ?? "",
      ),
    confirmationLocked:
      checking ||
      ["uncertain", "pending", "approved", "submitting"].includes(
        state?.phase ?? "",
      ),
  };
}
