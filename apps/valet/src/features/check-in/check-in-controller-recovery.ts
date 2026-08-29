import type {
  StaffCheckInContinuationSummary,
  StaffCheckInDraftSummary,
} from "@valet/contracts";

import { runCheckInDiscovery } from "./check-in-discovery";
import {
  hydrateContinuationSession,
  hydrateDraftSession,
} from "./check-in-hydration";
import type { CheckInLifecycleContext } from "./check-in-controller-lifecycle";

function message(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export async function initializeCheckIn(
  context: CheckInLifecycleContext,
  locationId: string,
): Promise<void> {
  context.update({
    activeSession: null,
    correctionConflict: false,
    customerResolved: false,
    error: null,
    isHydrating: true,
    pendingCorrection: null,
    pendingCorrectionExpectedAt: null,
    pendingVehicle: null,
    recognizedVehicle: null,
    recognitionFailed: false,
    step: "discovery",
  });
  try {
    const outcome = await runCheckInDiscovery(context.client, locationId);
    if (outcome.kind === "EMPTY") {
      context.update({
        activeSession: null,
        continuations: [],
        drafts: [],
        isHydrating: false,
        step: "plate-scan",
      });
    } else if (outcome.kind === "MULTIPLE") {
      context.update({
        activeSession: null,
        continuations: outcome.continuations,
        drafts: outcome.drafts,
        isHydrating: false,
        step: "multiple-recoverable",
      });
    } else if (outcome.kind === "SINGLE_DRAFT") {
      await hydrateCheckInDraft(context, locationId, outcome.draft);
    } else if (outcome.kind === "SINGLE_CONTINUATION") {
      await hydrateCheckInContinuation(
        context,
        locationId,
        outcome.continuation,
      );
    }
  } catch (error: unknown) {
    context.update({
      error: message(error, "Failed to load check-in drafts."),
      isHydrating: false,
      step: "discovery-error",
    });
  }
}

export async function hydrateCheckInDraft(
  context: CheckInLifecycleContext,
  locationId: string,
  draft: StaffCheckInDraftSummary,
): Promise<void> {
  context.update({ error: null, isHydrating: true, recognizedVehicle: null });
  try {
    const result = await hydrateDraftSession(context.client, locationId, draft);
    context.update({
      activeSession: result.activeSession,
      isHydrating: false,
      step: result.step,
    });
  } catch (error: unknown) {
    context.update({
      error: message(error, "Failed to resume check-in draft."),
      isHydrating: false,
      step: "hydration-error",
    });
  }
}

export async function hydrateCheckInContinuation(
  context: CheckInLifecycleContext,
  locationId: string,
  continuation: StaffCheckInContinuationSummary,
): Promise<void> {
  context.update({ error: null, isHydrating: true, recognizedVehicle: null });
  try {
    const result = await hydrateContinuationSession(
      context.client,
      locationId,
      continuation,
    );
    context.update({
      activeSession: result.activeSession,
      isHydrating: false,
      step: result.step,
    });
  } catch (error: unknown) {
    context.update({
      error: message(error, "Failed to resume check-in continuation."),
      isHydrating: false,
      step: "hydration-error",
    });
  }
}
