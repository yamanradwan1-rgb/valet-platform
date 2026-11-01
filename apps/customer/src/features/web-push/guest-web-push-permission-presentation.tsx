"use client";

import React from "react";
import { Btn } from "../../components/primitives/btn";
import { C } from "../../lib/theme/colors";
import { guestWebPushCopy } from "./guest-web-push-copy";
import type { GuestWebPushCapability } from "./guest-web-push-client";
import { useFrozenPushFeedbackSpace } from "./use-frozen-push-feedback-space";

type PresentationState = GuestWebPushCapability | "ENABLING" | "FAILED";

export function GuestWebPushPermissionPresentation({
  copy,
  direction,
  state,
  feedback,
  retryBlocked = false,
  onDismiss,
  onEnable,
}: {
  readonly copy: ReturnType<typeof guestWebPushCopy>;
  readonly direction: "ltr" | "rtl";
  readonly state: Exclude<PresentationState, "CHECKING">;
  readonly feedback?: string | undefined;
  readonly retryBlocked?: boolean;
  readonly onDismiss: () => void;
  readonly onEnable: () => void;
}) {
  const canEnable = state === "AVAILABLE" || state === "FAILED";
  const unavailable =
    state === "DENIED" ||
    state === "UNSUPPORTED" ||
    state === "IOS_HOME_SCREEN_REQUIRED" ||
    state === "FAILED";
  const body =
    state === "IOS_HOME_SCREEN_REQUIRED"
      ? copy.iosHomeScreenRequired
      : unavailable
        ? copy.unavailable
        : copy.permissionBody;
  const { ref, minHeight } = useFrozenPushFeedbackSpace(
    body,
    feedback !== undefined,
  );
  return (
    <section
      aria-live="polite"
      dir={direction}
      style={{
        backgroundColor: C.surfaceRaised,
        border: `1px solid ${C.borderSemantic}`,
        borderRadius: 16,
        bottom: 88,
        boxShadow: "0 10px 32px rgba(0, 0, 0, 0.18)",
        left: "50%",
        maxWidth: 390,
        padding: 16,
        position: "fixed",
        transform: "translateX(-50%)",
        width: "calc(100% - 32px)",
        zIndex: 90,
      }}
    >
      <strong style={{ color: C.text, display: "block", fontSize: 15 }}>
        {copy.permissionTitle}
      </strong>
      <p
        ref={ref}
        style={{
          color: C.textSecondary,
          fontSize: 13,
          lineHeight: 1.5,
          margin: "6px 0 14px",
          ...(feedback === undefined ? {} : { minHeight }),
        }}
      >
        {feedback ?? body}
      </p>
      {canEnable || state === "ENABLING" ? (
        <div style={{ display: "flex", gap: 8 }}>
          <Btn
            fullWidth
            disabled={retryBlocked}
            loading={state === "ENABLING"}
            onClick={onEnable}
            small
          >
            {copy.enable}
          </Btn>
          <Btn fullWidth onClick={onDismiss} small variant="secondary">
            {copy.notNow}
          </Btn>
        </div>
      ) : (
        <Btn fullWidth onClick={onDismiss} small variant="secondary">
          {copy.notNow}
        </Btn>
      )}
    </section>
  );
}
