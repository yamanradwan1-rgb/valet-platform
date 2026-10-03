import { useEmployeeStyles } from "../appearance/employee-appearance-context";
import { useState } from "react";
import { Text, View } from "react-native";
import type {
  EmployeeCheckInSession,
  EmployeeCheckInSnapshot,
} from "@valet/employee-client";

import type { NativeCheckInCopy } from "./native-check-in-copy";
import {
  CheckInButton,
  CheckInField,
  type NativeTextAlign,
  VehicleCard,
} from "./native-check-in-primitives";
import { checkInTextStyle } from "./native-check-in-presentation";
import { checkInStylesTheme as sTheme } from "./native-check-in-styles";

export function NativeReturningStep({
  copy,
  session,
  snapshot,
  textAlign,
}: {
  readonly copy: NativeCheckInCopy;
  readonly session: EmployeeCheckInSession;
  readonly snapshot: EmployeeCheckInSnapshot;
  readonly textAlign: NativeTextAlign;
}) {
  const s = useEmployeeStyles(sTheme);

  const vehicle = snapshot.recognizedVehicle;
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState({ color: "", make: "", model: "" });
  if (vehicle === null) return null;
  const suggestion = vehicle.returningCustomer;
  const beginEditing = () => {
    setValues({
      color: vehicle.color ?? "",
      make: vehicle.make ?? "",
      model: vehicle.model ?? "",
    });
    setEditing(true);
  };
  if (editing) {
    return (
      <NativeReturningVehicleEditor
        copy={copy}
        onCancel={() => setEditing(false)}
        onChange={setValues}
        onSave={(details) => {
          session.setReturningVehicleCorrection(details);
          setEditing(false);
        }}
        textAlign={textAlign}
        values={values}
      />
    );
  }
  return (
    <>
      <VehicleCard
        fallback={copy.vehicle}
        textAlign={textAlign}
        vehicle={vehicle}
      />
      {suggestion ? (
        <View
          accessible
          accessibilityLabel={`${copy.returningCustomer}, ${suggestion.displayName ? `${suggestion.displayName}, ` : ""}${copy.phoneEnding} ${suggestion.phoneSuffix}`}
          style={s.card}
        >
          <Text style={[s.eyebrow, checkInTextStyle("human", textAlign)]}>
            {copy.returningCustomer}
          </Text>
          {suggestion.displayName ? (
            <Text style={[s.fieldLabel, checkInTextStyle("human", textAlign)]}>
              {suggestion.displayName}
            </Text>
          ) : null}
          <Text style={[s.text, checkInTextStyle("human", textAlign)]}>
            {copy.phoneEnding}{" "}
            <Text style={{ writingDirection: "ltr" }}>
              {suggestion.phoneSuffix}
            </Text>
          </Text>
        </View>
      ) : null}
      {suggestion ? (
        <CheckInButton
          label={copy.useSavedCustomer}
          onPress={() => void session.useSavedCustomer()}
        />
      ) : null}
      <CheckInButton
        label={suggestion ? copy.differentCustomer : copy.continueToCustomer}
        onPress={() => session.chooseDifferentCustomer()}
        secondary={suggestion !== null}
      />
      <CheckInButton
        label={copy.correctVehicleDetails}
        onPress={beginEditing}
        variant="ghost"
      />
    </>
  );
}

export function NativeReturningVehicleEditor({
  copy,
  onCancel,
  onChange,
  onSave,
  textAlign,
  values,
}: {
  readonly copy: NativeCheckInCopy;
  readonly onCancel: () => void;
  readonly onChange: (values: {
    color: string;
    make: string;
    model: string;
  }) => void;
  readonly onSave: (details: {
    color: string | null;
    make: string | null;
    model: string | null;
  }) => void;
  readonly textAlign: NativeTextAlign;
  readonly values: { color: string; make: string; model: string };
}) {
  const s = useEmployeeStyles(sTheme);

  return (
    <>
      <View style={s.card}>
        {(["make", "model", "color"] as const).map((field) => (
          <CheckInField
            accessibilityLabel={copy[field]}
            key={field}
            kind="human"
            maxLength={120}
            onChangeText={(value) => onChange({ ...values, [field]: value })}
            textAlign={textAlign}
            value={values[field]}
          />
        ))}
      </View>
      <CheckInButton
        label={copy.done}
        onPress={() =>
          onSave({
            color: optionalDetail(values.color, copy.unknown),
            make: optionalDetail(values.make, copy.unknown),
            model: optionalDetail(values.model, copy.unknown),
          })
        }
      />
      <CheckInButton label={copy.cancel} onPress={onCancel} secondary />
    </>
  );
}

function optionalDetail(value: string, unknown: string) {
  const trimmed = value.trim();
  return trimmed === "" || trimmed === unknown ? null : trimmed;
}
