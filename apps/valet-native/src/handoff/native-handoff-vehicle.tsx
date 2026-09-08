import type { EmployeeHandoffSnapshot } from "@valet/employee-client";
import { Text } from "react-native";

import { EmployeeCard } from "../employee-ui/employee-feedback";
import { employeeTextStyle } from "../employee-ui/employee-typography";
import { nativeHandoffStyles as s } from "./native-handoff-styles";

export function NativeHandoffVehicle({
  snapshot,
  textAlign,
}: {
  readonly snapshot: EmployeeHandoffSnapshot;
  readonly textAlign: "left" | "right";
}) {
  const vehicle = snapshot.task?.vehicle;
  if (!vehicle) return null;
  const name =
    [vehicle.make, vehicle.model].filter(Boolean).join(" ") ||
    vehicle.temporaryDescriptor ||
    vehicle.plateNumberRaw;
  const identifier = vehicle.plateNumberRaw || vehicle.temporaryDescriptor;
  return (
    <EmployeeCard>
      <Text style={[s.vehicle, employeeTextStyle("human", textAlign)]}>
        {name}
      </Text>
      {identifier ? (
        <Text style={employeeTextStyle("identifier", textAlign)}>
          {identifier}
        </Text>
      ) : null}
    </EmployeeCard>
  );
}
