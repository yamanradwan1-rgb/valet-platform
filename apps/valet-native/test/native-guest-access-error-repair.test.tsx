import { describe, expect, it, vi } from "vitest";

vi.mock("react", () => ({
  useState: (initial: unknown) => [initial, vi.fn()],
}));
vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Modal: "Modal",
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  StyleSheet: { create: (value: unknown) => value },
  Text: "Text",
  View: "View",
}));

const { content, elements } =
  await import("./native-check-in-condition-test-support");
const { NativeGuestAccessConfirmSheet } =
  await import("../src/guest-access/native-guest-access-confirm-sheet");
const { getNativeGuestAccessCopy } =
  await import("../src/guest-access/native-guest-access-copy");
const { NativeGuestAccessScreen } =
  await import("../src/guest-access/native-guest-access-screen");
const { guestSnapshot } = await import("./native-parity-11-test-fixture");

const errorCopy = {
  CONFIG_INVALID: [
    "Guest access is unavailable because the Customer app address is not configured correctly.",
    "وصول الضيف غير متاح لأن عنوان تطبيق العميل غير مهيأ بشكل صحيح.",
  ],
  GENERATED_CREDENTIAL_INVALID: [
    "Generated guest access was invalid.",
    "بيانات وصول الضيف التي تم إنشاؤها غير صالحة.",
  ],
  INTENT_CONFLICT: [
    "Guest access changed elsewhere. Showing the current state.",
    "تغيّر وصول الضيف من مكان آخر. يتم عرض الحالة الحالية.",
  ],
  LOAD_FAILED: [
    "The guest access state could not be loaded.",
    "تعذّر تحميل حالة وصول الضيف.",
  ],
  OFFLINE: ["You appear to be offline.", "يبدو أنك غير متصل بالإنترنت."],
  OUTCOME_UNKNOWN: [
    "The outcome is unknown. Showing the current server state.",
    "النتيجة غير معروفة. يتم عرض حالة الخادم الحالية.",
  ],
  REVOKE_FAILED: ["Revocation failed.", "فشل إلغاء الوصول."],
  UPDATE_FAILED: [
    "Guest access could not be updated.",
    "تعذّر تحديث وصول الضيف.",
  ],
} as const;

describe("Guest Access complete presentation error matrix", () => {
  it.each(Object.entries(errorCopy))(
    "renders exact EN/AR copy for %s",
    (code, expected) => {
      for (const [index, locale] of ["en", "ar"].entries()) {
        const snapshot = guestSnapshot("ready", "ACTIVE", {
          error: code as keyof typeof errorCopy,
        });
        const nodes = elements(
          NativeGuestAccessScreen({
            configInvalid: false,
            locale: locale as "en" | "ar",
            onClose: vi.fn(),
            session: { retry: vi.fn(), revoke: vi.fn() } as never,
            snapshot,
          }),
        );
        expect(content(nodes)).toContain(expected[index]);
        expect(
          getNativeGuestAccessCopy(locale as "en" | "ar").errors[
            code as keyof typeof errorCopy
          ],
        ).toBe(expected[index]);
      }
    },
  );

  it("lets Android Back close only the Guest Access confirmation sheet", () => {
    const onClose = vi.fn();
    const nodes = elements(
      NativeGuestAccessConfirmSheet({
        body: "body",
        cancel: "Cancel",
        confirm: "Revoke",
        onClose,
        onConfirm: vi.fn(),
        textAlign: "left",
        title: "Revoke guest access?",
        variant: "danger",
      }),
    );
    const modal = nodes.find((node) => node.type === "Modal")!;
    (modal.props.onRequestClose as () => void)();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
