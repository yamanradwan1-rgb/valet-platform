export function offerCustomerPushAfterRetrieval(
  succeeded: boolean,
  closeConfirmation: () => void,
  offerNotifications: () => void,
): void {
  if (!succeeded) return;
  closeConfirmation();
  try {
    offerNotifications();
  } catch {
    // Notification UX is supplementary and never changes retrieval success.
  }
}

export function shouldOfferCustomerPushForSession(
  state: string | undefined,
): boolean {
  return state === "REQUESTED" || state === "RETRIEVING";
}
