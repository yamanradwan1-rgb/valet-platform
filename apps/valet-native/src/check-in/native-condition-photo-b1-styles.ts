import { createEmployeeStyles } from "../appearance/employee-themed-styles";

/** Styles are scoped to the pre-existing condition photo policy card. */
export const nativeConditionPhotoB1Styles = createEmployeeStyles((p) => ({
  content: { gap: 10, minWidth: 0 },
  headingRow: {
    alignItems: "baseline", flexDirection: "row", flexWrap: "wrap",
    justifyContent: "space-between", gap: 6,
  },
  heading: { color: p.textPrimary, fontSize: 13, fontWeight: "700" },
  slotCaption: { color: p.textSecondary, fontSize: 10 },
  counts: { flexDirection: "row", gap: 6 },
  countChip: {
    backgroundColor: p.selectedSurface, borderColor: p.border, borderWidth: 1,
    borderRadius: 9, flex: 1, minWidth: 0, paddingHorizontal: 8,
    paddingVertical: 7, flexDirection: "row", alignItems: "center",
    flexWrap: "wrap", justifyContent: "space-between", gap: 4,
  },
  countChipVerified: { backgroundColor: p.successSurface },
  countLabel: { color: p.linkPrimary, fontSize: 10, fontWeight: "600" },
  countLabelVerified: { color: p.success, fontSize: 10, fontWeight: "600" },
  countValue: { color: p.linkPrimary, fontSize: 15, fontWeight: "700" },
  countValueVerified: { color: p.success, fontSize: 15, fontWeight: "700" },
  slots: { flexDirection: "row", gap: 6 },
  tile: {
    flex: 1, minWidth: 0, minHeight: 76, padding: 4, backgroundColor: p.surface,
    borderColor: p.border, borderWidth: 1, borderRadius: 10,
  },
  tileSelected: { borderColor: p.linkPrimary, borderWidth: 2, padding: 3 },
  imageBox: {
    flex: 1, minHeight: 55, backgroundColor: p.statusNeutralSurface,
    borderRadius: 7, overflow: "hidden", alignItems: "center",
    justifyContent: "center",
  },
  imageLocal: { backgroundColor: p.selectedSurface },
  imageVerified: { backgroundColor: p.successSurface },
  imageFailed: { backgroundColor: p.dangerSurface },
  imageUncertain: { backgroundColor: p.warningSurface },
  thumbnail: { width: "100%", height: "100%" },
  tileSymbol: { fontSize: 24, fontWeight: "700", color: p.textSecondary },
  tileNumber: {
    position: "absolute", bottom: 3, left: 5, fontSize: 9,
    fontWeight: "800", color: p.textSecondary,
  },
  tileMarker: {
    position: "absolute", top: 3, right: 3, minWidth: 19, minHeight: 19,
    paddingHorizontal: 2, borderRadius: 11, backgroundColor: p.surface,
    alignItems: "center", justifyContent: "center",
  },
  markerText: { fontSize: 12, fontWeight: "800", color: p.textPrimary },
  previewMissing: {
    fontSize: 9, textAlign: "center", fontWeight: "600",
    color: p.textSecondary,
  },
  detail: { color: p.textSecondary, fontSize: 11, lineHeight: 16 },
  notice: {
    paddingHorizontal: 10, paddingVertical: 9, backgroundColor: p.surface,
    borderColor: p.border, borderWidth: 1, borderRadius: 9,
  },
  noticeText: { color: p.textSecondary, fontSize: 11, lineHeight: 16 },
  historicalNotice: { backgroundColor: p.warningSurface },
  historicalText: { color: p.warning, fontSize: 11, lineHeight: 16 },
  actions: { gap: 8 },
}));
