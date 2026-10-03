import { useEmployeeStyles } from "../appearance/employee-appearance-context";
import { Modal, Pressable, Text, View } from "react-native";
import { EmployeeButton } from "../employee-ui/employee-controls";
import { employeeTextStyle } from "../employee-ui/employee-typography";
import { nativeGuestAccessStylesTheme as sTheme } from "./native-guest-access-styles";

export function NativeGuestAccessConfirmSheet({
  body,
  cancel,
  confirm,
  onClose,
  onConfirm,
  textAlign,
  title,
  variant,
}: {
  readonly body: string;
  readonly cancel: string;
  readonly confirm: string;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
  readonly textAlign: "left" | "right";
  readonly title: string;
  readonly variant: "danger" | "primary";
}) {
  const s = useEmployeeStyles(sTheme);

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible>
      <View accessibilityViewIsModal style={s.sheetRoot}>
        <Pressable
          accessibilityLabel={cancel}
          accessibilityRole="button"
          onPress={onClose}
          style={s.sheetBackdrop}
        />
        <View
          accessibilityLabel={title}
          accessibilityRole="summary"
          style={[
            s.sheet,
            { direction: textAlign === "right" ? "rtl" : "ltr" },
          ]}
        >
          <Text style={[s.cardTitle, employeeTextStyle("human", textAlign)]}>
            {title}
          </Text>
          <Text style={[s.statusBody, employeeTextStyle("human", textAlign)]}>
            {body}
          </Text>
          <EmployeeButton
            label={confirm}
            onPress={onConfirm}
            variant={variant}
          />
          <EmployeeButton
            label={cancel}
            onPress={onClose}
            size="standard"
            variant="secondary"
          />
        </View>
      </View>
    </Modal>
  );
}
