import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import type {
  IncidentSeverity,
  IncidentType,
  ReportIncidentResponse,
} from "@valet/contracts";

export interface IncidentUiState {
  readonly error: string | null;
  readonly phase: "idle" | "submitting" | "reported";
  readonly report: ReportIncidentResponse | null;
}

/**
 * Canonical Blueprint incident categories (NOT the prototype labels).
 */
export const INCIDENT_TYPES: ReadonlyArray<{
  readonly label: string;
  readonly value: IncidentType;
}> = [
  { label: "Vehicle damage", value: "VEHICLE_DAMAGE" },
  { label: "Key missing", value: "KEY_MISSING" },
  { label: "Wrong key", value: "WRONG_KEY" },
  { label: "Key damaged", value: "KEY_DAMAGED" },
  { label: "Key locked inside", value: "KEY_LOCKED_INSIDE" },
  { label: "Unauthorized zone exit", value: "UNAUTHORIZED_ZONE_EXIT" },
  {
    label: "Wrong vehicle handoff attempt",
    value: "WRONG_VEHICLE_HANDOFF_ATTEMPT",
  },
  { label: "Payment dispute", value: "PAYMENT_DISPUTE" },
  { label: "Customer complaint", value: "CUSTOMER_COMPLAINT" },
  { label: "Employee safety", value: "EMPLOYEE_SAFETY" },
  { label: "System / connection", value: "SYSTEM_CONNECTION" },
  { label: "Other", value: "OTHER" },
];

export const INCIDENT_SEVERITIES: ReadonlyArray<{
  readonly label: string;
  readonly value: IncidentSeverity;
}> = [
  { label: "Low", value: "LOW" },
  { label: "Medium", value: "MEDIUM" },
  { label: "High", value: "HIGH" },
  { label: "Critical", value: "CRITICAL" },
];

function newIncidentId(): string {
  // Fail closed: a stable secure UUID is mandatory for the idempotent
  // submission boundary; never fall back to weak randomness.
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid === undefined || uuid === null) {
    throw new Error(
      "Secure UUID generation is unavailable; incident cannot be submitted.",
    );
  }
  return uuid;
}

/**
 * Headless incident submission with the same stable-retry discipline as
 * intake: one logical report = one client-generated incidentId, kept across
 * network/response-loss retries until authoritative success; a fresh id is
 * minted only for a genuinely new report after success. Synchronous guard
 * blocks parallel submissions.
 */
export class IncidentController {
  private state: IncidentUiState = {
    error: null,
    phase: "idle",
    report: null,
  };
  private pendingIncidentId: string | null = null;
  private submitInFlight = false;

  constructor(
    private apiClient: EmployeeApiClient,
    private readonly onStateChange: (state: IncidentUiState) => void,
  ) {}

  getState(): IncidentUiState {
    return this.state;
  }

  setApiClient(client: EmployeeApiClient): void {
    this.apiClient = client;
  }

  reset(): void {
    this.state = { error: null, phase: "idle", report: null };
    this.pendingIncidentId = null;
    this.emit();
  }

  private emit(): void {
    this.onStateChange(this.state);
  }

  async submit(input: {
    description: string;
    sessionId: string;
    severity: IncidentSeverity;
    type: IncidentType;
  }): Promise<boolean> {
    if (this.submitInFlight) return false;
    this.submitInFlight = true;
    if (this.pendingIncidentId === null) {
      this.pendingIncidentId = newIncidentId();
    }
    const stableId = this.pendingIncidentId;
    this.state = { ...this.state, error: null, phase: "submitting" };
    this.emit();
    try {
      const { reportIncident } = await import("./incident-api");
      const report = await reportIncident(this.apiClient, input.sessionId, {
        description: input.description.trim(),
        incidentId: stableId,
        severity: input.severity,
        type: input.type,
      });
      this.pendingIncidentId = null;
      this.state = { error: null, phase: "reported", report };
      this.emit();
      return true;
    } catch (error: unknown) {
      // Keep pendingIncidentId so retry reuses the exact same submission id.
      this.state = {
        ...this.state,
        error:
          error instanceof Error
            ? error.message
            : "Failed to open incident. Please retry.",
        phase: "idle",
      };
      this.emit();
      return false;
    } finally {
      this.submitInFlight = false;
    }
  }
}
