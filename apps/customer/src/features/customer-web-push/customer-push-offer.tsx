"use client";

import React from "react";

import { useTranslation } from "../../i18n/use-translation";
import { useCustomerWebPush } from "./customer-web-push-provider";

export function CustomerPushOffer() {
  const push = useCustomerWebPush();
  const { t } = useTranslation();
  if (!push.offerVisible || push.state === "SUBSCRIBED") return null;

  const body = {
    DENIED: t("push.denied"),
    GRANTED_UNSUBSCRIBED: t("push.benefit"),
    IOS_REQUIRES_HOME_SCREEN: t("push.iosHomeScreen"),
    PROMPT_AVAILABLE: t("push.benefit"),
    RECOVERABLE_ERROR: t("push.recoverable"),
    UNAVAILABLE: t("push.unavailable"),
    UNSUPPORTED: t("push.unsupported"),
  }[push.state];
  const actionable =
    push.state === "PROMPT_AVAILABLE" ||
    push.state === "GRANTED_UNSUBSCRIBED" ||
    push.state === "RECOVERABLE_ERROR";

  return (
    <section className="customer-push-offer" aria-live="polite">
      <button
        aria-label={t("common.close")}
        className="customer-push-offer__close"
        onClick={push.dismissOffer}
        type="button"
      >
        ×
      </button>
      <h2>{t("push.title")}</h2>
      <p>{body}</p>
      {actionable ? (
        <button
          className="customer-push-offer__action"
          onClick={() => void push.enable()}
          type="button"
        >
          {push.state === "RECOVERABLE_ERROR"
            ? t("push.retry")
            : t("push.enable")}
        </button>
      ) : null}
    </section>
  );
}
