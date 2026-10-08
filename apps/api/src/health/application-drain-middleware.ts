import type { IncomingMessage, ServerResponse } from "node:http";

import type { ApplicationDrainState } from "./application-drain-state";

const healthPaths = new Set(["/health/live", "/health/ready"]);

function requestPath(request: IncomingMessage): string {
  return (request.url ?? "").split("?", 1)[0] ?? "";
}

export function createApplicationDrainMiddleware(state: ApplicationDrainState) {
  return (
    request: IncomingMessage,
    response: ServerResponse,
    next: () => void,
  ): void => {
    if (healthPaths.has(requestPath(request))) {
      next();
      return;
    }

    const finish = state.tryBeginRequest();
    if (finish === undefined) {
      response.statusCode = 503;
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.end(JSON.stringify({ status: "unavailable" }));
      return;
    }

    response.once("finish", finish);
    response.once("close", finish);
    next();
  };
}
