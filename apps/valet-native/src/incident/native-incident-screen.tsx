import {
  useEmployeeStyles,
  useEmployeePalette,
} from "../appearance/employee-appearance-context";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";

import { EmployeeBackHeader } from "../employee-ui/employee-back-header";
import { EmployeeButton } from "../employee-ui/employee-controls";
import { EmployeeErrorNotice } from "../employee-ui/employee-feedback";
import { EmployeeAlertIcon } from "../employee-ui/employee-icons";

import { employeeTextStyle } from "../employee-ui/employee-typography";
import type { FoundationLocale } from "../foundation/foundation-locale";
import { getNativeIncidentCopy } from "./native-incident-copy";
import { NativeIncidentForm } from "./native-incident-form";
import type { NativeIncidentSession } from "./native-incident-session";
import { nativeIncidentStylesTheme as sTheme } from "./native-incident-styles";
import {
  nativeIncidentVehicleIdentity,
  type NativeIncidentSnapshot,
} from "./native-incident-types";

export function NativeIncidentScreen({
  locale,
  onClose,
  session,
  snapshot,
}: {
  readonly locale: FoundationLocale;
  readonly onClose: () => void;
  readonly session: NativeIncidentSession;
  readonly snapshot: NativeIncidentSnapshot;
}) {
  const p = useEmployeePalette();
  const s = useEmployeeStyles(sTheme);

  const copy = getNativeIncidentCopy(locale);
  const direction = locale === "ar" ? "rtl" : "ltr";
  const textAlign = locale === "ar" ? "right" : "left";
  if (snapshot.phase === "loading" || snapshot.phase === "recovery-checking") {
    return (
      <View
        accessibilityLabel={
          snapshot.phase === "loading"
            ? copy.loadingSession
            : copy.recoveryChecking
        }
        accessibilityRole="progressbar"
        style={s.loading}
      >
        <ActivityIndicator color={p.linkPrimary} size={32} />
        <Text
          style={[
            { fontSize: 14, fontWeight: "600" },
            p.mode === "dark" && { color: p.textPrimary },
            employeeTextStyle("human", textAlign),
          ]}
        >
          {snapshot.phase === "loading"
            ? copy.loadingSession
            : copy.recoveryChecking}
        </Text>
      </View>
    );
  }
  if (snapshot.phase === "success" && snapshot.report) {
    const vehicle =
      snapshot.detail === null
        ? null
        : nativeIncidentVehicleIdentity(snapshot.detail);
    return (
      <ScrollView contentContainerStyle={[s.resultBody, { direction }]}>
        <View style={s.resultIcon}>
          <EmployeeAlertIcon size={32} />
        </View>
        <View>
          <Text style={s.resultTitle}>{copy.incidentOpened}</Text>
          <Text
            style={[s.resultReference, employeeTextStyle("human", textAlign)]}
          >
            {copy.reference}:{" "}
            <Text style={employeeTextStyle("identifier", textAlign)}>
              {snapshot.report.incidentId}
            </Text>
          </Text>
        </View>
        <View style={s.resultSummary} testID="native-incident-result-summary">
          <ResultRow
            divider
            label={copy.typeLabel}
            textAlign={textAlign}
            value={copy.types[snapshot.report.type]}
          />
          <ResultRow
            divider
            label={copy.severityLabel}
            textAlign={textAlign}
            value={copy.severities[snapshot.report.severity]}
          />
          {vehicle === null ? null : (
            <ResultRow
              identifierSuffix={vehicle.identifier}
              label={copy.vehicle}
              textAlign={textAlign}
              value={vehicle.heading}
            />
          )}
        </View>
        <View style={s.resultCard}>
          <EmployeeButton
            label={copy.returnLabel}
            onPress={() => {
              void session.acknowledge().then((cleared) => {
                if (cleared) onClose();
              });
            }}
          />
        </View>
      </ScrollView>
    );
  }
  if (snapshot.phase.startsWith("recovery-")) {
    const message = recoveryMessage(copy, snapshot);
    return (
      <ScrollView contentContainerStyle={[s.body, { direction }]}>
        <EmployeeBackHeader
          accessibilityLabel={copy.back}
          direction={direction}
          onBack={onClose}
          textAlign={textAlign}
          title={copy.reportIncident}
        />
        <EmployeeErrorNotice textAlign={textAlign} title={copy.reportIncident}>
          {snapshot.deadlineReached
            ? `${copy.recoveryDeadline} ${message}`
            : message}
        </EmployeeErrorNotice>
        {snapshot.phase === "recovery-reserved" ? (
          <EmployeeButton
            label={copy.retireAttempt}
            onPress={() => void session.retire()}
            variant="danger"
          />
        ) : null}
        {snapshot.phase === "recovery-unavailable" ||
        snapshot.phase === "recovery-reserved" ? (
          <EmployeeButton
            label={copy.retry}
            onPress={() => void session.retryRecovery()}
          />
        ) : (
          <EmployeeButton
            label={copy.returnLabel}
            onPress={() => {
              void session.acknowledge().then((cleared) => {
                if (cleared) onClose();
              });
            }}
          />
        )}
      </ScrollView>
    );
  }
  return (
    <>
      <EmployeeBackHeader
        accessibilityLabel={copy.back}
        direction={direction}
        onBack={onClose}
        textAlign={textAlign}
        title={copy.reportIncident}
      />
      <ScrollView contentContainerStyle={[s.body, { direction }]}>
        {snapshot.phase === "context-error" ? (
          <>
            <EmployeeErrorNotice
              textAlign={textAlign}
              title={copy.cannotEstablishSession}
            >
              {copy.sessionContextError}
            </EmployeeErrorNotice>
            <EmployeeButton
              label={copy.retry}
              onPress={() => void session.retryContext()}
            />
            <EmployeeButton
              label={copy.back}
              onPress={onClose}
              variant="secondary"
            />
          </>
        ) : (
          <NativeIncidentForm
            locale={locale}
            session={session}
            snapshot={snapshot}
          />
        )}
      </ScrollView>
    </>
  );
}

