// Owner-authorized new control only. Shared/approved Native colors stay frozen.
const shared = {
  background: "#087F5B",
  foreground: "#FFFFFF",
  pressed: "#066649",
} as const;

export const whatsAppPrototypePalettes = {
  light: {
    ...shared,
    disabledBackground: "#D9E8E2",
    disabledForeground: "#265344",
  },
  dark: {
    ...shared,
    disabledBackground: "#214B3E",
    disabledForeground: "#DCECE6",
  },
} as const;
