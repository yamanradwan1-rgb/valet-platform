import type { ApplicationDrainState } from "./application-drain-state";

type ShutdownSignal = "SIGTERM" | "SIGINT";

interface SignalSource {
  prependOnceListener(signal: ShutdownSignal, listener: () => void): unknown;
}

interface CloseableApplication {
  close(): Promise<void>;
}

/**
 * Nest invokes OnModuleDestroy BEFORE BeforeApplicationShutdown. Register a
 * synchronous withdrawal ahead of Nest's signal handler and ahead of public
 * app.close(), so dependency teardown cannot run while health still says 200.
 * Called AFTER Nest installs its own signal listeners at bootstrap.
 */
export function armEarlyShutdownWithdrawal(
  app: CloseableApplication,
  state: ApplicationDrainState,
  signals: SignalSource,
): void {
  const close = app.close.bind(app);
  app.close = async () => {
    state.beginDrain();
    await close();
  };
  const withdraw = () => state.beginDrain();
  // Nest removes its own handler and re-sends the signal after close. A
  // persistent listener would catch that second signal and prevent exit.
  signals.prependOnceListener("SIGTERM", withdraw);
  signals.prependOnceListener("SIGINT", withdraw);
}
