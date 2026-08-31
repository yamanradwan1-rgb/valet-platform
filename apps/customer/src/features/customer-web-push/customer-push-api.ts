import type {
  WebPushSubscriptionRequest,
  WebPushSubscriptionResponse,
} from "@valet/contracts";

import type { GuestApiClient } from "../../lib/api/guest-api-client";
import type { CustomerPushApi } from "./customer-push-manager";

export class CustomerWebPushApi implements CustomerPushApi {
  constructor(private readonly client: GuestApiClient) {}

  create(
    input: WebPushSubscriptionRequest,
  ): Promise<WebPushSubscriptionResponse> {
    return this.client.createWebPushSubscription(input);
  }

  replace(
    id: string,
    input: WebPushSubscriptionRequest,
  ): Promise<WebPushSubscriptionResponse> {
    return this.client.replaceWebPushSubscription(id, input);
  }

  disable(id: string): Promise<WebPushSubscriptionResponse> {
    return this.client.disableWebPushSubscription(id);
  }
}
