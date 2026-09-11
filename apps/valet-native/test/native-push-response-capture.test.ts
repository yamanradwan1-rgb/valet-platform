import { describe, expect, it, vi } from "vitest";

import { NativePushResponseCapture } from "../src/notifications/native-push-response-capture";
import type { NativePushResponsePlatform } from "../src/notifications/native-push-response-types";
import {
  deferred,
  fakeIntentId,
  validWirePayload,
} from "./native-push-fixture";

const defaultAction = "expo.modules.notifications.actions.DEFAULT";
const secondIntentId = "77777777-7777-4777-8777-777777777777";

function response(
  intentId = fakeIntentId,
  data: unknown = validWirePayload(intentId),
) {
  return {
    actionIdentifier: defaultAction,
    notification: { request: { content: { data } } },
  };
}

class FakeResponsePlatform implements NativePushResponsePlatform {
  readonly defaultActionIdentifier = defaultAction;
  clearCalls = 0;
  clearFailure = false;
  initial = deferred<unknown | null>();
  listener: ((response: unknown) => void) | undefined;
  removeCalls = 0;
  subscribeCalls = 0;

  async clearLastResponse() {
    this.clearCalls += 1;
    if (this.clearFailure) throw new Error("synthetic clear failure");
  }

  getLastResponse() {
    return this.initial.promise;
  }

  subscribeResponse(listener: (response: unknown) => void) {
    this.subscribeCalls += 1;
    this.listener = listener;
    return () => {
      this.listener = undefined;
      this.removeCalls += 1;
    };
  }

  emit(candidate: unknown) {
    this.listener?.(candidate);
  }
}

describe("early native push response capture", () => {
  it("registers the live listener before reading and starts idempotently", async () => {
    const platform = new FakeResponsePlatform();
    const capture = new NativePushResponseCapture(platform);
    const first = capture.start();
    const second = capture.start();
    expect(platform.subscribeCalls).toBe(1);
    platform.initial.resolve(null);
    await Promise.all([first, second]);
  });

  it("holds an initial response until a late shell consumer subscribes", async () => {
    const platform = new FakeResponsePlatform();
    const capture = new NativePushResponseCapture(platform);
    const startup = capture.start();
    platform.initial.resolve(response());
    await startup;
    const consumer = vi.fn();
    capture.subscribe(consumer);
    expect(consumer).toHaveBeenCalledExactlyOnceWith({
      intentId: fakeIntentId,
      routeIntent: "TASK_QUEUE",
    });
    expect(platform.clearCalls).toBe(1);
  });

  it("deduplicates listener-first and initial-response races", async () => {
    const platform = new FakeResponsePlatform();
    const capture = new NativePushResponseCapture(platform);
    const consumer = vi.fn();
    capture.subscribe(consumer);
    const startup = capture.start();
    platform.emit(response());
    platform.initial.resolve(response());
    await startup;
    expect(consumer).toHaveBeenCalledTimes(1);
    expect(platform.clearCalls).toBe(1);
  });

  it("deduplicates initial-first then live response", async () => {
    const platform = new FakeResponsePlatform();
    const capture = new NativePushResponseCapture(platform);
    const consumer = vi.fn();
    capture.subscribe(consumer);
    const startup = capture.start();
    platform.initial.resolve(response());
    await startup;
    platform.emit(response());
    expect(consumer).toHaveBeenCalledTimes(1);
  });

  it("delivers two distinct IDs as independent bounded attention", async () => {
    const platform = new FakeResponsePlatform();
    const capture = new NativePushResponseCapture(platform);
    const consumer = vi.fn();
    capture.subscribe(consumer);
    const startup = capture.start();
    platform.emit(response());
    platform.emit(response(secondIntentId));
    platform.initial.resolve(null);
    await startup;
    expect(consumer.mock.calls.map(([intent]) => intent.intentId)).toEqual([
      fakeIntentId,
      secondIntentId,
    ]);
  });

  it("keeps accepted memory when native last-response clear fails", async () => {
    const platform = new FakeResponsePlatform();
    platform.clearFailure = true;
    const capture = new NativePushResponseCapture(platform);
    const startup = capture.start();
    platform.initial.resolve(response());
    await expect(startup).resolves.toBeUndefined();
    const consumer = vi.fn();
    capture.subscribe(consumer);
    expect(consumer).toHaveBeenCalledTimes(1);
    expect(platform.clearCalls).toBe(1);
  });

  it("bounds pending and recent intent memory without persistence", async () => {
    const platform = new FakeResponsePlatform();
    const capture = new NativePushResponseCapture(platform, 2, 2);
    const startup = capture.start();
    const ids = [1, 2, 3].map(
      (value) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`,
    );
    for (const intentId of ids) platform.emit(response(intentId));
    platform.emit(response(ids[0]));
    platform.initial.resolve(null);
    await startup;
    const consumer = vi.fn();
    capture.subscribe(consumer);
    expect(consumer.mock.calls.map(([intent]) => intent.intentId)).toEqual([
      ids[2],
      ids[0],
    ]);
  });

  it("clears an invalid initial response so it does not replay forever", async () => {
    const platform = new FakeResponsePlatform();
    const capture = new NativePushResponseCapture(platform);
    const navigation = vi.fn();
    const queueRead = vi.fn();
    const protectedMutation = vi.fn();
    capture.subscribe(() => {
      navigation();
      queueRead();
      protectedMutation();
    });
    const startup = capture.start();
    platform.initial.resolve(response(fakeIntentId, { url: "unsafe" }));
    await startup;
    expect(navigation).not.toHaveBeenCalled();
    expect(queueRead).not.toHaveBeenCalled();
    expect(protectedMutation).not.toHaveBeenCalled();
    expect(platform.clearCalls).toBe(1);
  });

  it("removes the live listener and clears process memory on dispose", async () => {
    const platform = new FakeResponsePlatform();
    const capture = new NativePushResponseCapture(platform);
    const startup = capture.start();
    platform.initial.resolve(null);
    await startup;
    capture.dispose();
    expect(platform.removeCalls).toBe(1);
    platform.emit(response());
  });

  it("cannot repopulate memory from a startup read completed after dispose", async () => {
    const platform = new FakeResponsePlatform();
    const capture = new NativePushResponseCapture(platform);
    const startup = capture.start();
    capture.dispose();
    platform.initial.resolve(response());
    await startup;
    const consumer = vi.fn();
    capture.subscribe(consumer);
    expect(consumer).not.toHaveBeenCalled();
    expect(platform.clearCalls).toBe(0);
  });
});
