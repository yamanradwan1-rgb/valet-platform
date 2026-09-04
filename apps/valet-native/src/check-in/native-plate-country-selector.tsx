import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import type { NativeCheckInCopy } from "./native-check-in-copy";
import type { NativeTextAlign } from "./native-check-in-primitives";
import {
  employeeColors as c,
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
        style={({ pressed }) => [
          styles.field,
          textAlign === "right" && styles.rowReverse,
          pressed && styles.pressed,
        ]}
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
                    textAlign === "right" && styles.rowReverse,
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
  return (
    <Text style={[styles.value, employeeTextStyle("human", textAlign)]}>
      {copy.countryNames[country]}
      {country === "OTHER" ? null : (
        <Text style={styles.code}> ({country})</Text>
      )}
    </Text>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  check: { ...type.header, color: c.blue, writingDirection: "ltr" },
  chevron: { color: c.neutral, fontSize: 16, writingDirection: "ltr" },
  code: { color: c.neutral, writingDirection: "ltr" },
  field: {
    alignItems: "center",
    backgroundColor: c.white,
    borderColor: c.border,
    borderRadius: employeeRadius.form,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: employeeFieldHeights.standard,
    paddingHorizontal: space.lg,
  },
  label: { ...type.label, color: c.navy },
  modalRoot: {
    backgroundColor: "rgba(7, 17, 31, 0.42)",
    flex: 1,
    justifyContent: "center",
    padding: space.screen,
  },
  option: {
    alignItems: "center",
    borderBottomColor: c.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: employeeMinimumTouchTarget,
    paddingHorizontal: space.md,
  },
  optionCard: {
    backgroundColor: c.white,
    borderRadius: employeeRadius.primary,
    overflow: "hidden",
    padding: space.xs,
  },
  optionTitle: {
    ...type.header,
    color: c.navy,
    paddingHorizontal: space.md,
    paddingVertical: space.lg,
  },
  pressed: { backgroundColor: c.ice },
  rowReverse: { flexDirection: "row-reverse" },
  selectedOption: { backgroundColor: c.ice },
  value: { ...type.body, color: c.navy, flex: 1 },
});
