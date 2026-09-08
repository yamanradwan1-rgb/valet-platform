import { TextInput, View } from "react-native";

import { EmployeeButton } from "../employee-ui/employee-controls";
import { nativeHandoffStyles as s } from "./native-handoff-styles";

export function NativeHandoffReasonAction({
  busy,
  label,
  onChange,
  onSubmit,
  placeholder,
  value,
}: {
  readonly busy: boolean;
  readonly label: string;
  readonly onChange: (value: string) => void;
  readonly onSubmit: () => void;
  readonly placeholder: string;
  readonly value: string;
}) {
  const valid = value.trim().length >= 1 && value.trim().length <= 500;
  return (
    <View style={s.section}>
      <TextInput
        accessibilityLabel={placeholder}
        editable={!busy}
        maxLength={500}
        multiline
        onChangeText={onChange}
        placeholder={placeholder}
        style={[s.input, s.reason]}
        value={value}
      />
      <EmployeeButton
        disabled={busy || !valid}
        label={label}
        onPress={onSubmit}
        variant="secondary"
      />
    </View>
  );
}
