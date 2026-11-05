import type { IncomingMessage, ServerResponse } from "node:http";

/** Own cancellation until the HTTP response ends, not until upload completes. */
export function ownPlateOcrRequestCancellation(
  request: IncomingMessage,
  response: ServerResponse,
): AbortSignal {
  const controller = new AbortController();
  const abort = () => controller.abort();
  // IncomingMessage 'close' also fires after an ordinary complete upload.
  const onRequestClose = () => {
    if (!request.complete) abort();
  };
  const onResponseClose = () => {
    if (!response.writableEnded) abort();
    cleanup();
  };
  const cleanup = () => {
    request.off("aborted", abort);
    request.off("close", onRequestClose);
    response.off("close", onResponseClose);
    response.off("finish", cleanup);
  };
  request.on("aborted", abort);
  request.on("close", onRequestClose);
  response.on("close", onResponseClose);
  response.on("finish", cleanup);
  if (request.aborted || (request.destroyed && !request.complete)) abort();
  if (response.destroyed && !response.writableEnded) onResponseClose();
  return controller.signal;
}
