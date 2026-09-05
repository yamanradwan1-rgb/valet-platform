export interface PlateOcrCostIdentity {
  readonly organizationId: string;
  readonly membershipId: string;
  readonly targetLocationId: string;
}
interface Entry {
  inFlight: boolean;
  calls: number[];
}

/** DEC-074 §22: controlled non-production only; not shared/durable authority. */
export class PlateOcrCostGuard {
  private readonly entries = new Map<string, Entry>();
  constructor(
    private readonly mode: string | undefined,
    private readonly now: () => number,
    private readonly maxIdentities = 1024,
  ) {}

  acquire(identity: PlateOcrCostIdentity): (() => void) | undefined {
    if (this.mode !== "development" && this.mode !== "test") return undefined;
    const now = this.now();
    if (!Number.isFinite(now)) return undefined;
    for (const [key, entry] of this.entries) {
      entry.calls = entry.calls.filter((time) => time > now - 60_000);
      if (!entry.inFlight && entry.calls.length === 0) this.entries.delete(key);
    }
    const key = JSON.stringify([
      identity.organizationId,
      identity.membershipId,
      identity.targetLocationId,
    ]);
    let entry = this.entries.get(key);
    if (entry === undefined) {
      if (this.entries.size >= this.maxIdentities) return undefined;
      entry = { calls: [], inFlight: false };
      this.entries.set(key, entry);
    }
    if (
      entry.inFlight ||
      entry.calls.length >= 20 ||
      entry.calls.filter((time) => time > now - 10_000).length >= 5
    )
      return undefined;
    entry.inFlight = true;
    entry.calls.push(now);
    const acquired = entry;
    return () => {
      acquired.inFlight = false;
    };
  }
}
