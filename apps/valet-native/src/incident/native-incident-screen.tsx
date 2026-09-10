import { ActivityIndicator, ScrollView, Text, View } from "react-native";

import { EmployeeBackHeader } from "../employee-ui/employee-back-header";
import { EmployeeButton } from "../employee-ui/employee-controls";
import { EmployeeErrorNotice } from "../employee-ui/employee-feedback";
import { EmployeeAlertIcon } from "../employee-ui/employee-icons";
import { employeeColors as c } from "../employee-ui/employee-tokens";
import { employeeTextStyle } from "../employee-ui/employee-typography";
import type { FoundationLocale } from "../foundation/foundation-locale";
import { getNativeIncidentCopy } from "./native-incident-copy";
import { NativeIncidentForm } from "./native-incident-form";
import type { NativeIncidentSession } from "./native-incident-session";
import { nativeIncidentStyles as s } from "./native-incident-styles";
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
  const copy = getNativeIncidentCopy(locale);
  const direction = locale === "ar" ? "rtl" : "ltr";
  const textAlign = locale === "ar" ? "right" : "left";
  if (snapshot.phase === "loading") {
    return (
      <View
        accessibilityLabel={copy.loadingSession}
        accessibilityRole="progressbar"
        style={s.loading}
      >
        <ActivityIndicator color={c.blue} size={32} />
        <Text
          style={[
            { fontSize: 14, fontWeight: "600" },
            employeeTextStyle("human", textAlign),
          ]}
        >
          {copy.loadingSession}
        </Text>
      </View>
    );
  }
  if (snapshot.phase === "success" && snapshot.report && snapshot.detail) {
    const vehicle = nativeIncidentVehicleIdentity(snapshot.detail);
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
          <ResultRow
            identifierSuffix={vehicle.identifier}
            label={copy.vehicle}
            textAlign={textAlign}
            value={vehicle.heading}
          />
        </View>
        <View style={s.resultCard}>
          <EmployeeButton label={copy.returnLabel} onPress={onClose} />
        </View>
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
  return (
    <View
      style={{
        borderBottomColor: c.border,
        borderBottomWidth: divider ? 1 : 0,
        flexDirection: textAlign === "right" ? "row-reverse" : "row",
        gap: 16,
        justifyContent: "space-between",
        paddingVertical: 12,
      }}
    >
      <Text
        style={[{ color: c.neutral }, employeeTextStyle("human", textAlign)]}
      >
        {label}
      </Text>
      <Text
        style={[
          { color: c.navy, fontWeight: "600" },
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
