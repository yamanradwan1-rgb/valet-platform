/** Origin-scoped, non-secret browser marker. Never store staff credentials here. */
const BOUNDARY_KEY = "vaylet.staff.auth-boundary.v1";

type BoundaryPhase = "pending" | "signed-out" | "signed-in";
type BoundaryState = { readonly phase: BoundaryPhase; readonly nonce: string } | null;

export interface StaffAuthBoundarySnapshot {
  readonly revision: number;
  readonly value: string | null;
}

const UNAVAILABLE = "pending:storage-unavailable";

function readBoundary(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(BOUNDARY_KEY);
    if (value === null) return null;
    // Treat a corrupted or unknown marker as a pending logout (fail closed).
    return parseBoundary(value) === null ? UNAVAILABLE : value;
  } catch {
    return UNAVAILABLE;
  }
}

function parseBoundary(value: string): BoundaryState {
  const match = /^(pending|signed-out|signed-in):([a-zA-Z0-9-]{1,100})$/.exec(value);
  return match ? { phase: match[1] as BoundaryPhase, nonce: match[2]! } : null;
}

function nextNonce(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export class StaffAuthBoundary {
  private value = readBoundary();
  private revision = 0;

  constructor(private readonly onExternalChange: () => void) {
    if (typeof window !== "undefined") {
      window.addEventListener("storage", (event) => {
        if (event.key === BOUNDARY_KEY || event.key === null) this.sync();
      });
    }
  }

  private sync(): void {
    const latest = readBoundary();
    if (latest === this.value) return;
    this.value = latest;
    this.revision++;
    this.onExternalChange();
  }

  snapshot(): StaffAuthBoundarySnapshot {
    this.sync();
    return { revision: this.revision, value: this.value };
  }

  isSilentAuthBlocked(): boolean {
    const value = this.snapshot().value;
    return value !== null && parseBoundary(value)?.phase !== "signed-in";
  }

  isUnchanged(snapshot: StaffAuthBoundarySnapshot): boolean {
    this.sync();
    return snapshot.revision === this.revision && snapshot.value === this.value;
  }

  private writePhase(phase: BoundaryPhase): StaffAuthBoundarySnapshot {
    const value = `${phase}:${nextNonce()}`;
    if (typeof window !== "undefined") {
      // A failed persistence write must never silently lift a logout fence.
      window.localStorage.setItem(BOUNDARY_KEY, value);
    }
    this.value = typeof window === "undefined" ? null : value;
    this.revision++;
    return this.snapshot();
  }

  beginLogout(): StaffAuthBoundarySnapshot {
    return this.writePhase("pending");
  }

  confirmLogout(started: StaffAuthBoundarySnapshot): void {
    if (this.isUnchanged(started)) this.writePhase("signed-out");
  }

  completeInteractiveLogin(started: StaffAuthBoundarySnapshot): boolean {
    if (!this.isUnchanged(started)) return false;
    this.writePhase("signed-in");
    return true;
  }
}
