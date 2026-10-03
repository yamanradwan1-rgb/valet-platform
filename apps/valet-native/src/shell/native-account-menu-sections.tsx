import { Pressable, Text, View } from "react-native";
import type { ReactNode } from "react";
import { useEmployeeStyles } from "../appearance/employee-appearance-context";
import { employeeTextStyle } from "../employee-ui/employee-typography";
import { nativeAccountMenuStylesTheme as stylesTheme } from "./native-account-menu-styles";

export function Section({
  children,
  textAlign,
  title,
}: {
  readonly children: ReactNode;
  readonly textAlign: "left" | "right";
  readonly title: string;
}) {
  const styles = useEmployeeStyles(stylesTheme);

  return (
    <View style={styles.section}>
      <Text
        style={[styles.sectionTitle, employeeTextStyle("human", textAlign)]}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

export function InfoRow({
  label,
  textAlign,
  value,
}: {
  readonly label: string;
  readonly textAlign: "left" | "right";
  readonly value: string;
}) {
  const styles = useEmployeeStyles(stylesTheme);

  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, employeeTextStyle("human", textAlign)]}>
        {label}
      </Text>
      <Text
        numberOfLines={2}
        style={[styles.infoValue, employeeTextStyle("human", textAlign)]}
      >
        {value}
      </Text>
    </View>
  );
}

export function LanguageChoice({
  label,
  onPress,
  selected,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly selected: boolean;
}) {
  const styles = useEmployeeStyles(stylesTheme);

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.language, selected && styles.languageSelected]}
    >
      <Text
        style={[styles.languageText, selected && styles.languageTextSelected]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
