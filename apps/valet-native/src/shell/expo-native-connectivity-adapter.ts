import {
  addNetworkStateListener,
  getNetworkStateAsync,
  NetworkStateType,
  type NetworkState,
} from "expo-network";
import type {
  EmployeeConnectivityAdapter,
  EmployeeConnectivityStatus,
} from "@valet/employee-client";

export function nativeConnectivityStatus(
  state: NetworkState,
): EmployeeConnectivityStatus {
  if (state.type === NetworkStateType.NONE || state.isConnected === false) {
    return "offline";
  }
  if (state.isConnected === true) return "online";
  return "unknown";
}

/** Expo adapter only; server reachability remains owned by API reads. */
export class ExpoNativeConnectivityAdapter implements EmployeeConnectivityAdapter {
  async read(): Promise<EmployeeConnectivityStatus> {
    return nativeConnectivityStatus(await getNetworkStateAsync());
  }

  subscribe(
    listener: (status: EmployeeConnectivityStatus) => void,
  ): () => void {
    const subscription = addNetworkStateListener((state) =>
      listener(nativeConnectivityStatus(state)),
    );
    return () => subscription.remove();
  }
}
