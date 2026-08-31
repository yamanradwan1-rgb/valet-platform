"use client";

import { useEffect } from "react";

import { registerServiceWorker } from "../../lib/pwa/register-pwa";
import { shouldOfferCustomerPushForSession } from "./customer-push-offer-trigger";

export function useCustomerPushLifecycle(
  sessionState: string | undefined,
  offerAfterRetrieval: () => void,
): void {
  useEffect(() => {
    registerServiceWorker();
  }, []);

  useEffect(() => {
    if (shouldOfferCustomerPushForSession(sessionState)) {
      offerAfterRetrieval();
    }
  }, [offerAfterRetrieval, sessionState]);
}
