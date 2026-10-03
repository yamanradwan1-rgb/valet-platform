import { useEmployeeStyles } from "../appearance/employee-appearance-context";
import type { EmployeeRetrievalSnapshot } from "@valet/employee-client";
import { Text, View } from "react-native";

import { employeeTextStyle } from "../employee-ui/employee-typography";
import type { NativeRetrievalCopy } from "./native-retrieval-copy";
import { nativeRetrievalStylesTheme as sTheme } from "./native-retrieval-styles";

export function retrievalVehicle(
  snapshot: EmployeeRetrievalSnapshot,
  fallback: string,
) {
  const vehicle = snapshot.session?.vehicle ?? snapshot.task?.vehicle;
  const heading =
    [vehicle?.make, vehicle?.model].filter(Boolean).join(" ") || fallback;
  const identifier = vehicle?.plateNumberRaw ?? vehicle?.temporaryDescriptor;
  return {
    heading,
    value: identifier ? `${heading} · ${identifier}` : heading,
  };
}

export function retrievalLocation(
  snapshot: EmployeeRetrievalSnapshot,
  copy: NativeRetrievalCopy,
) {
  const zone =
    snapshot.session?.parking.parkingZoneCode ?? snapshot.task?.parkingZone;
  const spot =
    snapshot.session?.parking.parkingSpotCode ?? snapshot.task?.parkingSpot;
  if (!zone && !spot) return null;
  return [
    zone ? `${copy.zone} ${zone}` : null,
    spot ? `${copy.spot} ${spot}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function NativeRetrievalDetails({
  copy,
  includeKey = false,
  snapshot,
  textAlign,
}: {
  readonly copy: NativeRetrievalCopy;
  readonly includeKey?: boolean;
  readonly snapshot: EmployeeRetrievalSnapshot;
  readonly textAlign: "left" | "right";
}) {
  const s = useEmployeeStyles(sTheme);

  const vehicle = retrievalVehicle(snapshot, copy.vehicle);
  const location = retrievalLocation(snapshot, copy);
  const rows = [
    { label: copy.vehicle, value: vehicle.value },
    ...(includeKey && snapshot.session?.keySlot?.code
      ? [{ label: copy.key, value: snapshot.session.keySlot.code }]
      : []),
    ...(location ? [{ label: copy.location, value: location }] : []),
  ];
  return (
    <View style={s.detailCard}>
      {rows.map((row, index) => (
        <View key={row.label} style={[s.row, index > 0 && s.rowBorder]}>
          <Text style={[s.rowLabel, employeeTextStyle("human", textAlign)]}>
            {row.label}
          </Text>
          <Text
            style={[s.rowValue, employeeTextStyle("identifier", textAlign)]}
          >
            {row.value}
          </Text>
        </View>
      ))}
    </View>
  );
}
