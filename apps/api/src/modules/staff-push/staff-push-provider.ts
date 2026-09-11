export type StaffPushProviderResultClass =
  | "ACCEPTED"
  | "TRANSIENT"
  | "RATE_LIMITED"
  | "INVALID_ENDPOINT"
  | "PERMANENT"
  | "CONFIGURATION"
  | "UNKNOWN";

export interface StaffPushProviderResult {
  readonly resultClass: StaffPushProviderResultClass;
  readonly retryAfterSeconds?: number;
}

export interface StaffPushProviderMessage {
  readonly android: {
    readonly priority: "HIGH";
    readonly ttl: string;
  };
  readonly data: {
    readonly intentId: string;
    readonly kind: "EMPLOYEE_RETRIEVAL_REQUESTED";
    readonly routeIntent: "TASK_QUEUE";
    readonly schemaVersion: "1";
  };
  readonly notification: {
    readonly body: string;
    readonly title: "VAYLET";
  };
  readonly token: string;
}

export interface StaffPushProvider {
  send(message: StaffPushProviderMessage): Promise<StaffPushProviderResult>;
}
