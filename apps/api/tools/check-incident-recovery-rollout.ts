import { incidentRecoveryCapability } from "@valet/contracts";

interface CapabilityResponse {
  readonly capability?: unknown;
}

export async function verifyIncidentRecoveryReplicaRollout(
  replicaOrigins: readonly string[],
  request: typeof fetch = fetch,
): Promise<void> {
  if (replicaOrigins.length === 0) {
    throw new Error("At least one direct API replica origin is required.");
  }
  await Promise.all(
    replicaOrigins.map(async (origin) => {
      const response = await request(
        new URL("/capabilities/incident-recovery", origin),
      );
      if (!response.ok) throw new Error("An API replica was not ready.");
      const body = (await response.json()) as CapabilityResponse;
      if (body.capability !== incidentRecoveryCapability) {
        throw new Error(
          "Mixed rollout: an API replica lacks Incident recovery admission.",
        );
      }
    }),
  );
}

async function main(): Promise<void> {
  await verifyIncidentRecoveryReplicaRollout(process.argv.slice(2));
  process.stdout.write(
    "All API replicas support Incident recovery admission.\n",
  );
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : "Readiness failed.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
