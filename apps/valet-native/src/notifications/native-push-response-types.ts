export interface NativePushRouteIntent {
  readonly intentId: string;
  readonly routeIntent: "TASK_QUEUE";
}

export interface NativePushResponsePlatform {
  readonly defaultActionIdentifier: string;
  clearLastResponse(): Promise<void>;
  getLastResponse(): Promise<unknown | null>;
  subscribeResponse(listener: (response: unknown) => void): () => void;
}

export type NativePushResponseConsumer = (
  intent: NativePushRouteIntent,
) => void;
