import { describe, expect, it } from "vitest";

import { normalizeNativePushResponse } from "../src/notifications/native-push-response-parser";
import { fakeIntentId, validWirePayload } from "./native-push-fixture";

const defaultAction = "expo.modules.notifications.actions.DEFAULT";

function response(
  data: unknown = validWirePayload(),
  actionIdentifier: unknown = defaultAction,
  extra: Record<string, unknown> = {},
) {
  return {
    actionIdentifier,
    notification: {
      request: {
        content: {
          body: "Ignored presentation body",
          data,
          title: "Ignored presentation title",
        },
        identifier: "ignored-request-id",
      },
    },
    ...extra,
  };
}

describe("native push response normalization", () => {
  it("accepts only the default action and exact current wire data", () => {
    expect(normalizeNativePushResponse(response(), defaultAction)).toEqual({
      intentId: fakeIntentId,
      routeIntent: "TASK_QUEUE",
    });
  });

  it.each([
    response(validWirePayload(), "custom-action"),
    { notification: { request: { content: { data: validWirePayload() } } } },
    response(validWirePayload(), defaultAction, { userText: "reply" }),
    null,
    {},
    { actionIdentifier: defaultAction },
    { actionIdentifier: defaultAction, notification: null },
    {
      actionIdentifier: defaultAction,
      notification: { request: { content: {} } },
    },
    response({ ...validWirePayload(), unexpected: "field" }),
    response({ ...validWirePayload(), schemaVersion: 1 }),
    response({ ...validWirePayload(), schemaVersion: "2" }),
    response({ ...validWirePayload(), kind: "TASK_ASSIGNED" }),
    response({ ...validWirePayload(), routeIntent: "TASK_DETAIL" }),
    response({ ...validWirePayload(), intentId: "invalid" }),
    response({ nested: validWirePayload() }),
    response({ url: "https://example.invalid/tasks" }),
    {
      actionIdentifier: defaultAction,
      notification: {
        request: {
          content: {
            body: "New retrieval task available",
            title: "VAYLET",
          },
        },
      },
    },
  ])("rejects unsafe or malformed response input", (candidate) => {
    expect(normalizeNativePushResponse(candidate, defaultAction)).toBeNull();
  });

  it("does not use title, body, or request identifier as routing input", () => {
    const first = response();
    const changed = response();
    changed.notification.request.content.title = "arbitrary://route";
    changed.notification.request.content.body = "TASK_DETAIL";
    changed.notification.request.identifier = fakeIntentId;
    expect(normalizeNativePushResponse(first, defaultAction)).toEqual(
      normalizeNativePushResponse(changed, defaultAction),
    );
  });
});
