import {
  detectGuestWebPushCapability,
  GuestWebPushDisabledError,
  isCurrentGuestPushSubscription,
  readGuestWebPushCapability,
  type GuestWebPushCapability,
  type GuestWebPushTransport,
} from "./guest-web-push-client";
import { guestWebPushStages } from "./guest-web-push-stage";
import { subscriptionMatchesVapidKey } from "./guest-web-push-vapid";

export type GuestWebPushStatusTransport = GuestWebPushTransport & {
  verifySubscription(endpoint: string, signal?: AbortSignal): Promise<boolean>;
};

export type GuestWebPushStatus =
  | GuestWebPushCapability
  | "DISABLED"
  | "SUBSCRIPTION_MISSING"
  | "SERVER_BINDING_MISSING"
  | "ENABLED_VERIFIED";

export async function readGuestWebPushStatus(
  transport: GuestWebPushStatusTransport,
  signal: AbortSignal,
): Promise<GuestWebPushStatus> {
  const browser = readGuestWebPushCapability();
  const capability = detectGuestWebPushCapability(browser);
  if (capability === "UNSUPPORTED" || capability === "IOS_HOME_SCREEN_REQUIRED") return capability;

  const stages = guestWebPushStages(signal);
  let publicKey: string;
  try {
    publicKey = await stages("public key", 8_000, (stageSignal) => transport.loadVapidPublicKey(stageSignal));
  } catch (error) {
    if (error instanceof GuestWebPushDisabledError) return "DISABLED";
    throw error;
  }
  const permission = readGuestWebPushCapability().permission;
  if (permission === "denied") return "DENIED";
  if (permission !== "granted") return "AVAILABLE";
  const readSubscription = () => stages("existing subscription", 5_000, async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return registration?.active ? registration.pushManager.getSubscription() : null;
  });
  const subscription = await readSubscription();
  if (!isCurrentGuestPushSubscription(subscription)) return "SUBSCRIPTION_MISSING";
  if (!subscriptionMatchesVapidKey(subscription, publicKey)) return "SERVER_BINDING_MISSING";
  const active = await stages("registration verification", 10_000, (stageSignal) =>
    transport.verifySubscription(subscription.endpoint, stageSignal),
  );
  const current = active ? await readSubscription() : subscription;
  const currentPermission = readGuestWebPushCapability().permission;
  if (currentPermission === "denied") return "DENIED";
  if (currentPermission !== "granted") return "AVAILABLE";
  if (!isCurrentGuestPushSubscription(current)) return "SUBSCRIPTION_MISSING";
  if (!subscriptionMatchesVapidKey(current, publicKey)) return "SERVER_BINDING_MISSING";
  if (current.endpoint !== subscription.endpoint) {
    throw new Error("Guest Web Push subscription changed during verification.");
  }
  return active ? "ENABLED_VERIFIED" : "SERVER_BINDING_MISSING";
}
