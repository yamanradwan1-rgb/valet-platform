import {
  webPushSubscriptionResponseSchema,
  type WebPushSubscriptionRequest,
  type WebPushSubscriptionResponse,
} from "@valet/contracts";

import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import type { EmployeePushApi } from "./employee-push-manager";

export class EmployeeWebPushApi implements EmployeePushApi {
  constructor(private readonly client: EmployeeApiClient) {}

  public async create(
    input: WebPushSubscriptionRequest,
  ): Promise<WebPushSubscriptionResponse> {
    return this.request("/v1/staff/web-push/subscriptions", "POST", input);
  }

  public async replace(
    id: string,
    input: WebPushSubscriptionRequest,
  ): Promise<WebPushSubscriptionResponse> {
    return this.request(
      `/v1/staff/web-push/subscriptions/${encodeURIComponent(id)}`,
      "PUT",
      input,
    );
  }

  public async disable(id: string): Promise<WebPushSubscriptionResponse> {
    return this.request(
      `/v1/staff/web-push/subscriptions/${encodeURIComponent(id)}`,
      "DELETE",
    );
  }

  private async request(
    path: string,
    method: "POST" | "PUT" | "DELETE",
    body?: WebPushSubscriptionRequest,
  ): Promise<WebPushSubscriptionResponse> {
    const response = await this.client.request<unknown>(path, {
      body,
      method,
    });
    return webPushSubscriptionResponseSchema.parse(response);
  }
}
