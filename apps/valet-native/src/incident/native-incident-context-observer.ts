import type {
  IncidentRecoveryContext,
  IncidentRecoveryStore,
  InstallationAuthStateStore,
  NativeAuthSession,
  StaffOperationalContextResponse,
} from "@valet/employee-client";
import type { NativeIncidentSession } from "./native-incident-session";
import { resolveNativeIncidentRecoveryContext } from "./native-incident-recovery-context";

/** Orders async operational-context resolution without changing recovery policy. */
export class NativeIncidentContextObserver {
  private generation = 0;

  constructor(
    private readonly incident: Pick<
      NativeIncidentSession,
      | "purgeRecovery"
      | "fenceRecovery"
      | "observeRecoveryContext"
      | "recoveryContextFence"
    >,
    private readonly resolve: (
      response: StaffOperationalContextResponse,
    ) => Promise<IncidentRecoveryContext | "invalidated" | null>,
    private readonly identityIsCurrent: (generation: number) => boolean,
  ) {}

  invalidate(): void {
    this.generation += 1;
  }

  async observe(
    identityGeneration: number,
    response: StaffOperationalContextResponse,
  ): Promise<void> {
    if (!this.identityIsCurrent(identityGeneration)) return;
    const generation = ++this.generation;
    // Fence the lookup itself, then capture each session operation's new generation.
    let lifecycleIsCurrent = this.incident.recoveryContextFence();
    const isCurrent = () =>
      generation === this.generation &&
      this.identityIsCurrent(identityGeneration) &&
      lifecycleIsCurrent();
    if (!isCurrent()) return;
    try {
      const context = await this.resolve(response);
      if (!isCurrent()) return;
      if (context === "invalidated") {
        const purge = this.incident.purgeRecovery();
        lifecycleIsCurrent = this.incident.recoveryContextFence();
        await purge;
        if (isCurrent()) this.incident.fenceRecovery("recovery-invalidated");
      } else if (context !== null) {
        const observe = this.incident.observeRecoveryContext(context);
        lifecycleIsCurrent = this.incident.recoveryContextFence();
        await observe;
      } else {
        const purge = this.incident.purgeRecovery();
        lifecycleIsCurrent = this.incident.recoveryContextFence();
        await purge;
      }
    } catch {
      if (isCurrent()) this.incident.fenceRecovery("recovery-unavailable");
    }
  }
}

export function createNativeIncidentContextObserver(
  incident: NativeIncidentSession,
  auth: NativeAuthSession,
  store: IncidentRecoveryStore,
  installation: InstallationAuthStateStore,
): NativeIncidentContextObserver {
  return new NativeIncidentContextObserver(
    incident,
    (response) =>
      resolveNativeIncidentRecoveryContext(response, store, installation),
    (generation) =>
      auth.current().phase === "authenticated" &&
      auth.current().authGeneration === generation,
  );
}
