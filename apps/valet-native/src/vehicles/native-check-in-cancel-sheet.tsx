import { useEmployeeStyles } from "../appearance/employee-appearance-context";
import type { Ref } from "react";
import {
  Modal,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { EmployeeButton } from "../employee-ui/employee-controls";
import { employeeTextStyle } from "../employee-ui/employee-typography";
import { nativeGuestAccessStylesTheme as sTheme } from "../guest-access/native-guest-access-styles";

export function NativeCheckInCancelSheet({
  body,
  disabled,
  cancel,
  confirm,
  onClose,
  onConfirm,
  textAlign,
  title,
  variant,
  focusRef,
  onShow,
}: {
  readonly body: string;
  readonly disabled: boolean;
  readonly cancel: string;
  readonly confirm: string;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
  readonly textAlign: "left" | "right";
  readonly title: string;
  readonly variant: "danger" | "primary";
  readonly focusRef?: Ref<Text>;
  readonly onShow?: () => void;
}) {
  const s = useEmployeeStyles(sTheme);

  const { fontScale } = useWindowDimensions();
  const actionHeight = Math.ceil(64 * Math.max(1, fontScale));
  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      onShow={onShow}
      transparent
      visible
    >
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
          <Text
            ref={focusRef}
            accessible={focusRef ? true : undefined}
            accessibilityLabel={focusRef ? `${title}. ${body}` : undefined}
            style={[s.cardTitle, employeeTextStyle("human", textAlign)]}
          >
            {title}
          </Text>
          <Text style={[s.statusBody, employeeTextStyle("human", textAlign)]}>
            {body}
          </Text>
          <EmployeeButton
            height={actionHeight}
            disabled={disabled}
            label={confirm}
            onPress={onConfirm}
            variant={variant}
          />
          <EmployeeButton
            height={actionHeight}
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
