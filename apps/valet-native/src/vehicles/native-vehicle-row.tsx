import { Pressable, Text, View } from "react-native";
import type { StaffVehicleDirectoryRow } from "@valet/employee-client";

import { EmployeeBadge } from "../employee-ui/employee-feedback";
import { employeeTextStyle } from "../employee-ui/employee-typography";
import type { FoundationLocale } from "../foundation/foundation-locale";
import {
  formatNativeVehicleDateTime,
  nativeVehicleBadge,
  nativeVehicleTitle,
} from "./native-vehicle-presentation";
import { nativeVehicleRowStyles as s } from "./native-vehicle-row-styles";
import type { NativeVehiclesCopy } from "./native-vehicles-copy";

export function NativeVehicleRow(props: {
  readonly copy: NativeVehiclesCopy;
  readonly expanded: boolean;
  readonly locale: FoundationLocale;
  readonly onToggle: () => void;
  readonly row: StaffVehicleDirectoryRow;
  readonly textAlign: "left" | "right";
}) {
  const { copy, expanded, locale, onToggle, row, textAlign } = props;
  const human = employeeTextStyle("human", textAlign);
  const identifier = employeeTextStyle("identifier", textAlign);
  const badge = nativeVehicleBadge(row, copy);
  const parking = [row.parkingZoneCode, row.parkingSpotCode]
    .filter((value): value is string => value !== null)
    .join(" · ");
  const updated = formatNativeVehicleDateTime(row.updatedAt, locale);
  return (
    <View style={s.card} testID={`native-vehicle-row-${row.sessionId}`}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={onToggle}
        style={s.collapsed}
      >
        <View style={s.header}>
          <Text style={[s.title, human]}>
            {nativeVehicleTitle(row, copy.descriptorMissing)}
          </Text>
          <EmployeeBadge
            label={badge.label}
            showDot
            textAlign={textAlign}
            variant={badge.variant}
          />
        </View>
        <View style={s.vehicleMetaRow}>
          <Text
            style={[
              s.vehicleMeta,
              row.vehicle.plateNumberRaw ? identifier : human,
            ]}
          >
            {row.vehicle.plateNumberRaw?.trim() || copy.noPlate}
          </Text>
          {row.vehicle.color?.trim() ? (
            <Text style={[s.vehicleMeta, human]}> · {row.vehicle.color}</Text>
          ) : null}
        </View>
        <View style={s.summary}>
          <Summary
            identifier
            label={copy.keySlot}
            textAlign={textAlign}
            value={row.keySlotCode}
            copy={copy}
          />
          <Summary
            identifier
            label={copy.parkingArea}
            textAlign={textAlign}
            value={parking || null}
            copy={copy}
          />
          <Summary
            label={copy.updated}
            textAlign={textAlign}
            value={updated}
            copy={copy}
          />
        </View>
      </Pressable>
      {expanded ? (
        <View style={s.expanded}>
          <View style={s.detailRow}>
            <Text style={[s.detailLabel, human]}>{copy.status}</Text>
            <EmployeeBadge
              label={badge.label}
              showDot
              textAlign={textAlign}
              variant={badge.variant}
            />
          </View>
          <Detail
            label={copy.checkedIn}
            textAlign={textAlign}
            value={formatNativeVehicleDateTime(row.createdAt, locale)}
          />
          <Detail label={copy.updated} textAlign={textAlign} value={updated} />
          <Detail
            identifier={row.keySlotCode !== null}
            label={copy.keySlot}
            textAlign={textAlign}
            value={row.keySlotCode ?? copy.notAssigned}
          />
          <Detail
            identifier={row.parkingZoneCode !== null}
            label={copy.zone}
            textAlign={textAlign}
            value={row.parkingZoneCode ?? copy.notAssigned}
          />
          <Detail
            identifier={row.parkingSpotCode !== null}
            last
            label={copy.spot}
            textAlign={textAlign}
            value={row.parkingSpotCode ?? copy.notAssigned}
          />
          <Text style={[s.readOnly, human]}>{copy.detailReadOnly}</Text>
        </View>
      ) : null}
    </View>
  );
}

function Summary({
  copy,
  identifier = false,
  label,
  textAlign,
  value,
}: {
  readonly copy: NativeVehiclesCopy;
  readonly identifier?: boolean;
  readonly label: string;
  readonly textAlign: "left" | "right";
  readonly value: string | null;
}) {
  const missing = value === null;
  return (
    <View style={s.summaryCell}>
      <Text style={[s.summaryLabel, employeeTextStyle("human", textAlign)]}>
        {label}
      </Text>
      <Text
        style={[
          s.summaryValue,
          missing && s.missing,
          employeeTextStyle(
            missing || !identifier ? "human" : "identifier",
            textAlign,
          ),
        ]}
      >
        {value ?? copy.notAssigned}
      </Text>
    </View>
  );
}

function Detail({
  identifier = false,
  last = false,
  label,
  textAlign,
  value,
}: {
  readonly identifier?: boolean;
  readonly last?: boolean;
  readonly label: string;
  readonly textAlign: "left" | "right";
  readonly value: string;
}) {
  return (
    <View style={[s.detailRow, last && s.detailRowLast]}>
      <Text style={[s.detailLabel, employeeTextStyle("human", textAlign)]}>
        {label}
      </Text>
      <Text
        style={[
          s.detailValue,
          employeeTextStyle(identifier ? "identifier" : "human", textAlign),
        ]}
      >
        {value}
      </Text>
    </View>
  );
}
