import { describe, expect, it, vi } from "vitest";

vi.mock("../src/appearance/employee-appearance-context", async () => {
  const { employeePalettes } =
    await import("../src/appearance/employee-palette");
  return {
    useEmployeePalette: () => employeePalettes.light,
    useEmployeeStyles: <T,>(styles: { light: T }) => styles.light,
  };
});
vi.mock("react", () => ({
  useCallback: (callback: unknown) => callback,
  useEffect: vi.fn(),
  useRef: (initial: unknown) => ({ current: initial }),
  useState: (initial: unknown) => [initial, vi.fn()],
  useSyncExternalStore: (_subscribe: unknown, current: () => unknown) =>
    current(),
}));
vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Linking: { openSettings: vi.fn() },
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  StyleSheet: { create: (value: unknown) => value },
  Text: "Text",
  TextInput: "TextInput",
  View: "View",
}));
vi.mock("expo-router", () => ({ useFocusEffect: vi.fn() }));
vi.mock("expo-camera", () => ({
  Camera: { getCameraPermissionsAsync: vi.fn() },
  CameraView: "CameraView",
}));

import { getNativeRetrievalCopy } from "../src/retrieval/native-retrieval-copy";

const { content } = await import("./native-check-in-condition-test-support");
const { renderRetrieval, retrievalAction } =
  await import("./native-retrieval-panel-test-fixture");

describe("Native Retrieval unknown-state copy", () => {
  it.each([
    [
      "en",
      "Unable to verify task status",
      "The operation result could not be confirmed. Check task status before taking another action.",
      "Check task status",
    ],
    [
      "ar",
      "تعذر التحقق من حالة المهمة",
      "تعذر التأكد من نتيجة العملية. تحقّق من حالة المهمة قبل اتخاذ إجراء آخر.",
      "تحقق من حالة المهمة",
    ],
  ] as const)(
    "shows neutral ambiguous recovery in %s",
    (locale, title, body, checkLabel) => {
      const copy = getNativeRetrievalCopy(locale);
      expect(copy.unknownTitle).toBe(title);
      expect(copy.unknownBody).toBe(body);
      expect(copy.unknownCheckLabel).toBe(checkLabel);

      const { nodes, retrieval } = renderRetrieval("ambiguous", locale);
      const rendered = content(nodes);
      expect(rendered).toContain(title);
      expect(rendered).toContain(body);
      expect(rendered).not.toContain(copy.operationFailed);
      const check = retrievalAction(nodes, checkLabel)!;
      expect(check).toBeDefined();
      expect(retrievalAction(nodes, copy.checkState)).toBeUndefined();
      (check.props.onPress as () => void)();
      expect(retrieval.checkServerState).toHaveBeenCalledOnce();
      expect(retrieval.startRetrieval).not.toHaveBeenCalled();
      expect(retrieval.markReady).not.toHaveBeenCalled();
      expect(retrievalAction(nodes, copy.startRetrieval)).toBeUndefined();
    },
  );
});
