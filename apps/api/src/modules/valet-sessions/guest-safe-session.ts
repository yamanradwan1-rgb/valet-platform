export interface GuestSafeVehicle {
  readonly color: string | null;
  readonly make: string | null;
  readonly model: string | null;
}

export interface GuestSafeSession {
  readonly guestVehicleReadyNotificationEnabled?: boolean;
  readonly readyAt: string | null;
  readonly state:
    | "AWAITING_PARKING"
    | "CHECKING_IN"
    | "COMPLETED"
    | "HANDOFF_PENDING"
    | "PARKED"
    | "PARKING"
    | "READY"
    | "REQUESTED"
    | "RETRIEVING";
  readonly valetSessionId: string;
  readonly vehicle: GuestSafeVehicle;
}

export interface GuestSafeSessionRow {
  readonly color: string | null;
  readonly guest_vehicle_ready_notification_enabled: boolean;
  readonly make: string | null;
  readonly model: string | null;
  readonly ready_at: Date | null;
  readonly state: GuestSafeSession["state"];
  readonly valet_session_id: string;
}

export function projectGuestSafeSession(
  session: GuestSafeSessionRow,
): GuestSafeSession {
  return {
    guestVehicleReadyNotificationEnabled:
      session.guest_vehicle_ready_notification_enabled,
    readyAt: session.ready_at?.toISOString() ?? null,
    state: session.state,
    valetSessionId: session.valet_session_id,
    vehicle: {
      color: session.color,
      make: session.make,
      model: session.model,
    },
  };
}
