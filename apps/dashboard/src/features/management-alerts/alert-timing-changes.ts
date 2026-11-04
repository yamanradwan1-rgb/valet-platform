/** Same-origin invalidation only; never exchange personal timing values. */
const changedEvent = "vaylet-management-alert-timing-changed";
const changedChannel = "vaylet-management-alert-timing";

export function announceAlertTimingChanged(organizationId: string): void {
  window.dispatchEvent(new CustomEvent(changedEvent, { detail: organizationId }));
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(changedChannel);
    channel.postMessage(organizationId);
    channel.close();
  }
}

export function subscribeAlertTimingChanges(
  onChange: (organizationId: string) => void,
): () => void {
  const local = (event: Event) => {
    const organizationId = (event as CustomEvent<unknown>).detail;
    if (typeof organizationId === "string") onChange(organizationId);
  };
  window.addEventListener(changedEvent, local);
  const channel = typeof BroadcastChannel === "undefined"
    ? null : new BroadcastChannel(changedChannel);
  if (channel) {
    channel.onmessage = (event: MessageEvent<unknown>) => {
      if (typeof event.data === "string") onChange(event.data);
    };
  }
  return () => {
    window.removeEventListener(changedEvent, local);
    channel?.close();
  };
}
