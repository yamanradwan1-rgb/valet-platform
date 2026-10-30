import { createEmployeeStyles } from "../appearance/employee-themed-styles";
import { useEmployeeStyles } from "../appearance/employee-appearance-context";
import { Text, View } from "react-native";
import type { EmployeeCheckInSnapshot } from "@valet/employee-client";

import type { NativeCheckInCopy } from "./native-check-in-copy";
import {
  checkInIdentityLabel,
  type NativeCapturePresentation,
} from "./native-check-in-presentation";
import type { NativeTextAlign } from "./native-check-in-primitives";
import { isPlateCountry } from "./native-plate-country-selector";
import {
  employeeRadius,
  employeeSpacing as space,
} from "../employee-ui/employee-tokens";
import {
  employeeTextStyle,
  employeeTypography as type,
} from "../employee-ui/employee-typography";

export function NativeCheckInIdentityContext({
  copy,
  presentation,
  snapshot,
  textAlign,
}: {
  readonly copy: NativeCheckInCopy;
  readonly presentation: NativeCapturePresentation;
  readonly snapshot: EmployeeCheckInSnapshot;
  readonly textAlign: NativeTextAlign;
}) {
  const styles = useEmployeeStyles(nativeCheckInIdentityStylesTheme);

  const hasPlate = snapshot.vehicle.mode === "CONFIRMED_PLATE";
  const identity = checkInIdentityLabel(snapshot, copy.vehicle);
  const vehicle = snapshot.recognizedVehicle ?? snapshot.vehicle;
  const vehicleName =
    [vehicle.make, vehicle.model].filter(Boolean).join(" ") || copy.vehicle;
  const color = vehicle.color || copy.notSpecified;
  const status = !hasPlate
    ? copy.temporaryDescriptor
    : presentation === "camera"
      ? copy.detected
      : copy.manualEntry;
  return (
    <>
      <View importantForAccessibility="no-hide-descendants" style={styles.hero}>
        <Text
          style={[
            styles.status,
            employeeTextStyle("human", textAlign, "center"),
          ]}
        >
          {status}
        </Text>
        <Text
          style={[
            hasPlate ? styles.plate : styles.descriptor,
            employeeTextStyle("identifier", textAlign, "center"),
          ]}
        >
          {identity}
        </Text>
        {hasPlate ? (
          <CountryContext
            country={snapshot.vehicle.plateCountry}
            copy={copy}
            prefix={
              presentation === "camera" ? copy.plate : copy.enteredPlate
            }
            textAlign={textAlign}
          />
        ) : null}
      </View>
      <View
        accessible
        accessibilityLabel={`${copy.vehicleDetails}: ${vehicleName}, ${identity}, ${color}`}
        style={styles.vehicleCard}
      >
        <Text style={[styles.cardLabel, employeeTextStyle("human", textAlign)]}>
          {copy.vehicleDetails}
        </Text>
        <Text
          style={[styles.vehicleName, employeeTextStyle("human", textAlign)]}
        >
          {vehicleName}
        </Text>
        <View style={styles.vehicleContext}>
          <Text style={[styles.vehicleDetail, styles.code]}>{identity}</Text>
          <Text style={styles.vehicleDetail}>·</Text>
          <Text
            style={[
              styles.vehicleDetail,
              employeeTextStyle("human", textAlign),
            ]}
          >
            {color}
          </Text>
        </View>
      </View>
    </>
  );
}

function CountryContext({
  copy,
  country,
  prefix,
  textAlign,
}: {
  readonly copy: NativeCheckInCopy;
  readonly country: string;
  readonly prefix: string;
  readonly textAlign: NativeTextAlign;
}) {
  const styles = useEmployeeStyles(nativeCheckInIdentityStylesTheme);

  const countryName = isPlateCountry(country)
    ? copy.countryNames[country]
    : country;
  return (
    <View accessible={false} style={styles.countryContext}>
      <Text
        style={[
          styles.context,
          employeeTextStyle("human", textAlign, "center"),
        ]}
      >
        {prefix} · {countryName}
      </Text>
      <Text style={[styles.context, styles.code]}>({country})</Text>
    </View>
  );
}

export const nativeCheckInIdentityStylesTheme = createEmployeeStyles((p) => ({
  cardLabel: {
    ...type.small,
    color: p.textMuted,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  code: { writingDirection: "ltr" },
  context: { ...type.small, color: p.textSecondary, fontWeight: "600" },
  countryContext: {
    alignItems: "center",
    flexDirection: "row",
    gap: space.xs,
    justifyContent: "center",
  },
  descriptor: { ...type.plate, color: p.textPrimary },
  hero: {
    alignItems: "center",
    backgroundColor: p.selectedSurface,
    borderRadius: employeeRadius.primary,
    gap: space.sm,
    padding: space.hero,
  },
  plate: { ...type.plate, color: p.textPrimary, letterSpacing: 4 },
  status: {
    ...type.small,
    color: p.textSecondary,
    fontWeight: "600",
    letterSpacing: 0.75,
  },
  vehicleCard: {
    backgroundColor: p.surface,
    borderColor: p.border,
    borderRadius: employeeRadius.primary,
    borderWidth: 1,
    gap: space.xs,
    padding: space.lg,
  },
  vehicleContext: {
    alignItems: "center",
    flexDirection: "row",
    gap: space.xs,
  },
  vehicleDetail: { ...type.body, color: p.textSecondary },
  vehicleName: { ...type.vehicleIdentity, color: p.textPrimary },
}));
export const nativeCheckInIdentityStyles =
  nativeCheckInIdentityStylesTheme.light;
