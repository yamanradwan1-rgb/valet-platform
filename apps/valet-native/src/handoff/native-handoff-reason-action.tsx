import { Text, TextInput, View } from "react-native";

import { EmployeeButton } from "../employee-ui/employee-controls";
import { EmployeeError } from "../employee-ui/employee-feedback";
import { employeeTextStyle } from "../employee-ui/employee-typography";
import { nativeHandoffStyles as s } from "./native-handoff-styles";

export function NativeHandoffReasonAction({
  busy,
  label,
  onChange,
  onSubmit,
  placeholder,
  title,
  compact = false,
  error,
  textAlign,
  value,
}: {
  readonly busy: boolean;
  readonly label: string;
  readonly onChange: (value: string) => void;
  readonly onSubmit: () => void;
  readonly placeholder: string;
  readonly title: string;
  readonly compact?: boolean;
  readonly error?: string | null | undefined;
  readonly textAlign: "left" | "right";
  readonly value: string;
}) {
  const valid = value.trim().length >= 1 && value.trim().length <= 500;
  return (
    <View style={s.card}>
      <Text style={[s.fieldLabel, employeeTextStyle("human", textAlign)]}>
        {title}
      </Text>
      <TextInput
        accessibilityLabel={placeholder}
        editable={!busy}
        maxLength={500}
        multiline
        onChangeText={onChange}
        placeholder={placeholder}
        style={[
          s.input,
          compact ? s.abortReason : s.reason,
          employeeTextStyle("human", textAlign),
        ]}
        value={value}
      />
      {error ? (
        <EmployeeError textAlign={textAlign}>{error}</EmployeeError>
      ) : null}
      <EmployeeButton
        disabled={busy || !valid}
        label={label}
        onPress={onSubmit}
      />
    </View>
  );
}
