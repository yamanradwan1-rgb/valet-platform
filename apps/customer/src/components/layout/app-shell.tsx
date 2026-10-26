import React from "react";

import { C } from "../../lib/theme/colors";
import { useGuestBrandStyle } from "../../features/session/use-guest-brand-style";
import { AppHeader } from "./app-header";

export function AppShell({
  children,
  onMore,
  onBack,
  headerTitle,
  showHeader = true,
  dark,
  whiteLabel = true,
}: {
  readonly children: React.ReactNode;
  readonly onMore: () => void;
  readonly onBack?: (() => void) | undefined;
  readonly headerTitle?: string | undefined;
  readonly showHeader?: boolean | undefined;
  readonly dark?: boolean | undefined;
  readonly whiteLabel?: boolean | undefined;
}) {
  const containerBg =
    dark === true ? C.brandNavy : dark === false ? C.warm : C.bg;
  const brandStyle = useGuestBrandStyle(dark);

  return (
    <div
      style={{
        ...brandStyle,
        minHeight: "100dvh",
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        backgroundColor: C.bgFrame,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 430,
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          backgroundColor: containerBg,
          boxShadow: "0 0 60px rgba(0, 0, 0, 0.15)",
          position: "relative",
        }}
      >
        {showHeader && (
          <AppHeader
            onMore={onMore}
            onBack={onBack}
            title={headerTitle}
            dark={dark}
            whiteLabel={whiteLabel}
          />
        )}
        <main
          style={{
            flex: 1,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
