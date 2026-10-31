import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";

import {
  bounded,
  deferred,
  listen,
  rawClient,
} from "./issue333-u002-http-socket-fixture.mjs";

const privateMarker = "W4_PRIVATE_SYNTHETIC_ONLY_NOT_REAL_CUSTOMER";
const largeBody = Buffer.alloc(24 * 1024 * 1024, 0x59);

test("disconnect before delayed handler resolution closes without protected bytes", async (t) => {
  const entered = deferred();
  const continueRead = deferred();
  const checked = deferred();
  const closed = deferred();
  const events = [];
  const app = await listen((_request, response) => {
    response.once("finish", () => events.push("finish"));
    response.once("close", () => {
      events.push("close");
      closed.resolve();
    });
    entered.resolve(response);
    void continueRead.promise.then(() => {
      if (response.destroyed || response.writableEnded) {
        events.push("suppressed-after-close");
      } else {
        response.end(privateMarker);
        events.push("unexpected-write");
      }
      checked.resolve();
    });
  });
  t.after(() => continueRead.resolve());
  t.after(app.stop);
  const client = await rawClient(app.port);
  t.after(() => client.socket.destroy());

  await bounded(entered.promise, "handler entry");
  client.socket.destroy();
  await bounded(closed.promise, "server response close");
  continueRead.resolve();
  await bounded(checked.promise, "post-close handler gate");
  await bounded(client.closed, "client socket close");
  assert.deepEqual(events, ["close", "suppressed-after-close"]);
  assert.equal(client.state.bytes, 0);
});

test("client abort after partial protected write retains prefix, never finish", async (t) => {
  const entered = deferred();
  const continueStream = deferred();
  const stopped = deferred();
  const closed = deferred();
  const events = [];
  const app = await listen((_request, response) => {
    response.once("finish", () => events.push("finish"));
    response.once("close", () => {
      events.push("close");
      closed.resolve();
    });
    response.write(privateMarker);
    entered.resolve(response);
    void continueStream.promise.then(() => {
      if (response.destroyed || response.writableEnded) {
        events.push("suppressed-trailer");
      } else {
        response.end("TRAILER_AFTER_ABORT_FORBIDDEN");
      }
      stopped.resolve();
    });
  });
  t.after(() => continueStream.resolve());
  t.after(app.stop);
  const client = await rawClient(app.port);
  t.after(() => client.socket.destroy());

  const response = await bounded(entered.promise, "partial response started");
  await bounded(client.firstData, "private partial payload observed");
  assert.ok(client.state.tail.includes(Buffer.from(privateMarker)));
  client.socket.destroy();
  await bounded(closed.promise, "partial response close");
  continueStream.resolve();
  await bounded(stopped.promise, "post-abort stream gate");
  assert.equal(response.headersSent, true);
  assert.equal(response.writableFinished, false);
  assert.deepEqual(events, ["close", "suppressed-trailer"]);
});

test("shutdown closeAllConnections aborts active response and releases close gate", async (t) => {
  const entered = deferred();
  const closed = deferred();
  const events = [];
  const app = await listen((_request, response) => {
    response.once("finish", () => events.push("finish"));
    response.once("close", () => {
      events.push("close");
      closed.resolve();
    });
    entered.resolve(response);
    // The handler deliberately remains pending as the application drains.
  });
  t.after(app.stop);
  const client = await rawClient(app.port);
  t.after(() => client.socket.destroy());

  const response = await bounded(entered.promise, "pending response entry");
  app.server.closeAllConnections();
  await bounded(closed.promise, "shutdown response close");
  await bounded(client.closed, "shutdown socket close");
  assert.equal(response.writableFinished, false);
  assert.deepEqual(events, ["close"]);
  assert.equal(client.state.bytes, 0);
});

test("abort after synchronous finish cannot retract already queued HTTP data", async (t) => {
  const enqueued = deferred();
  const finished = deferred();
  const closed = deferred();
  const events = [];
  const app = await listen((_request, response) => {
    response.once("finish", () => {
      events.push("finish");
      finished.resolve();
    });
    response.once("close", () => {
      events.push("close");
      closed.resolve();
    });
    response.write(largeBody);
    response.end(privateMarker);
    enqueued.resolve(response);
  });
  t.after(app.stop);
  const client = await rawClient(app.port, { paused: true });
  t.after(() => client.socket.destroy());

  const response = await bounded(enqueued.promise, "large body enqueued");
  assert.equal(response.writableEnded, true);
  await bounded(finished.promise, "large body server finish");
  assert.equal(response.writableFinished, true);
  assert.deepEqual(events, ["finish", "close"]);
  assert.equal(
    client.state.bytes,
    0,
    "paused JavaScript client has not read data",
  );
  client.socket.destroy();
  await bounded(closed.promise, "aborted response close");
  assert.equal(response.writableFinished, true);
  assert.deepEqual(events, ["finish", "close"]);
});
