import { Buffer } from "node:buffer";
import { createServer, get } from "node:http";
import { Socket } from "node:net";
import { clearTimeout, setTimeout } from "node:timers";

export function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

export async function bounded(promise, label, timeoutMs = 12_000) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function listen(handler) {
  const server = createServer(handler);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  };
  return { server, port, stop };
}

export async function rawClient(port, { paused = false } = {}) {
  const socket = new Socket();
  const firstData = deferred();
  const closed = deferred();
  const state = { bytes: 0, tail: Buffer.alloc(0), error: null };
  socket.on("data", (chunk) => {
    state.bytes += chunk.length;
    state.tail = Buffer.concat([state.tail, chunk]).subarray(-256);
    firstData.resolve();
  });
  socket.on("error", (error) => {
    state.error = error.code ?? error.message;
  });
  socket.once("close", () => {
    firstData.resolve();
    closed.resolve();
  });
  if (paused) socket.pause();
  await new Promise((resolve, reject) => {
    socket.once("error", reject);
    socket.connect(port, "127.0.0.1", resolve);
  });
  socket.write(
    "GET / HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n",
  );
  return {
    socket,
    state,
    firstData: firstData.promise,
    closed: closed.promise,
  };
}

export async function httpBody(port, { agent } = {}) {
  return new Promise((resolve, reject) => {
    const request = get(
      { hostname: "127.0.0.1", port, path: "/", agent },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.once("error", reject);
        response.once("end", () =>
          resolve({
            status: response.statusCode,
            body: Buffer.concat(chunks).toString("utf8"),
            reusedSocket: request.reusedSocket,
          }),
        );
      },
    );
    request.once("error", reject);
  });
}
