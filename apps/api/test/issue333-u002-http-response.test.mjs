import assert from "node:assert/strict";
import { Agent } from "node:http";
import test from "node:test";

import { bounded, deferred, httpBody, listen, rawClient } from "./issue333-u002-http-socket-fixture.mjs";

const privateMarker = "W4_PRIVATE_SYNTHETIC_ONLY_NOT_REAL_CUSTOMER";
const largeBody = Buffer.alloc(24 * 1024 * 1024, 0x58);

test("records real end-return versus finish ordering before TCP client read", async (t) => {
  const ended = deferred();
  const finished = deferred();
  const events = [];
  const app = await listen((_request, response) => {
    response.once("finish", () => {
      events.push("finish");
      finished.resolve();
    });
    response.once("close", () => events.push("close"));
    const writable = response.write(largeBody);
    response.end(privateMarker);
    events.push("end-return");
    const finishSeenAtEndReturn = events.includes("finish");
    events.push("simulated-revoke-commit-after-end-return");
    ended.resolve({ writable, finished: response.writableFinished, finishSeenAtEndReturn });
  });
  t.after(app.stop);
  const client = await rawClient(app.port, { paused: true });
  t.after(() => client.socket.destroy());

  const state = await bounded(ended.promise, "end-return");
  assert.equal(state.writable, false, "large HTTP write must trigger backpressure");
  assert.equal(client.state.bytes, 0, "paused client has not consumed TCP bytes");

  client.socket.resume();
  await bounded(finished.promise, "real response finish");
  await bounded(client.closed, "real client socket close");
  assert.ok(client.state.tail.includes(Buffer.from(privateMarker)));
  assert.ok(client.state.bytes > largeBody.length);
  assert.ok(events.indexOf("end-return") < events.indexOf("simulated-revoke-commit-after-end-return"));
  const writerBeforeFinish = events.indexOf("simulated-revoke-commit-after-end-return") <
    events.indexOf("finish");
  assert.equal(writerBeforeFinish, !state.finishSeenAtEndReturn);
  t.diagnostic(`end-writableFinished=${state.finished}; writer-before-finish=${writerBeforeFinish}`);
  assert.ok(events.includes("close"));
});

test("finish-retained synthetic fence delays writer until OS handoff", async (t) => {
  const ended = deferred();
  const finished = deferred();
  const events = [];
  const app = await listen((_request, response) => {
    response.once("finish", () => {
      events.push("finish");
      finished.resolve();
    });
    response.write(largeBody);
    response.end(privateMarker);
    events.push("end-return");
    ended.resolve(response.writableFinished);
  });
  t.after(app.stop);
  const client = await rawClient(app.port, { paused: true });
  t.after(() => client.socket.destroy());
  const writer = finished.promise.then(() => events.push("simulated-revoke-commit-after-finish"));

  const finishedAtEnd = await bounded(ended.promise, "end-return");
  assert.equal(typeof finishedAtEnd, "boolean");
  client.socket.resume();
  await bounded(writer, "finish-held writer");
  await bounded(client.closed, "real client close");
  assert.ok(client.state.tail.includes(Buffer.from(privateMarker)));
  assert.ok(events.indexOf("finish") < events.indexOf("simulated-revoke-commit-after-finish"));
});

test("early handler release permits late streamed private bytes after simulated commit", async (t) => {
  const entered = deferred();
  const resumeStream = deferred();
  const finished = deferred();
  const events = [];
  const app = await listen((_request, response) => {
    response.once("finish", () => { events.push("finish"); finished.resolve(); });
    response.write("synthetic-nonprivate-prefix");
    events.push("handler-resolved-before-body-end");
    entered.resolve();
    void resumeStream.promise.then(() => response.end(privateMarker));
  });
  t.after(() => resumeStream.resolve());
  t.after(app.stop);
  const client = await rawClient(app.port, { paused: true });
  t.after(() => client.socket.destroy());

  await bounded(entered.promise, "early completed handler");
  events.push("simulated-revoke-commit-after-handler");
  assert.equal(events.includes("finish"), false);
  resumeStream.resolve();
  client.socket.resume();
  await bounded(finished.promise, "late streamed finish");
  await bounded(client.closed, "late streamed client close");
  assert.ok(client.state.tail.includes(Buffer.from(privateMarker)));
  assert.ok(events.indexOf("simulated-revoke-commit-after-handler") < events.indexOf("finish"));
});

test("write(false) signals real backpressure and drain precedes final bytes", async (t) => {
  const entered = deferred();
  const drained = deferred();
  const finished = deferred();
  const events = [];
  const app = await listen((_request, response) => {
    response.once("finish", () => { events.push("finish"); finished.resolve(); });
    const writable = response.write(largeBody);
    events.push("write");
    entered.resolve(writable);
    response.once("drain", () => {
      events.push("drain");
      drained.resolve();
      response.end(privateMarker);
    });
  });
  t.after(app.stop);
  const client = await rawClient(app.port, { paused: true });
  t.after(() => client.socket.destroy());
  assert.equal(await bounded(entered.promise, "backpressure write"), false);
  client.socket.resume();
  await bounded(drained.promise, "TCP drain");
  await bounded(finished.promise, "drained response finish");
  await bounded(client.closed, "drained client close");
  assert.ok(client.state.tail.includes(Buffer.from(privateMarker)));
  assert.ok(events.indexOf("drain") < events.indexOf("finish"));
});

test("keep-alive reuses one TCP socket but finishes two distinct responses", async (t) => {
  const agent = new Agent({ keepAlive: true, maxSockets: 1 });
  t.after(() => agent.destroy());
  const sockets = [];
  const finishes = [];
  const app = await listen((_request, response) => {
    const id = sockets.length + 1;
    sockets.push(response.socket);
    response.once("finish", () => finishes.push(id));
    response.end(`scope-${id}`);
  });
  t.after(app.stop);

  const first = await bounded(httpBody(app.port, { agent }), "first keep-alive response");
  const second = await bounded(httpBody(app.port, { agent }), "second keep-alive response");
  assert.equal(first.body, "scope-1");
  assert.equal(second.body, "scope-2");
  assert.equal(second.reusedSocket, true);
  assert.equal(sockets[0], sockets[1]);
  assert.deepEqual(finishes, [1, 2]);
});
