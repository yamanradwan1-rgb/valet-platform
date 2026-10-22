import http from "node:http";

// Synthetic HTTP contract fixture. This is not live API/DB authorization proof.
export const visitId = "123e4567-e89b-12d3-a456-426614174000";
export const session = (state = "COMPLETED", id = visitId) => ({
  valetSessionId: id,
  state,
  readyAt: "2026-10-22T12:00:00.000Z",
  vehicle: { make: "Toyota", model: "Camry", color: "Black" },
});
export function fixture(port = 3311) {
  const control = {
    state: "COMPLETED",
    id: visitId,
    failure: null,
    ratingPosts: 0,
    reads: 0,
  };
  const server = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    const send = (value, status = 200) => {
      res.statusCode = status;
      res.end(JSON.stringify(value));
    };
    if (req.url === "/v1/guest/session") {
      control.reads++;
      if (control.failure)
        return send(
          { code: control.failure, message: "Fixture failure" },
          control.failure === "GUEST_ACCESS_INVALID" ? 401 : 503,
        );
      return send(session(control.state, control.id));
    }
    if (req.url?.endsWith("/payment"))
      return send({
        releaseRequiresPayment: false,
        releaseSatisfied: true,
        payment: null,
        refunds: [],
      });
    if (req.url?.includes("/handoff-verification/")) {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        const { method } = JSON.parse(body);
        send({
          valetSessionId: control.id,
          state: "HANDOFF_PENDING",
          method,
          expiresAt: "2026-10-22T12:02:00.000Z",
          ...(method === "PICKUP_CODE"
            ? { pickupCode: "4821" }
            : { qrPayload: "vhq1." + "x".repeat(43) }),
        });
      });
      return;
    }
    if (req.url === "/v1/guest/session/rating") {
      control.ratingPosts++;
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () =>
        send({
          valetSessionId: control.id,
          rating: JSON.parse(body).rating,
          ratedAt: "2026-10-22T12:05:00.000Z",
        }),
      );
      return;
    }
    return send(
      { code: "GUEST_ACCESS_INVALID", message: "Fixture unavailable" },
      401,
    );
  });
  return new Promise((resolve) =>
    server.listen(port, "127.0.0.1", () => resolve({ control, server })),
  );
}
