import { describe, expect, it, vi } from "vitest";
import type { ConditionPhotoSnapshot } from "@valet/employee-client";
import { elements, content, style } from "./native-check-in-condition-test-support";

vi.mock("react-native", () => ({
  Image: "Image", Pressable: "Pressable", Text: "Text", View: "View",
  StyleSheet: { create: (value: unknown) => value },
}));
vi.mock("../src/appearance/employee-appearance-context", () => ({
  useEmployeeStyles: (styles: { light: unknown }) => styles.light,
}));

const { NativeConditionPhotoB1Slots } = await import(
  "../src/check-in/native-condition-photo-b1-slots");

function state(): ConditionPhotoSnapshot {
  return {
    scope: null, ownerRevision: 1, phase: "available", required: false,
    qualifying: false, captureRevision: 0, status: null, error: null,
    hasCapture: false, capturedCount: 0, uploadedCount: 0, verifiedTotal: 0,
    slots: Array.from({ length: 4 }, (_, i) => ({
      slotId: i + 1, captureGeneration: 0, phase: "EMPTY" as const,
      operationId: null, thumbnailUri: null, vehiclePhotoId: null,
      verifiedAt: null, previewUnavailable: false, hasCapture: false,
    })),
  };
}

function counts(nodes: ReturnType<typeof elements>) {
  return nodes.filter((node) => node.type === "Text")
    .map((node) => node.props.children)
    .filter((value): value is unknown[] => Array.isArray(value) &&
      value[1] === "/4")
    .map((value) => `${value[0]}${value[1]}`);
}

