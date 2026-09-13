import { employeeNetworkError } from "@valet/employee-client";
import { describe, expect, it, vi } from "vitest";

import { NativeGuestAccessSession } from "../src/guest-access/native-guest-access-session";
import { NativeIncidentSession } from "../src/incident/native-incident-session";
import {
  detail as guestDetail,
  issuePayload,
  target,
  tokenA,
  validOrigin,
} from "./native-guest-access-runtime-test-support";
import { detail as incidentDetail } from "./native-parity-11-test-fixture";

const incidentId = "11111111-1111-4111-8111-111111111111";
const report = {
  createdAt: "2026-09-10T10:00:00.000Z",
  incidentId,
  reportedByMembershipId: "33333333-3333-4333-8333-333333333333",
  sessionId: target.sessionId,
  severity: "HIGH" as const,
  status: "OPEN" as const,
  type: "VEHICLE_DAMAGE" as const,
};

describe("MOB-023B Native process-death recovery", () => {
  it("retains no Guest bearer or protected canary in Process B durable state", async () => {
    let guestStatus: "ACTIVE" | "NOT_ISSUED" = "NOT_ISSUED";
    const processARequests: string[] = [];
    const processARequest = vi.fn(
      async (input: { readonly method: string; readonly path: string }) => {
        processARequests.push(input.method);
        if (input.method === "GET") return guestDetail(guestStatus);
        guestStatus = "ACTIVE";
        return issuePayload(tokenA);
      },
    );
    let processA: NativeGuestAccessSession | undefined =
      new NativeGuestAccessSession(
        () => ({ request: processARequest }) as never,
        { customerOrigin: validOrigin },
      );
    await processA.open(target);
    await processA.issue();
    expect(processA.freshCredentialUrl()).toContain(tokenA);

    processA = undefined;
    const processBRequests: string[] = [];
    const processB = new NativeGuestAccessSession(
      () =>
        ({
          request: async (input: { readonly method: string }) => {
            processBRequests.push(input.method);
            return guestDetail(guestStatus);
          },
        }) as never,
      { customerOrigin: validOrigin },
    );
    await processB.open(target);

    const accessToken = "access-token-process-a";
    const pickupCode = "4815";
    const dynamicQr = "dynamic-qr-process-a";
    const supervisorProof = "supervisor-proof-process-a";
    const paymentSecret = "payment-secret-process-a";
    const appDurableStore = { locale: "en", theme: "system" };
    const serialized = JSON.stringify({
      appDurableStore,
      processB: processB.current(),
    });
    for (const canary of [
      accessToken,
      tokenA,
      pickupCode,
      dynamicQr,
      supervisorProof,
      paymentSecret,
      "Authorization",
    ]) {
      expect(serialized).not.toContain(canary);
    }
    expect(processB.current()).toMatchObject({
      credentialFresh: false,
      status: "ACTIVE",
    });
    expect(processB.freshCredentialUrl()).toBeNull();
    expect(processARequests).toEqual(["GET", "POST"]);
    expect(processBRequests).toEqual(["GET"]);
  });

  it.each([
    { committed: false, outcome: "not-committed" },
    { committed: true, outcome: "committed" },
  ])(
    "does not replay Incident after a $outcome lost response",
    async ({ committed }) => {
      const serverReports: (typeof report)[] = [];
      const processARequest = vi
        .fn()
        .mockResolvedValueOnce(incidentDetail())
        .mockImplementationOnce(() => {
          if (committed) serverReports.push(report);
          return Promise.reject(employeeNetworkError());
        });
      let processA: NativeIncidentSession | undefined =
        new NativeIncidentSession(
          () => ({ request: processARequest }) as never,
          undefined,
          undefined,
          () => incidentId,
        );
      await processA.open(target);
      await processA.submit({
        description: "Damage",
        severity: "HIGH",
        type: "VEHICLE_DAMAGE",
      });

      processA = undefined;
      const processBRequest = vi.fn().mockResolvedValue(incidentDetail());
      const createProcessBId = vi.fn(() => crypto.randomUUID());
      const processB = new NativeIncidentSession(
        () => ({ request: processBRequest }) as never,
        undefined,
        undefined,
        createProcessBId,
      );
      await processB.open(target);

      expect(processB.current()).toMatchObject({ phase: "form", report: null });
      expect(processBRequest).toHaveBeenCalledTimes(1);
      expect(processBRequest.mock.calls[0]?.[0]).toMatchObject({
        method: "GET",
      });
      expect(createProcessBId).not.toHaveBeenCalled();
      expect(serverReports).toHaveLength(committed ? 1 : 0);
    },
  );
});
