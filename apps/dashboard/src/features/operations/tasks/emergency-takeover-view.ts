import {
  staffManagementDisplayName,
  type EmergencyTakeoverContextResponse,
} from "@valet/contracts";
import { formatOperationsTime } from "../operations-presentation";
import { emergencyTakeoverCopy } from "./emergency-takeover-copy";
import type { EmergencyTakeoverView } from "./emergency-takeover-dialog";

export function emergencyTakeoverView(
  context: EmergencyTakeoverContextResponse,
  locale: "en" | "ar",
  timezone: string,
): EmergencyTakeoverView {
  const t = emergencyTakeoverCopy(locale);
  const time = (value: string) => formatOperationsTime(value, timezone, locale);
  const latest = context.custody;
  const recorded = latest.source === "RECORDED";
  const custody: { label: string; value: string }[] = [];
  if (context.resources.keySlot)
    custody.push({ label: t.keySlot, value: resourceName(context.resources.keySlot) });
  if (context.resources.parkingSpot)
    custody.push({ label: t.parkingSpot, value: resourceName(context.resources.parkingSpot) });
  if (context.resources.parkingZone)
    custody.push({ label: t.parkingZone, value: resourceName(context.resources.parkingZone) });
  custody.push({
    label: t.keyEvent,
    value: !recorded ? t.noCustody : latest.latestKeyEventType
      ? t.eventTypes[latest.latestKeyEventType]
      : t.custodyDetailsUnavailable,
  });
  if (recorded && latest.latestKeyEventActorMembershipId)
    custody.push({ label: t.actor, value: latest.latestKeyEventActorMembershipId });
  if (recorded && latest.occurredAt)
    custody.push({ label: t.eventAt, value: time(latest.occurredAt) });

  return {
    taskId: context.task.id,
    vehicle: context.vehicle.licensePlate?.trim() ||
      context.vehicle.descriptor?.trim() || context.vehicle.id,
    currentAssignee: context.currentAssignee
      ? staffManagementDisplayName(context.currentAssignee.identity)
      : t.unassigned,
    candidates: context.eligibleAssignees.map((candidate) => ({
      membershipId: candidate.membershipId,
      label: staffManagementDisplayName(candidate.identity),
    })),
    hasMoreCandidates: context.hasMoreEligibleAssignees,
    custody,
    recentCustody: context.recentCustodyEvents.map((event) => ({
      id: event.eventId,
      label: [
        time(event.occurredAt),
        t.eventTypes[event.eventType],
        `(${t.actor}: ${event.actorMembershipId})`,
      ].join(" "),
    })),
    history: context.recentTakeovers.map((event) => ({
      id: event.eventId,
      label: [
        time(event.occurredAt),
        event.fromAssigneeMembershipId ?? t.unassigned,
        "→",
        event.toAssigneeMembershipId,
        event.actorMembershipId ? `(${t.actor}: ${event.actorMembershipId})` : "",
      ].filter(Boolean).join(" "),
    })),
  };
}

function resourceName(resource: { readonly code: string; readonly label: string | null }) {
  return resource.label?.trim() || resource.code;
}
