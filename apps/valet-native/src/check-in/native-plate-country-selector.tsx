import { createEmployeeStyles } from "../appearance/employee-themed-styles";
import { useEmployeeStyles } from "../appearance/employee-appearance-context";
import { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";

import type { NativeCheckInCopy } from "./native-check-in-copy";
import type { NativeTextAlign } from "./native-check-in-primitives";
import {
  employeeFieldHeights,
  employeeMinimumTouchTarget,
  employeeRadius,
  employeeSpacing as space,
} from "../employee-ui/employee-tokens";
import {
  employeeTextStyle,
  employeeTypography as type,
} from "../employee-ui/employee-typography";

export const PLATE_COUNTRIES = ["JO", "AE", "SA", "KW", "BH", "OTHER"] as const;
export type PlateCountry = (typeof PLATE_COUNTRIES)[number];

export function isPlateCountry(value: string): value is PlateCountry {
  return PLATE_COUNTRIES.includes(value as PlateCountry);
}

export function plateCountryLabel(
  country: PlateCountry,
  copy: NativeCheckInCopy,
): string {
  const label = copy.countryNames[country];
  return country === "OTHER" ? label : `${label} (${country})`;
}

export function NativePlateCountrySelector({
  copy,
  onChange,
  textAlign,
  value,
}: {
  readonly copy: NativeCheckInCopy;
  readonly onChange: (country: PlateCountry) => void;
  readonly textAlign: NativeTextAlign;
  readonly value: string;
}) {
  const styles = useEmployeeStyles(stylesTheme);

  const [open, setOpen] = useState(false);
  const selected = isPlateCountry(value) ? value : "OTHER";
  const close = () => setOpen(false);
  return (
    <View style={{ gap: space.sm }}>
      <Text style={[styles.label, employeeTextStyle("human", textAlign)]}>
        {copy.country}
      </Text>
      <Pressable
        accessibilityLabel={`${copy.country}: ${plateCountryLabel(selected, copy)}`}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityValue={{ text: selected }}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.field, pressed && styles.pressed]}
      >
        <CountryLabel country={selected} copy={copy} textAlign={textAlign} />
        <Text accessible={false} style={styles.chevron}>
          ▾
        </Text>
      </Pressable>
      <Modal
        animationType="fade"
        onRequestClose={close}
        transparent
        visible={open}
      >
        <View style={styles.modalRoot}>
          <Pressable
            accessibilityLabel={copy.back}
            accessibilityRole="button"
            onPress={close}
            style={styles.backdrop}
          />
          <View accessibilityViewIsModal style={styles.optionCard}>
            <Text
              accessibilityRole="header"
              style={[
                styles.optionTitle,
                employeeTextStyle("human", textAlign),
              ]}
            >
              {copy.country}
            </Text>
            <View accessibilityRole="radiogroup">
              {PLATE_COUNTRIES.map((country) => (
                <Pressable
                  key={country}
                  accessibilityLabel={plateCountryLabel(country, copy)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: country === selected }}
                  accessibilityValue={{ text: country }}
                  onPress={() => {
                    onChange(country);
                    close();
                  }}
                  style={({ pressed }) => [
                    styles.option,
                    country === selected && styles.selectedOption,
                    pressed && styles.pressed,
                  ]}
                >
                  <CountryLabel
                    country={country}
                    copy={copy}
                    textAlign={textAlign}
                  />
                  {country === selected ? (
                    <Text accessible={false} style={styles.check}>
                      ✓
                    </Text>
                  ) : null}
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function CountryLabel({
  copy,
  country,
  textAlign,
}: {
  readonly copy: NativeCheckInCopy;
  readonly country: PlateCountry;
  readonly textAlign: NativeTextAlign;
}) {
  const styles = useEmployeeStyles(stylesTheme);

  return (
    <View accessible={false} style={styles.countryLabel}>
      <Text style={[styles.value, employeeTextStyle("human", textAlign)]}>
        {copy.countryNames[country]}
      </Text>
      {country === "OTHER" ? null : (
        <Text style={styles.code}>({country})</Text>
      )}
    </View>
  );
}

const stylesTheme = createEmployeeStyles((p) => ({
  backdrop: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  check: { ...type.header, color: p.linkPrimary, writingDirection: "ltr" },
  chevron: { color: p.textSecondary, fontSize: 16, writingDirection: "ltr" },
  code: { color: p.textSecondary, writingDirection: "ltr" },
  countryLabel: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: space.xs,
  },
  field: {
    alignItems: "center",
    backgroundColor: p.surface,
    borderColor: p.border,
    borderRadius: employeeRadius.form,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: employeeFieldHeights.standard,
    paddingHorizontal: space.lg,
  },
  label: { ...type.label, color: p.textPrimary },
  modalRoot: {
    backgroundColor: p.pickerOverlay,
    flex: 1,
    justifyContent: "center",
    padding: space.screen,
  },
  option: {
    alignItems: "center",
    borderBottomColor: p.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: employeeMinimumTouchTarget,
    paddingHorizontal: space.md,
  },
  optionCard: {
    backgroundColor: p.surface,
    borderRadius: employeeRadius.primary,
    overflow: "hidden",
    padding: space.xs,
  },
  optionTitle: {
    ...type.header,
    color: p.textPrimary,
    paddingHorizontal: space.md,
    paddingVertical: space.lg,
  },
  pressed: { backgroundColor: p.selectedSurface },
  selectedOption: { backgroundColor: p.selectedSurface },
  value: { ...type.body, color: p.textPrimary, flexShrink: 1 },
}));