function recoveryMessage(
  copy: ReturnType<typeof getNativeIncidentCopy>,
  snapshot: NativeIncidentSnapshot,
): string {
  if (snapshot.phase === "recovery-reserved") return copy.recoveryReserved;
  if (snapshot.phase === "recovery-retired") return copy.recoveryRetired;
  if (snapshot.phase === "recovery-unknown") return copy.recoveryUnknown;
  if (snapshot.phase === "recovery-invalidated")
    return copy.recoveryInvalidated;
  return copy.recoveryUnavailable;
}

function ResultRow({
  divider = false,
  identifierSuffix,
  label,
  textAlign,
  value,
}: {
  readonly divider?: boolean | undefined;
  readonly identifierSuffix?: string | undefined;
  readonly label: string;
  readonly textAlign: "left" | "right";
  readonly value: string;
}) {
  const p = useEmployeePalette();

  return (
    <View
      style={{
        borderBottomColor: p.border,
        borderBottomWidth: divider ? 1 : 0,
        flexDirection: "row",
        gap: 16,
        justifyContent: "space-between",
        paddingVertical: 12,
      }}
    >
      <Text
        style={[
          { color: p.textSecondary },
          employeeTextStyle("human", textAlign),
        ]}
      >
        {label}
      </Text>
      <Text
        style={[
          { color: p.textPrimary, fontWeight: "600" },
          employeeTextStyle("human", textAlign),
        ]}
      >
        {value}
        {identifierSuffix ? (
          <>
            {" · "}
            <Text style={employeeTextStyle("identifier", textAlign)}>
              {identifierSuffix}
            </Text>
          </>
        ) : null}
      </Text>
    </View>
  );
}
