import { useEffect, useRef, useState } from "react";
import { Keyboard, Pressable, Text, TextInput, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import type { EmployeeLocale } from "@valet/employee-client";

import {
  useEmployeePalette,
  useEmployeeStyles,
} from "../appearance/employee-appearance-context";
import { EmployeeCheckIcon } from "../employee-ui/employee-icons";
import { employeeTextStyle } from "../employee-ui/employee-typography";
import type { NativeTextAlign } from "./native-check-in-primitives";
import { nativeCheckInColorStylesTheme } from "./native-check-in-color-styles";
import {
  capNativeCustomColor,
  findNativeVehicleColorPreset,
  nativeVehicleColorPresets,
  serializeNativeCustomColor,
} from "./native-check-in-color-values";

const colorCopy = {
  en: { other: "Other color", custom: "Custom color", clear: "Clear color" },
  ar: { other: "لون آخر", custom: "لون مخصص", clear: "مسح اللون" },
} as const;

interface ColorSelectorProps {
  readonly color?: string | null;
  readonly label: string;
  readonly locale: EmployeeLocale;
  readonly onChange: (color: string | null) => void;
  readonly textAlign: NativeTextAlign;
}

/** A color string in the portable Check-In draft is the only active selection. */
export function NativeCheckInColorSelector({
  color,
  label,
  locale,
  onChange,
  textAlign,
}: ColorSelectorProps) {
  const s = useEmployeeStyles(nativeCheckInColorStylesTheme);
  const p = useEmployeePalette();
  const selectionAccent = p.mode === "dark" ? p.linkPrimary : "#0F54CB";
  const copy = colorCopy[locale];
  const preset = findNativeVehicleColorPreset(color);
  const [otherRequested, setOtherRequested] = useState(false);
  const [customBuffer, setCustomBuffer] = useState(() =>
    preset ? "" : (color ?? ""),
  );
  const customInput = useRef<TextInput>(null);
  const customSelected = otherRequested || (!preset && Boolean(color));
  const hasSelection = customSelected || Boolean(preset);

  useEffect(() => {
    if (otherRequested) customInput.current?.focus();
  }, [otherRequested]);

  const selectPreset = (value: string) => {
    if (customSelected && color && !preset) setCustomBuffer(color);
    setOtherRequested(false);
    Keyboard.dismiss();
    if (color !== value) onChange(value);
  };
  const selectOther = () => {
    if (customSelected) customInput.current?.focus();
    else {
      setOtherRequested(true);
      onChange(serializeNativeCustomColor(customBuffer));
    }
  };
  const clear = () => {
    Keyboard.dismiss();
    setCustomBuffer("");
    setOtherRequested(false);
    onChange(null);
  };
  const updateCustom = (value: string) => {
    const bounded = capNativeCustomColor(value);
    setCustomBuffer(bounded);
    setOtherRequested(true);
    onChange(serializeNativeCustomColor(bounded));
  };

  return (
    // Yoga's row follows the explicit direction. Reversing the row as well would flip it twice.
    <View style={[s.section, { direction: locale === "ar" ? "rtl" : "ltr" }]}>
      <Text
        accessibilityRole="header"
        style={[s.heading, employeeTextStyle("human", textAlign)]}
      >
        {label}
      </Text>
      <View style={s.grid}>
        {[0, 3, 6].map((start) => (
          <View key={start} style={s.row}>
            {nativeVehicleColorPresets.slice(start, start + 3).map((choice) => {
              const selected =
                preset?.value === choice.value && !otherRequested;
              return (
                <Pressable
                  accessibilityLabel={choice[locale]}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  key={choice.value}
                  onPress={() => selectPreset(choice.value)}
                  style={[s.tile, selected && s.selected]}
                >
                  <View
                    accessible={false}
                    style={[
                      s.swatch,
                      choice.paint && { backgroundColor: choice.paint },
                    ]}
                  >
                    {choice.paint === null ? (
                      <Svg
                        accessible={false}
                        width={22}
                        height={15}
                        viewBox="0 0 22 15"
                      >
                        <Path d="M0 0H22L0 15Z" fill="#E3CAA0" />
                        <Path d="M22 0V15H0Z" fill="#BC913D" />
                      </Svg>
                    ) : null}
                  </View>
                  <Text
                    style={[
                      s.tileLabel,
                      employeeTextStyle("human", textAlign, "center"),
                    ]}
                  >
                    {choice[locale]}
                  </Text>
                  {selected ? (
                    <View
                      accessible={false}
                      style={[
                        s.selectedCheck,
                        locale === "ar" ? { left: 6 } : { right: 6 },
                      ]}
                    >
                      <EmployeeCheckIcon color={selectionAccent} size={16} />
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
      <View style={s.actions}>
        <Pressable
          accessibilityLabel={copy.other}
          accessibilityRole="button"
          accessibilityState={{
            expanded: customSelected,
            selected: customSelected,
          }}
          onPress={selectOther}
          style={[s.other, customSelected && s.selected]}
        >
          <Text style={[s.otherText, employeeTextStyle("human", textAlign)]}>
            {copy.other}
          </Text>
          {customSelected ? (
            <EmployeeCheckIcon color={selectionAccent} size={16} />
          ) : null}
        </Pressable>
        {hasSelection ? (
          <Pressable
            accessibilityLabel={copy.clear}
            accessibilityRole="button"
            onPress={clear}
            style={s.clear}
          >
            <Text style={s.clearText}>{copy.clear}</Text>
          </Pressable>
        ) : null}
      </View>
      {customSelected ? (
        <TextInput
          accessibilityLabel={copy.custom}
          autoCapitalize="sentences"
          autoCorrect={false}
          // Android maxLength measures UTF-16 units; validation enforces 80 Unicode code points.
          maxLength={160}
          onChangeText={updateCustom}
          ref={customInput}
          style={[s.customInput, employeeTextStyle("human", textAlign)]}
          value={color && !preset ? color : otherRequested ? customBuffer : ""}
        />
      ) : null}
    </View>
  );
}
