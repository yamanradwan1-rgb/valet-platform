"use client";

import { useCallback } from "react";

import { offerCustomerPushAfterRetrieval } from "./customer-push-offer-trigger";

export function useCustomerRetrievalPushOffer(
  requestVehicle: () => Promise<boolean>,
  closeConfirmation: () => void,
  offerNotifications: () => void,
): () => Promise<void> {
  return useCallback(async () => {
    offerCustomerPushAfterRetrieval(
      await requestVehicle(),
      closeConfirmation,
      offerNotifications,
    );
  }, [closeConfirmation, offerNotifications, requestVehicle]);
}
