import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  actionButton: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: 20,
  },
  actionLabel: {
    color: "#111B31",
    fontSize: 17,
    fontWeight: "800",
  },
  audience: {
    color: "#9FB2D8",
    fontSize: 20,
    fontWeight: "600",
  },
  authPanel: {
    gap: 14,
  },
  brand: {
    color: "#FFFFFF",
    fontSize: 38,
    fontWeight: "800",
    letterSpacing: 4,
  },
  brandBlock: {
    gap: 4,
  },
  disabledButton: {
    opacity: 0.45,
  },
  errorText: {
    color: "#FFB8B8",
    fontSize: 15,
    lineHeight: 22,
  },
  input: {
    backgroundColor: "#1B2945",
    borderColor: "#60769F",
    borderRadius: 14,
    borderWidth: 1,
    color: "#FFFFFF",
    fontSize: 17,
    minHeight: 54,
    paddingHorizontal: 16,
  },
  localeButton: {
    alignItems: "center",
    borderColor: "#60769F",
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 48,
    minWidth: 64,
    paddingHorizontal: 18,
  },
  localeButtonSelected: {
    backgroundColor: "#FFFFFF",
    borderColor: "#FFFFFF",
  },
  localeControls: {
    flexDirection: "row",
    gap: 12,
  },
  localeLabel: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  localeLabelSelected: {
    color: "#111B31",
  },
  safeArea: {
    backgroundColor: "#111B31",
    flex: 1,
  },
  screen: {
    flex: 1,
    justifyContent: "space-between",
    paddingHorizontal: 28,
    paddingVertical: 36,
  },
  status: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "700",
    lineHeight: 34,
  },
});
