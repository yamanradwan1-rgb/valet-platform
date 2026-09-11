import { describe, expect, it, vi } from "vitest";

import { FcmHttpV1Adapter } from "../src/modules/staff-push/fcm-http-v1-adapter";
import type { StaffPushProviderMessage } from "../src/modules/staff-push/staff-push-provider";

const message: StaffPushProviderMessage = {
  android: { priority: "HIGH", ttl: "30.000s" },
  data: {
    intentId: "00000000-0000-4000-8000-000000000001",
    kind: "EMPLOYEE_RETRIEVAL_REQUESTED",
    routeIntent: "TASK_QUEUE",
    schemaVersion: "1",
  },
  notification: { body: "New retrieval task available", title: "VAYLET" },
  token: "sensitive-destination",
};

const sendRequest = (
  messageForTransport: () => StaffPushProviderMessage | undefined = () =>
    message,
) => ({ messageForTransport });

describe("FCM HTTP v1 adapter", () => {
  it("sends direct v1 JSON with a short-lived ADC bearer", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ name: "projects/p/messages/1" }), {
        status: 200,
      }),
    );
    const adapter = new FcmHttpV1Adapter(
      { projectId: "vaylet-test-123", timeoutMilliseconds: 10_000 },
      { accessToken: async () => "short-lived-access" },
      request,
    );
    await expect(adapter.send(sendRequest())).resolves.toEqual({
      kind: "PROVIDER_RESULT",
      result: { resultClass: "ACCEPTED" },
    });
    expect(request).toHaveBeenCalledOnce();
    const [url, init] = request.mock.calls[0]!;
    expect(url).toBe(
      "https://fcm.googleapis.com/v1/projects/vaylet-test-123/messages:send",
    );
    expect(init?.headers).toEqual({
      Authorization: "Bearer short-lived-access",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(init?.body))).toEqual({ message });
  });

  it("classifies token acquisition failure as configuration without transport", async () => {
    const request = vi.fn<typeof fetch>();
    const adapter = new FcmHttpV1Adapter(
      { projectId: "vaylet-test-123", timeoutMilliseconds: 10 },
      {
        accessToken: async () => Promise.reject(new Error("credential secret")),
      },
      request,
    );
    await expect(adapter.send(sendRequest())).resolves.toEqual({
      kind: "PROVIDER_RESULT",
      result: { resultClass: "CONFIGURATION" },
    });
    expect(request).not.toHaveBeenCalled();
  });

  it("rejects a non-allowlisted payload before credentials or transport", async () => {
    const request = vi.fn<typeof fetch>();
    const accessToken = vi.fn().mockResolvedValue("short-lived-access");
    const adapter = new FcmHttpV1Adapter(
      { projectId: "vaylet-test-123", timeoutMilliseconds: 10 },
      { accessToken },
      request,
    );
    await expect(
      adapter.send(
        sendRequest(() => ({
          ...message,
          data: { ...message.data, intentId: "not-a-uuid" },
        })),
      ),
    ).resolves.toEqual({
      kind: "PROVIDER_RESULT",
      result: { resultClass: "PERMANENT" },
    });
    expect(accessToken).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it("normalizes connection loss and timeout as UNKNOWN without leaking values", async () => {
    const connectionLoss = new FcmHttpV1Adapter(
      { projectId: "vaylet-test-123", timeoutMilliseconds: 10 },
      { accessToken: async () => "secret-access" },
      vi.fn<typeof fetch>().mockRejectedValue(new Error("network")),
    );
    await expect(connectionLoss.send(sendRequest())).resolves.toEqual({
      kind: "PROVIDER_RESULT",
      result: { resultClass: "UNKNOWN" },
    });

    const hanging: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new Error("abort")),
        );
      });
    const timeout = new FcmHttpV1Adapter(
      { projectId: "vaylet-test-123", timeoutMilliseconds: 1 },
      { accessToken: async () => "secret-access" },
      hanging,
    );
    await expect(timeout.send(sendRequest())).resolves.toEqual({
      kind: "PROVIDER_RESULT",
      result: { resultClass: "UNKNOWN" },
    });

    const credentialTimeout = new FcmHttpV1Adapter(
      { projectId: "vaylet-test-123", timeoutMilliseconds: 1 },
      { accessToken: () => new Promise<string>(() => undefined) },
      vi.fn<typeof fetch>(),
    );
    await expect(credentialTimeout.send(sendRequest())).resolves.toEqual({
      kind: "PROVIDER_RESULT",
      result: { resultClass: "UNKNOWN" },
    });
  });

  it("reduces wire TTL after credential acquisition", async () => {
    let remainingMilliseconds = 30_000;
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ name: "projects/p/messages/1" }), {
        status: 200,
      }),
    );
    const adapter = new FcmHttpV1Adapter(
      { projectId: "vaylet-test-123", timeoutMilliseconds: 10_000 },
      {
        accessToken: async () => {
          remainingMilliseconds -= 5_000;
          return "short-lived-access";
        },
      },
      request,
    );
    await adapter.send(
      sendRequest(() => ({
        ...message,
        android: {
          ...message.android,
          ttl: `${Math.floor(remainingMilliseconds / 1_000)}.000s`,
        },
      })),
    );
    const wire = JSON.parse(String(request.mock.calls[0]![1]?.body));
    expect(wire.message.android.ttl).toBe("25.000s");
  });

  it("does not issue HTTP when lifetime expires during credentials", async () => {
    let alive = true;
    const request = vi.fn<typeof fetch>();
    const adapter = new FcmHttpV1Adapter(
      { projectId: "vaylet-test-123", timeoutMilliseconds: 10_000 },
      {
        accessToken: async () => {
          alive = false;
          return "short-lived-access";
        },
      },
      request,
    );
    await expect(
      adapter.send(sendRequest(() => (alive ? message : undefined))),
    ).resolves.toEqual({ kind: "EXPIRED_BEFORE_TRANSPORT" });
    expect(request).not.toHaveBeenCalled();
  });
});
