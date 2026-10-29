import type { EndShiftResponse } from "@valet/contracts";

import { EmployeeApiError } from "../../lib/api/employee-api-errors";
import { endShiftSession } from "./shift-api";

export type EndShiftPhase =
  | { kind: "idle" }
  | { kind: "submitting" }
  | {
      kind: "error";
      code: string | null;
      message: string;
      openWorkBlocked: boolean;
    }
  | {
      /**
       * DEC-066 §4 ambiguous outcome: transport failed, so the server may or
       * may not have committed. Never presented as success. Only the minimum
       * transient in-memory retry intent is retained while mounted; explicit
       * retry re-sends the SAME command and relies on existing server
       * idempotency for an already-ended self-owned Shift.
       */
      kind: "uncertain";
      cashReported: string;
      shiftId: string;
    }
  | { kind: "ended"; result: EndShiftResponse };

export interface EndShiftControllerOptions {
  readonly apiClient: import("../../lib/api/employee-api-client").EmployeeApiClient;
  readonly onEnded?: ((result: EndShiftResponse) => void) | undefined;
  readonly onStateChange?: ((phase: EndShiftPhase) => void) | undefined;
}

function isAmbiguousOutcome(error: unknown): boolean {
  return error instanceof EmployeeApiError && error.isNetworkError === true;
}

/**
 * Headless End Shift mutation controller (DEC-066 §4). No persistence of any
 * kind; uncertain retry intent lives only in this in-memory instance.
 */
export class EndShiftController {
  private apiClient: EndShiftControllerOptions["apiClient"];
  private onEnded?: ((result: EndShiftResponse) => void) | undefined;
  private onStateChange?: ((phase: EndShiftPhase) => void) | undefined;

  private phase: EndShiftPhase = { kind: "idle" };
  /** Invalidates responses from commands retired by a scope/identity reset. */
  private commandGeneration = 0;

  constructor(options: EndShiftControllerOptions) {
    this.apiClient = options.apiClient;
    this.onEnded = options.onEnded;
    this.onStateChange = options.onStateChange;
  }

  getPhase(): EndShiftPhase {
    return this.phase;
  }

  activate(onStateChange: (phase: EndShiftPhase) => void): void {
    this.onStateChange = onStateChange;
    onStateChange(this.phase);
  }

  setApiClient(apiClient: EndShiftControllerOptions["apiClient"]): void {
    this.apiClient = apiClient;
  }

  setOnEnded(onEnded: ((result: EndShiftResponse) => void) | undefined): void {
    this.onEnded = onEnded;
  }

  reset(): void {
    this.commandGeneration++;
    this.phase = { kind: "idle" };
    this.onStateChange?.(this.phase);
  }

  /** Explicit retry of the SAME retained command (DEC-066 §4). */
  retry(): void {
    if (this.phase.kind !== "uncertain") return;
    this.submit(this.phase.shiftId, this.phase.cashReported);
  }

  /** Explicit submission of the SAME command; also used for uncertain retry. */
  submit(shiftId: string, cashReported: string): void {
    if (this.phase.kind === "submitting") return;
    if (this.phase.kind === "uncertain") {
      // Explicit retry must reuse the retained SAME-command intent.
      if (
        shiftId !== this.phase.shiftId ||
        cashReported !== this.phase.cashReported
      ) {
        return;
      }
    }
    const generation = ++this.commandGeneration;
    this.setPhase({ kind: "submitting" });
    void endShiftSession(this.apiClient, shiftId, cashReported).then(
      (result) => {
        if (generation !== this.commandGeneration) return;
        this.setPhase({ kind: "ended", result });
        this.onEnded?.(result);
      },
      (error: unknown) => {
        if (generation !== this.commandGeneration) return;
        if (isAmbiguousOutcome(error)) {
          this.setPhase({ cashReported, kind: "uncertain", shiftId });
          return;
        }
        const apiCode = error instanceof EmployeeApiError ? error.code : null;
        const message =
          error instanceof Error ? error.message : "End Shift failed.";
        this.setPhase({
          code: apiCode,
          kind: "error",
          message,
          openWorkBlocked: apiCode === "OPEN_TASK_HANDOFF_REQUIRED",
        });
      },
    );
  }

  private setPhase(phase: EndShiftPhase): void {
    this.phase = phase;
    this.onStateChange?.(phase);
  }
}
