import { useEmployeeStyles } from "../appearance/employee-appearance-context";
import type { ReactNode } from "react";
import { Text, View } from "react-native";
import type { EmployeeConfirmParkedSnapshot } from "@valet/employee-client";

import { EmployeeButton } from "../employee-ui/employee-controls";
import { EmployeeBigCheckIcon } from "../employee-ui/employee-icons";
import { employeeTextStyle } from "../employee-ui/employee-typography";
import { getNativeParkingConfirmCopy } from "./native-parking-confirm-copy";
import { nativeParkingConfirmStylesTheme as sTheme } from "./native-parking-confirm-styles";

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
  const s = useEmployeeStyles(sTheme);

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
  const keyCode = parked.keySlotCode.trim();
  return (
    <View style={s.successWrap}>
      <View style={s.successCircle}>
        <EmployeeBigCheckIcon />
      </View>
      <Text style={[s.successHeading, employeeTextStyle("human", textAlign)]}>
        {copy.parkedTitle}
      </Text>
      <Text style={s.successBody}>{copy.parkingConfirmed}</Text>
      <View style={s.successDetails}>
        <SuccessInfoRow bordered label={copy.vehicle} textAlign={textAlign}>
          <View style={s.successVehicle}>
            <Text
              style={[s.successValue, employeeTextStyle("human", textAlign)]}
            >
              {vehicleName} ·
            </Text>
            <Text style={[s.successValue, s.successIdentifier]}>{plate}</Text>
          </View>
        </SuccessInfoRow>
        <SuccessInfoRow
          bordered={keyCode !== ""}
          label={copy.location}
          textAlign={textAlign}
        >
          <Text style={[s.successValue, s.successIdentifier]}>{location}</Text>
        </SuccessInfoRow>
        {keyCode !== "" ? (
          <SuccessInfoRow label={copy.keySlot} textAlign={textAlign}>
            <Text style={[s.successValue, s.successIdentifier]}>{keyCode}</Text>
          </SuccessInfoRow>
        ) : null}
      </View>
      <EmployeeButton label={copy.done} onPress={onDone} />
    </View>
  );
}

function SuccessInfoRow({
  bordered = false,
  children,
  label,
  textAlign,
}: {
  readonly bordered?: boolean;
  readonly children: ReactNode;
  readonly label: string;
  readonly textAlign: "left" | "right";
}) {
  const s = useEmployeeStyles(sTheme);

  return (
    <View style={[s.successRow, bordered && s.successRowDivider]}>
      <Text style={[s.successLabel, employeeTextStyle("human", textAlign)]}>
        {label}
      </Text>
      {children}
    </View>
  );
}