describe("Issue #336 B1 Compact scoped card presentation", () => {
  it("shows four keyboard-accessible empty slots and zero counters", () => {
    const onSelect = vi.fn();
    const nodes = elements(NativeConditionPhotoB1Slots({
      locale: "en", snapshot: state(), selectedSlot: 1,
      onSelect, notice: "Photos optional by location policy",
    }));
    expect(content(nodes)).toContain("Condition photos");
    expect(counts(nodes)).toEqual(["0/4", "0/4"]);
    const slots = nodes.filter((node) => node.type === "Pressable");
    expect(slots).toHaveLength(4);
    expect(slots[0]!.props.accessibilityLabel).toBe("Slot 1: Empty slot");
    expect(slots[0]!.props.accessibilityState).toEqual({ selected: true });
    expect(style(slots[0]!).minHeight).toBe(76);
    (slots[3]!.props.onPress as () => void)();
    expect(onSelect).toHaveBeenCalledWith(4);
  });

  it("renders actual local thumbnail URIs, independently verified counts, and Arabic labels", () => {
    const original = state();
    const snapshot: ConditionPhotoSnapshot = {
      ...original, capturedCount: 2, uploadedCount: 1, verifiedTotal: 6,
      slots: original.slots.map((slot, index) =>
        index === 0 ? {
          ...slot, phase: "UPLOADED_VERIFIED" as const,
          vehiclePhotoId: "evidence-a", verifiedAt: "2026-10-29T00:00:00Z",
          thumbnailUri: "file:///private/verified-thumb.jpg", hasCapture: true,
        } : index === 1 ? {
          ...slot, phase: "CAPTURED_LOCAL" as const,
          thumbnailUri: "file:///private/local-thumb.jpg", hasCapture: true,
        } : slot),
    };
    const nodes = elements(NativeConditionPhotoB1Slots({
      locale: "ar", snapshot, selectedSlot: 2,
      onSelect: vi.fn(), notice: "تم التحقق من الصورة في الخادم",
    }));
    const images = nodes.filter((node) => node.type === "Image");
    expect(images.map((node) => (node.props.source as { uri: string }).uri))
      .toEqual(["file:///private/verified-thumb.jpg",
        "file:///private/local-thumb.jpg"]);
    expect(counts(nodes)).toEqual(["2/4", "1/4"]);
    expect(content(nodes)).toContain("توجد 6 صور مؤكدة");
    const slots = nodes.filter((node) => node.type === "Pressable");
    expect(slots[1]!.props.accessibilityLabel).toBe("خانة 2: ملتَقطة على الجهاز");
  });

  it("represents lost local previews without requesting server image bytes", () => {
    const initial = state();
    const snapshot: ConditionPhotoSnapshot = {
      ...initial, capturedCount: 1, uploadedCount: 1, verifiedTotal: 1,
      slots: initial.slots.map((slot, index) => index !== 0 ? slot : {
        ...slot, phase: "UPLOADED_VERIFIED" as const,
        vehiclePhotoId: "evidence-a", previewUnavailable: true, hasCapture: true,
      }),
    };
    const nodes = elements(NativeConditionPhotoB1Slots({
      locale: "en", snapshot, selectedSlot: 1,
      onSelect: vi.fn(), notice: "The server verified the photo.",
    }));
    expect(content(nodes)).toContain("Preview unavailable");
    expect(nodes.filter((node) => node.type === "Image")).toHaveLength(0);
    expect(counts(nodes)).toEqual(["1/4", "1/4"]);
  });

  it("converts an evicted local image to preview unavailable without losing verified identity", () => {
    const initial = state();
    const uri = "file:///private/only-thumb.jpg";
    const snapshot: ConditionPhotoSnapshot = {
      ...initial, capturedCount: 1, uploadedCount: 1, verifiedTotal: 1,
      slots: initial.slots.map((slot, index) => index !== 0 ? slot : {
        ...slot, phase: "UPLOADED_VERIFIED" as const,
        vehiclePhotoId: "evidence-a", thumbnailUri: uri, hasCapture: true,
      }),
    };
    const onThumbnailError = vi.fn();
    const props = { locale: "en" as const, snapshot, selectedSlot: 1,
      onSelect: vi.fn(), notice: "Server verified", onThumbnailError };
    const before = elements(NativeConditionPhotoB1Slots(props));
    const picture = before.find((node) => node.type === "Image")!;
    expect(picture.props.accessible).toBe(false);
    (picture.props.onError as () => void)();
    expect(onThumbnailError).toHaveBeenCalledWith(uri);
    const after = elements(NativeConditionPhotoB1Slots({
      ...props, brokenUris: [uri],
    }));
    expect(after.some((node) => node.type === "Image")).toBe(false);
    expect(after.find((node) => node.type === "Pressable")!.props.accessibilityLabel)
      .toBe("Slot 1: Uploaded · server verified · Preview unavailable");
    expect(counts(after)).toEqual(["1/4", "1/4"]);
  });

  it("keeps visible ordinals 1–4 while latest-four evidence moves stable slot IDs", () => {
    const original = state();
    const slots = [original.slots[1]!, original.slots[2]!,
      original.slots[3]!, original.slots[0]!].map((slot, index) => ({
      ...slot, phase: "UPLOADED_VERIFIED" as const,
      vehiclePhotoId: `evidence-${index}`, verifiedAt: `2026-10-29T00:00:0${index}Z`,
      hasCapture: true, previewUnavailable: true,
    }));
    const onSelect = vi.fn();
    const nodes = elements(NativeConditionPhotoB1Slots({
      locale: "en", snapshot: { ...original, slots, capturedCount: 4, uploadedCount: 4 },
      selectedSlot: 1, onSelect, notice: "Verified",
    }));
    const tiles = nodes.filter((node) => node.type === "Pressable");
    expect(tiles.map((tile) => tile.props.accessibilityLabel)).toEqual(
      [1, 2, 3, 4].map((index) => `Slot ${index}: Uploaded · server verified · Preview unavailable`));
    expect(tiles[3]!.props.accessibilityState).toEqual({ selected: true });
    (tiles[0]!.props.onPress as () => void)();
    expect(onSelect).toHaveBeenCalledWith(2);
  });
});
