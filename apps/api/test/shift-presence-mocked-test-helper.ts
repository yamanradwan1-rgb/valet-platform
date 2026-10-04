import { randomUUID } from "node:crypto";
import { shiftPresenceChallengeResponseSchema } from "@valet/contracts";
import type { PresenceServerTestContext } from "./shift-presence-server-test-context";
import type { presenceHttp } from "./shift-presence-http-test-helper";

export const mockedSignals = [undefined, false, true] as const;
export const presenceActions = ["START", "END"] as const;
export const presencePrefix = "/v1/staff/shifts/presence";

export async function mockedHttpCase(
  db: PresenceServerTestContext,
  http: Awaited<ReturnType<typeof presenceHttp>>,
  action: (typeof presenceActions)[number],
  mocked: boolean | undefined,
  mode: "REQUIRE" | "WARN_ONLY" = "REQUIRE",
  latitude = 31.95,
) {
  const fixture = await db.createFixture();
  const shift = action === "END" ? await db.start(fixture) : undefined;
  await db.policy(fixture, mode);
  await db.zone(fixture);
  const auth = await db.session(fixture.userId);
  const operationId = randomUUID();
  const issued = await http.request(
    "POST",
    `${presencePrefix}/challenges`,
    auth.token,
    action === "START"
      ? { action, targetLocationId: fixture.locationId, operationId }
      : { action, shiftId: shift!.shiftId, cashReported: "0", operationId },
  );
  if (issued.status !== 200)
    throw new Error("Synthetic challenge issue failed");
  const challenge = shiftPresenceChallengeResponseSchema.parse(issued.body);
  const measured = db.measured(challenge, latitude);
  const evidence = {
    ...measured,
    measurement: {
      ...measured.measurement,
      ...(mocked === undefined ? {} : { mocked }),
    },
  };
  const body =
    action === "START"
      ? {
          targetLocationId: fixture.locationId,
          operationId,
          presence: evidence,
        }
      : { cashReported: "0", operationId, presence: evidence };
  const path =
    action === "START"
      ? "/v1/staff/shifts/start"
      : `/v1/staff/shifts/${shift!.shiftId}/end`;
  return { fixture, auth, shift, challenge, evidence, body, path };
}
