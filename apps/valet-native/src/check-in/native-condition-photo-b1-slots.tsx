import { Image, Pressable, Text, View } from "react-native";
import type { ConditionPhotoSlot, ConditionPhotoSnapshot, EmployeeLocale } from
  "@valet/employee-client";
import { useEmployeeStyles } from "../appearance/employee-appearance-context";
import { nativeConditionPhotoB1Styles as themed } from "./native-condition-photo-b1-styles";
import { nativeConditionPhotoCopy } from "./native-condition-photo-copy";

const EMPTY: readonly ConditionPhotoSlot[] = Array.from({ length: 4 }, (_, i) => ({
  slotId: i + 1, captureGeneration: 0, phase: "EMPTY", thumbnailUri: null,
  operationId: null, vehiclePhotoId: null, verifiedAt: null,
  previewUnavailable: false, hasCapture: false,
}));

export function b1Slots(snapshot: ConditionPhotoSnapshot) {
  return snapshot.slots?.length === 4 ? snapshot.slots : EMPTY;
}

function slotState(slot: ConditionPhotoSlot,
  copy: ReturnType<typeof nativeConditionPhotoCopy>, lost = slot.previewUnavailable) {
  const state = ({
    EMPTY: copy.b1Empty, CAPTURED_LOCAL: copy.b1Local,
    UPLOADING: copy.b1Uploading, UPLOAD_PENDING: copy.b1Pending,
    UPLOADED_VERIFIED: copy.b1Verified, UPLOAD_FAILED: copy.b1Failed,
    RETRY_PENDING: copy.b1Unknown,
  })[slot.phase];
  return lost && slot.phase !== "EMPTY" ?
    `${state} · ${copy.b1PreviewUnavailable}` : state;
}

function slotSymbol(slot: ConditionPhotoSlot) {
  if (slot.phase === "UPLOADED_VERIFIED") return "✓";
  if (slot.phase === "EMPTY") return "+";
  if (slot.phase === "UPLOAD_FAILED") return "!";
  if (slot.phase === "UPLOAD_PENDING" || slot.phase === "RETRY_PENDING") return "…";
  if (slot.phase === "UPLOADING") return "↑";
  return "●";
}

export function NativeConditionPhotoB1Slots({
  locale, snapshot, selectedSlot, onSelect, notice, brokenUris = [], onThumbnailError,
}: {
  readonly locale: EmployeeLocale;
  readonly snapshot: ConditionPhotoSnapshot;
  readonly selectedSlot: number;
  readonly onSelect: (slot: number) => void;
  readonly notice: string;
  readonly brokenUris?: readonly string[];
  readonly onThumbnailError?: (uri: string) => void;
}) {
  const s = useEmployeeStyles(themed);
  const c = nativeConditionPhotoCopy(locale);
  const rtl = locale === "ar";
  const slots = b1Slots(snapshot);
  const selected = slots.find((slot) => slot.slotId === selectedSlot) ?? slots[0]!;
  const selectedIndex = slots.findIndex((slot) => slot.slotId === selected.slotId) + 1;
  const captured = snapshot.capturedCount ?? slots.filter((slot) =>
    slot.hasCapture || slot.phase === "UPLOADED_VERIFIED").length;
  const uploaded = snapshot.uploadedCount ?? new Set(slots.filter((slot) =>
    slot.phase === "UPLOADED_VERIFIED").map((slot) => slot.vehiclePhotoId)).size;
  const historicalTotal = snapshot.verifiedTotal ?? uploaded;
  const selectedLost = selected.previewUnavailable ||
    (selected.thumbnailUri !== null && brokenUris.includes(selected.thumbnailUri));
  return (
    <View style={s.content}>
      <View style={s.headingRow}>
        <Text accessibilityRole="header" style={s.heading}>{c.b1Title}</Text>
        <Text style={s.slotCaption}>{c.b1FourSlots}</Text>
      </View>
      <View accessibilityLiveRegion="polite" style={s.counts}>
        <View style={s.countChip}>
          <Text style={s.countLabel}>{c.b1Captured}</Text>
          <Text style={s.countValue}>{captured}/4</Text>
        </View>
        <View style={[s.countChip, s.countChipVerified]}>
          <Text style={s.countLabelVerified}>{c.b1Uploaded}</Text>
          <Text style={s.countValueVerified}>{uploaded}/4</Text>
        </View>
      </View>
      <View accessibilityLabel={c.b1Slots} style={s.slots}>
        {slots.map((slot, index) => {
          const phase = slot.phase;
          const imageStyle = phase === "UPLOADED_VERIFIED" ? s.imageVerified :
            phase === "UPLOAD_FAILED" ? s.imageFailed :
            phase === "UPLOAD_PENDING" || phase === "RETRY_PENDING" ?
              s.imageUncertain : phase !== "EMPTY" ? s.imageLocal : null;
          const lost = slot.previewUnavailable ||
            (slot.thumbnailUri !== null && brokenUris.includes(slot.thumbnailUri));
          const label = slotState(slot, c, lost);
          const visibleIndex = index + 1;
          return (
            <Pressable key={slot.slotId}
              accessibilityRole="button"
              accessibilityState={{ selected: slot.slotId === selectedSlot }}
              accessibilityLabel={c.b1SlotLabel(visibleIndex, label)}
              onPress={() => onSelect(slot.slotId)}
              style={[s.tile, slot.slotId === selectedSlot && s.tileSelected]}>
              <View style={[s.imageBox, imageStyle]}>
                {slot.thumbnailUri && !lost ? (
                  <Image accessible={false} accessibilityIgnoresInvertColors
                    onError={() => onThumbnailError?.(slot.thumbnailUri!)}
                    source={{ uri: slot.thumbnailUri }} resizeMode="cover"
                    style={s.thumbnail} />
                ) : lost && phase !== "EMPTY" ? (
                  <Text style={s.previewMissing}>{c.b1PreviewUnavailable}</Text>
                ) : (
                  <Text accessible={false} style={s.tileSymbol}>{slotSymbol(slot)}</Text>
                )}
              </View>
              <Text style={s.tileNumber}>{visibleIndex}</Text>
              <View accessibilityElementsHidden style={s.tileMarker}>
                <Text style={s.markerText}>{slotSymbol(slot)}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      <Text accessibilityLiveRegion="polite" style={[s.detail,
        { textAlign: rtl ? "right" : "left" }]}>
        {c.b1SlotLabel(selectedIndex, slotState(selected, c, selectedLost))}
      </Text>
      {historicalTotal > 4 ? (
        <View style={[s.notice, s.historicalNotice]}>
          <Text accessibilityLiveRegion="polite" style={[s.historicalText,
            { textAlign: rtl ? "right" : "left" }]}>
            {c.b1Historical(historicalTotal)}
          </Text>
        </View>
      ) : null}
      <View style={s.notice}>
        <Text accessibilityLiveRegion="polite" style={[s.noticeText,
          { textAlign: rtl ? "right" : "left" }]}>{notice}</Text>
      </View>
    </View>
  );
}
