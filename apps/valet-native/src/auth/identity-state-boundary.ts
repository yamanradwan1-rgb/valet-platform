import type { IdentityScopedStateBoundary } from "@valet/employee-client";

type PurgeHandler = () => Promise<void> | void;

export class NativeIdentityStateBoundary implements IdentityScopedStateBoundary {
  private readonly handlers = new Set<PurgeHandler>();

  register(handler: PurgeHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async purge(): Promise<void> {
    let failed = false;
    let firstFailure: unknown;
    for (const handler of this.handlers) {
      try {
        await handler();
      } catch (error) {
        if (!failed) firstFailure = error;
        failed = true;
      }
    }
    if (failed) throw firstFailure;
  }
}

export const nativeIdentityState = new NativeIdentityStateBoundary();
