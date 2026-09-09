import { Text, View } from "react-native";
import type { EmployeeConfirmParkedSnapshot } from "@valet/employee-client";

import { EmployeeButton } from "../employee-ui/employee-controls";
import { EmployeeCard } from "../employee-ui/employee-feedback";
import { employeeTextStyle } from "../employee-ui/employee-typography";
import { getNativeParkingConfirmCopy } from "./native-parking-confirm-copy";
import { nativeParkingConfirmStyles as s } from "./native-parking-confirm-styles";

export function NativeParkingSuccess({
  copy,
  onDone,
  snapshot,
  textAlign,
}: {
  readonly copy: ReturnType<typeof getNativeParkingConfirmCopy>;
  readonly onDone: () => void;
  readonly snapshot: EmployeeConfirmParkedSnapshot;
  readonly textAlign: "left" | "right";
}) {
  const parked = snapshot.parked;
  if (parked === null) return null;
  const spot =
    parked.source === "command"
      ? parked.response.parkingSpotCode
      : parked.parkingSpotCode;
  const vehicle = snapshot.session?.vehicle;
  const vehicleName =
    [vehicle?.make, vehicle?.model].filter(Boolean).join(" ") || copy.vehicle;
  const plate = vehicle?.plateNumberRaw ?? vehicle?.temporaryDescriptor ?? "—";
  const zone = snapshot.session?.parking.parkingZoneCode;
  const location = zone
    ? `${copy.zone} ${zone} · ${copy.spot} ${spot}`
    : `${copy.spot} ${spot}`;
  return (
    <View style={s.successWrap}>
      <View style={s.successCircle}>
        <Text style={s.successMark}>✓</Text>
      </View>
      <Text style={[s.successHeading, employeeTextStyle("human", textAlign)]}>
        {copy.parkedTitle}
      </Text>
      <Text style={s.successBody}>{copy.parkingConfirmed}</Text>
      <EmployeeCard>
        <Text style={employeeTextStyle("human", textAlign)}>
          {copy.vehicle}
        </Text>
        <Text style={s.identifier}>
          {vehicleName} · {plate}
        </Text>
        <Text style={employeeTextStyle("human", textAlign)}>
          {copy.location}
        </Text>
        <Text style={s.identifier}>{location}</Text>
        <Text style={employeeTextStyle("human", textAlign)}>
          {copy.keySlot}
        </Text>
        <Text style={s.identifier}>{parked.keySlotCode}</Text>
      </EmployeeCard>
      <EmployeeButton label={copy.done} onPress={onDone} />
    </View>
  );
}
