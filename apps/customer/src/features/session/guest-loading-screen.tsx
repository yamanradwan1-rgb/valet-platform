"use client";

import React from "react";

import { useTranslation } from "../../i18n/use-translation";
import { C } from "../../lib/theme/colors";

export function GuestLoadingScreen() {
  const { t } = useTranslation();
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        gap: 16,
      }}
    >
      <div
        className="spin"
        style={{
          width: 36,
          height: 36,
          borderRadius: "50%",
          border: `2px solid ${C.borderSemantic}`,
          borderTopColor: C.accent,
        }}
      />
      <span style={{ fontSize: 14, color: C.textSecondary }}>
        {t("common.loadingSession")}
      </span>
    </div>
  );
}
