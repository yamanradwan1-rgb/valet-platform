import { parseNativePushWirePayload } from "./native-push-payload";

const maxForegroundIntentIds = 64;

export class NativePushForegroundAttentionOwner {
  private active = false;
  private readonly intentIds = new Set<string>();

  setForeground(active: boolean): boolean {
    const resumed = active && !this.active;
    this.active = active;
    return resumed;
  }

  receive(
    data: unknown,
    identityIsCurrent: boolean,
  ): readonly string[] | undefined {
    if (!this.active || !identityIsCurrent) return undefined;
    const payload = parseNativePushWirePayload(data);
    if (payload === null || this.intentIds.has(payload.intentId))
      return undefined;
    if (this.intentIds.size >= maxForegroundIntentIds) {
      const oldest = this.intentIds.values().next().value;
      if (oldest !== undefined) this.intentIds.delete(oldest);
    }
    this.intentIds.add(payload.intentId);
    return [...this.intentIds];
  }

  dismiss(intentId: string): readonly string[] | undefined {
    return this.intentIds.delete(intentId) ? [...this.intentIds] : undefined;
  }

  clear(): void {
    this.intentIds.clear();
  }
}
