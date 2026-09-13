import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import type { IncidentSeverity, IncidentType } from "@valet/employee-client";

import { EmployeeButton } from "../employee-ui/employee-controls";
import { employeeTextStyle } from "../employee-ui/employee-typography";
import type { FoundationLocale } from "../foundation/foundation-locale";
import {
  getNativeIncidentCopy,
  presentNativeIncidentFailure,
} from "./native-incident-copy";
import type { NativeIncidentSession } from "./native-incident-session";
import { nativeIncidentStyles as s } from "./native-incident-styles";
import {
  nativeIncidentSeverities,
  nativeIncidentTypes,
  nativeIncidentVehicleIdentity,
  type NativeIncidentSnapshot,
} from "./native-incident-types";

export function NativeIncidentForm({
  locale,
  session,
  snapshot,
}: {
  readonly locale: FoundationLocale;
  readonly session: NativeIncidentSession;
  readonly snapshot: NativeIncidentSnapshot;
}) {
  const copy = getNativeIncidentCopy(locale);
  const textAlign = locale === "ar" ? "right" : "left";
  const [type, setType] = useState<IncidentType | null>(null);
  const [severity, setSeverity] = useState<IncidentSeverity>("LOW");
  const [description, setDescription] = useState("");
  const detail = snapshot.detail;
  if (detail === null) return null;
  const vehicle = nativeIncidentVehicleIdentity(detail);
  const submitting =
    snapshot.phase === "submitting" || snapshot.phase === "reserving";

  return (
    <>
      <View style={s.contextCard}>
        <Text style={[s.contextVehicle, employeeTextStyle("human", textAlign)]}>
          {vehicle.heading} ·{" "}
          <Text style={employeeTextStyle("identifier", textAlign)}>
            {vehicle.identifier}
          </Text>
        </Text>
        <Text style={[s.contextSession, employeeTextStyle("human", textAlign)]}>
          {copy.sessionLabel}{" "}
          <Text style={employeeTextStyle("identifier", textAlign)}>
            {detail.sessionId.slice(0, 8)}…
          </Text>
        </Text>
      </View>

      <Text style={[s.label, employeeTextStyle("human", textAlign)]}>
        {copy.selectType}
      </Text>
      <View style={s.grid}>
        {nativeIncidentTypes.map((value) => (
          <Choice
            key={value}
            label={copy.types[value]}
            onPress={() => setType(value)}
            selected={type === value}
            style={s.optionHalf}
            textAlign={textAlign}
          />
        ))}
      </View>

      <Text style={[s.label, employeeTextStyle("human", textAlign)]}>
        {copy.severityLabel}
      </Text>
      <View style={s.grid}>
        {nativeIncidentSeverities.map((value) => (
          <Choice
            key={value}
            label={copy.severities[value]}
            onPress={() => setSeverity(value)}
            selected={severity === value}
            style={s.optionQuarter}
            textAlign={textAlign}
          />
        ))}
      </View>

      <TextInput
        accessibilityLabel={copy.describeIncident}
        editable={!submitting}
        maxLength={500}
        multiline
        onChangeText={setDescription}
        placeholder={copy.describeIncident}
        style={[s.description, employeeTextStyle("human", textAlign)]}
        value={description}
      />
      {snapshot.error !== null ? (
        <Text
          accessibilityLiveRegion="assertive"
          accessibilityRole="alert"
          style={[s.error, employeeTextStyle("human", textAlign)]}
        >
          {presentNativeIncidentFailure(locale, snapshot.error)}
        </Text>
      ) : null}
      <EmployeeButton
        busy={submitting}
        disabled={type === null || description.trim().length === 0}
        label={submitting ? copy.opening : copy.openIncident}
        onPress={() => {
          if (type === null) return;
          void session.submit({ description, severity, type });
        }}
        variant="danger"
      />
    </>
  );
}

function Choice({
  label,
  onPress,
  selected,
  style,
  textAlign,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly selected: boolean;
  readonly style: object;
  readonly textAlign: "left" | "right";
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[s.choice, style, selected && s.choiceSelected]}
    >
      <Text
        style={[
          s.choiceLabel,
          employeeTextStyle("human", textAlign),
          selected && s.choiceSelectedLabel,
          style === s.optionQuarter && s.severityLabel,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
