import type { NativeGuestAccessSnapshot } from "./native-guest-access-types";

interface HeldCredential {
  readonly sessionId: string;
  readonly url: string;
}

/** Process-memory-only custody for the one-time issue response credential. */
export class NativeGuestAccessCredentialMemory {
  private held: HeldCredential | null = null;

  clear(): void {
    this.held = null;
  }

  replace(sessionId: string, url: string): void {
    this.held = { sessionId, url };
  }

  current(snapshot: NativeGuestAccessSnapshot): string | null {
    const held = this.held;
    return held !== null && this.isFreshFor(snapshot) ? held.url : null;
  }

  isFreshFor(
    snapshot: Pick<NativeGuestAccessSnapshot, "phase" | "status" | "target">,
  ): boolean {
    return (
      this.held !== null &&
      snapshot.phase === "ready" &&
      snapshot.status === "ACTIVE" &&
      snapshot.target?.sessionId === this.held.sessionId
    );
  }
}
