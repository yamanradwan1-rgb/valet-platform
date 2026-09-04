import type { NativeAuthSnapshot } from "@valet/employee-client";
import type { NativeQrController } from "./native-qr-controller";

interface LifecyclePorts {
  auth: {
    current(): NativeAuthSnapshot;
    subscribe(listener: (value: NativeAuthSnapshot) => void): () => void;
  };
  identity: { register(clear: () => void): () => void };
  appState: {
    readonly currentState: string;
    addEventListener(
      event: "change",
      listener: (state: string) => void,
    ): { remove(): void };
  };
}

/** Subscribes directly, not through delayed React auth/AppState effects. */
export function bindNativeQrLifecycle(
  controller: NativeQrController,
  ports: LifecyclePorts,
): () => void {
  const generation = ports.auth.current().authGeneration;
  let active = ports.appState.currentState === "active";
  let authorized = false;
  let invalidated = false;
  const authChanged = (state: NativeAuthSnapshot) => {
    authorized =
      !invalidated &&
      state.phase === "authenticated" &&
      state.authGeneration === generation;
    controller.setEligible(authorized && active);
  };
  authChanged(ports.auth.current());
  const unsubscribeAuth = ports.auth.subscribe(authChanged);
  const unregister = ports.identity.register(() => {
    invalidated = true;
    authorized = false;
    controller.setEligible(false);
  });
  const subscription = ports.appState.addEventListener("change", (state) => {
    active = state === "active";
    controller.setEligible(authorized && active);
  });
  return () => {
    controller.setEligible(false);
    unsubscribeAuth();
    unregister();
    subscription.remove();
  };
}
