import { describe, expect, it, vi } from "vitest";
import { verifyIncidentRecoveryReplicaRollout } from "../tools/check-incident-recovery-rollout";
import { AppController } from "../src/app.controller";

function replica(capability?: string): Response {
  return new Response(JSON.stringify({ capability }), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
}

describe("DEC-077 deployment readiness", () => {
  it("reports the command-specific capability from each current API writer", () => {
    expect(new AppController().incidentRecoveryCapability()).toEqual({
      capability: "incident-recovery-intent-v1",
    });
  });

  it("accepts two writers only when both report the narrow capability", async () => {
    const request = vi.fn(async () => replica("incident-recovery-intent-v1"));
    await expect(
      verifyIncidentRecoveryReplicaRollout(
        ["https://writer-a.test", "https://writer-b.test"],
        request,
      ),
    ).resolves.toBeUndefined();
    expect(request).toHaveBeenCalledTimes(2);
    expect(request).toHaveBeenCalledWith(
      new URL("https://writer-a.test/capabilities/incident-recovery"),
    );
  });

  it("rejects a mixed two-replica rollout before Native enrollment", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(replica("incident-recovery-intent-v1"))
      .mockResolvedValueOnce(replica());
    await expect(
      verifyIncidentRecoveryReplicaRollout(
        ["https://writer-a.test", "https://legacy-writer.test"],
        request,
      ),
    ).rejects.toThrow("Mixed rollout");
  });
});
