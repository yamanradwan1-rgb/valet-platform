import { useEmployeeStyles } from "../appearance/employee-appearance-context";
import type {
  EmployeeHandoffSnapshot,
  EmployeeReleaseSnapshot,
} from "@valet/employee-client";
import { Text } from "react-native";

import { EmployeeCard } from "../employee-ui/employee-feedback";
import { employeeTextStyle } from "../employee-ui/employee-typography";
import { nativeHandoffStylesTheme as sTheme } from "./native-handoff-styles";

export function NativeHandoffVehicle({
  eyebrow,
  keyLabel,
  supporting,
  snapshot,
  textAlign,
}: {
  readonly eyebrow?: string | undefined;
  readonly keyLabel?: string | undefined;
  readonly supporting?: string | undefined;
  readonly snapshot: EmployeeHandoffSnapshot | EmployeeReleaseSnapshot;
  readonly textAlign: "left" | "right";
}) {
  const s = useEmployeeStyles(sTheme);

  const vehicle = snapshot.task?.vehicle ?? snapshot.session?.vehicle;
  if (!vehicle) return null;
  const name =
    [vehicle.make, vehicle.model].filter(Boolean).join(" ") ||
    vehicle.temporaryDescriptor ||
    vehicle.plateNumberRaw;
  const identifier = vehicle.plateNumberRaw || vehicle.temporaryDescriptor;
  return (
    <EmployeeCard contentGap="xs">
      {eyebrow ? (
        <Text style={[s.eyebrow, employeeTextStyle("human", textAlign)]}>
          {eyebrow}
        </Text>
      ) : null}
      <Text style={[s.vehicle, employeeTextStyle("identifier", textAlign)]}>
        {identifier && name !== identifier ? `${name} · ${identifier}` : name}
      </Text>
      {keyLabel && snapshot.session?.keySlot?.code ? (
        <Text style={employeeTextStyle("identifier", textAlign)}>
          {keyLabel} · {snapshot.session.keySlot.code}
        </Text>
      ) : null}
      {supporting ? (
        <Text style={[s.cardBody, employeeTextStyle("human", textAlign)]}>
          {supporting}
        </Text>
      ) : null}
    </EmployeeCard>
  );
}
