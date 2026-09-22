import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import type { SelectedScopeBaseResolution } from "./selected-scope-base-authority";

interface SharedBaseRequest {
  readonly controller: AbortController;
  readonly promise: Promise<SelectedScopeBaseResolution>;
  readonly subscribers: Set<symbol>;
}

const sharedBaseRequests =
  new WeakMap<DashboardApiClient, Map<string, SharedBaseRequest>>();

export function shareSelectedScopeBaseRequest(
  api: DashboardApiClient,
  key: string,
  load: (signal: AbortSignal) => Promise<SelectedScopeBaseResolution>,
  signal?: AbortSignal,
): Promise<SelectedScopeBaseResolution> {
  if (signal?.aborted) {
    return Promise.reject(signal.reason ?? new Error("Base authority request aborted."));
  }
  const requests = sharedRequestsFor(api);
  let request = requests.get(key);
  if (request === undefined || request.controller.signal.aborted) {
    const controller = new AbortController();
    request = {
      controller,
      promise: load(controller.signal),
      subscribers: new Set(),
    };
    requests.set(key, request);
    const settledRequest = request;
    void request.promise.then(
      () => removeSharedRequest(requests, key, settledRequest),
      () => removeSharedRequest(requests, key, settledRequest),
    );
  }
  return subscribeToSharedRequest(requests, key, request, signal);
}

function sharedRequestsFor(
  api: DashboardApiClient,
): Map<string, SharedBaseRequest> {
  const current = sharedBaseRequests.get(api);
  if (current !== undefined) return current;
  const created = new Map<string, SharedBaseRequest>();
  sharedBaseRequests.set(api, created);
  return created;
}

function subscribeToSharedRequest(
  requests: Map<string, SharedBaseRequest>,
  key: string,
  request: SharedBaseRequest,
  signal?: AbortSignal,
): Promise<SelectedScopeBaseResolution> {
  const subscriber = Symbol(key);
  request.subscribers.add(subscriber);
  return new Promise((resolve, reject) => {
    let complete = false;
    const release = () => {
      signal?.removeEventListener("abort", onAbort);
      request.subscribers.delete(subscriber);
    };
    const settle = (value: SelectedScopeBaseResolution) => {
      if (complete) return;
      complete = true;
      release();
      resolve(value);
    };
    const fail = (reason: unknown) => {
      if (complete) return;
      complete = true;
      release();
      reject(reason);
    };
    const onAbort = () => {
      fail(signal?.reason ?? new Error("Base authority request aborted."));
      if (request.subscribers.size === 0) {
        removeSharedRequest(requests, key, request);
        request.controller.abort(signal?.reason);
      }
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    request.promise.then(settle, fail);
  });
}

function removeSharedRequest(
  requests: Map<string, SharedBaseRequest>,
  key: string,
  request: SharedBaseRequest,
): void {
  if (requests.get(key) === request) requests.delete(key);
}
