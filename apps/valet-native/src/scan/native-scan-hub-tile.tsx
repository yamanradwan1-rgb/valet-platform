import { createEmployeeStyles } from "../appearance/employee-themed-styles";
import { useEmployeeStyles } from "../appearance/employee-appearance-context";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { employeeRadius } from "../employee-ui/employee-tokens";
import {
  employeeFontFamilies,
  employeeFontWeights,
  employeeTextStyle,
} from "../employee-ui/employee-typography";

export function NativeScanHubTile(props: {
  readonly accent: string;
  readonly disabled: boolean;
  readonly glyph: ReactNode;
  readonly label: string;
  readonly onPress?: (() => void) | undefined;
  readonly subtitle: string;
  readonly textAlign: "left" | "right";
}) {
  const styles = useEmployeeStyles(nativeScanHubTileStylesTheme);

  const human = employeeTextStyle("human", props.textAlign);
  return (
    <Pressable
      accessibilityLabel={`${props.label}. ${props.subtitle}`}
      accessibilityRole="button"
      accessibilityState={{ disabled: props.disabled }}
      disabled={props.disabled}
      onPress={props.disabled ? undefined : props.onPress}
      style={({ pressed }) => [
        styles.tile,
        props.disabled && styles.disabled,
        pressed && !props.disabled && styles.pressed,
      ]}
    >
      <View style={[styles.iconBlock, { backgroundColor: props.accent }]}>
        {props.glyph}
      </View>
      <View>
        <Text style={[styles.label, human]}>{props.label}</Text>
        <Text style={[styles.subtitle, human]}>{props.subtitle}</Text>
      </View>
    </Pressable>
  );
}

export const nativeScanHubTileStylesTheme = createEmployeeStyles((p) => ({
  disabled: { opacity: 0.5 },
  iconBlock: {
    alignItems: "center",
    borderRadius: 12,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  label: {
    color: p.textPrimary,
    fontFamily: employeeFontFamilies.ui,
    fontSize: 14,
    fontWeight: employeeFontWeights.semiBold,
    lineHeight: 18,
  },
  pressed: { transform: [{ scale: 0.97 }] },
  subtitle: {
    color: p.textMuted,
    fontFamily: employeeFontFamilies.ui,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 4,
  },
  tile: {
    backgroundColor: p.surface,
    borderColor: p.border,
    borderRadius: employeeRadius.primary,
    borderWidth: 1,
    flexBasis: "45%",
    flexGrow: 1,
    gap: 12,
    minHeight: 132,
    padding: 16,
  },
}));
export const nativeScanHubTileStyles = nativeScanHubTileStylesTheme.light;
