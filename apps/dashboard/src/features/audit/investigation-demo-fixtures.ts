import type {
  DemoEvent,
  DemoMatch,
  DemoSession,
  InvestigationDemoQuery,
} from "./investigation-demo-types";

/** Fictional read-only UX evidence. IDs below are demo references, not UUIDs. */
export const demoEmployees: readonly string[] = [
  "Nora Haddad",
  "Samir Khalil",
  "Lina Odeh",
  "Dispatcher Adam",
  "Maya Saeed",
  "Omar Nasser",
  "Hadi Mansour",
  "Rana Darwish",
  "Salma Faris",
  "Karim Zaid",
];

type EventRow = readonly [
  sessionIndex: number,
  id: string,
  time: string,
  source: DemoEvent["source"],
  type: string,
  actor: string | null,
  role: string | null,
  participant: string | null,
  resource: string | null,
  transition: string,
  evidence: string,
];

// Exact Concept A / SHARED_DESIGN_BRIEF fixture order and source provenance.
// Session 1021: 12 events, including 14:22 SLOT_CLEARED before 1022 reuse.
// Session 1022: 8 events, including 14:50 SLOT_CLEARED before 1023 reuse.
// Session 1023: 5 events, with a reported, not proven, KEY_MISSING incident.
const rows: readonly EventRow[] = [
  [0, "AUD-101", "13:36", "AUDIT", "VALET_SESSION_CHECK_IN_COMPLETED", "Nora Haddad", "Reception", null, null, "Check-in completed; no key claim", "Audit event record"],
  [0, "CUS-102", "13:44", "KEY", "SLOT_ASSIGNED", "Nora Haddad", "Reception", null, "K-07", "Recorded assignment; not continuous physical custody", "Custody event record"],
  [0, "DSP-103", "13:49", "DISPATCH", "ASSIGNED", "Dispatcher Adam", "Dispatcher", "Samir Khalil", "T-01", "Parking Task T-01 assigned to Samir", "Dispatch event record"],
  [0, "AUD-104", "13:57", "AUDIT", "VALET_SESSION_PARKED", "Samir Khalil", "Valet employee", null, "Zone A · Spot A-12", "Vehicle recorded parked at Zone A Spot A-12", "Audit event record"],
  [0, "DSP-107", "14:03", "DISPATCH", "ASSIGNED", "Dispatcher Adam", "Dispatcher", "Lina Odeh", "T-02", "Retrieval Task T-02 assigned to Lina; does not prove key possession", "Dispatch event record"],
  [0, "CUS-105", "14:06", "KEY", "CHECKED_OUT", "Samir Khalil", "Valet employee", null, "K-07", "Key checkout recorded; continuous holding unknown", "Custody event record"],
  [0, "CUS-106", "14:21", "KEY", "RETURNED_TO_SLOT", "Samir Khalil", "Valet employee", null, "K-07", "Return recorded; return alone does not free slot", "Custody event record"],
  [0, "CUS-106B", "14:22", "KEY", "SLOT_CLEARED", "Nora Haddad", "Reception", null, "K-07", "Explicit slot clear permits later reassignment", "Custody event record"],
  [0, "AUD-108", "15:04", "AUDIT", "VALET_SESSION_READY", "Lina Odeh", "Valet employee", null, null, "Vehicle READY recorded", "Audit event record"],
  [0, "AUD-109B", "15:09", "AUDIT", "VALET_SESSION_HANDOFF_PENDING", "Nora Haddad", "Reception", null, null, "Handoff pending recorded; no implied continuous state path", "Audit event record"],
  [0, "AUD-109", "15:10", "AUDIT", "HANDOFF_VERIFIED", "Nora Haddad", "Reception", null, null, "Verification result verified; no code displayed", "Verified outcome only; secret omitted"],
  [0, "AUD-110", "15:12", "AUDIT", "VALET_SESSION_COMPLETED", "Nora Haddad", "Reception", null, null, "Session completion recorded", "Audit event record"],
  [1, "AUD-201", "14:26", "AUDIT", "VALET_SESSION_CHECK_IN_COMPLETED", "Maya Saeed", "Reception", null, null, "Check-in completed; actor membership MEM-42", "Membership MEM-42; current directory label"],
  [1, "CUS-202", "14:30", "KEY", "SLOT_ASSIGNED", "Maya Saeed", "Reception", null, "K-07", "Assigned after Session 1021 SLOT_CLEARED at 14:22", "Custody event record"],
  [1, "DSP-203", "14:32", "DISPATCH", "ASSIGNED", "Dispatcher Adam", "Dispatcher", "Omar Nasser", "T-03", "Parking Task T-03 assigned to Omar", "Dispatch event record"],
  [1, "CUS-204", "14:35", "KEY", "CHECKED_OUT", "Omar Nasser", "Valet employee", null, "K-07", "Key checkout recorded", "Custody event record"],
  [1, "AUD-205", "14:42", "AUDIT", "VALET_SESSION_PARKED", "Omar Nasser", "Valet employee", null, "Zone A · Spot A-08", "Vehicle recorded parked at Zone A Spot A-08", "Audit event record"],
  [1, "CUS-206", "14:49", "KEY", "RETURNED_TO_SLOT", "Omar Nasser", "Valet employee", null, "K-07", "Return recorded; return alone does not free slot", "Custody event record"],
  [1, "CUS-206B", "14:50", "KEY", "SLOT_CLEARED", "Maya Saeed", "Reception", null, "K-07", "Explicit slot clear permits subsequent reassignment", "Custody event record"],
  [1, "AUD-207", "15:06", "AUDIT", "VALET_SESSION_RETRIEVAL_REQUESTED", null, null, null, null, "Retrieval requested; still open, no release or handoff", "Audit event only; no employee actor recorded"],
  [2, "AUD-301", "14:51", "AUDIT", "VALET_SESSION_CHECK_IN_COMPLETED", "Hadi Mansour", "Reception", null, null, "Check-in completed", "Audit event record"],
  [2, "CUS-302", "14:54", "KEY", "SLOT_ASSIGNED", "Hadi Mansour", "Reception", null, "K-07", "Reassigned after Session 1022 SLOT_CLEARED at 14:50", "Custody event record"],
  [2, "DSP-303", "14:56", "DISPATCH", "ASSIGNED", "Dispatcher Adam", "Dispatcher", "Rana Darwish", "T-04", "Task T-04 assigned; no acceptance evidence", "Dispatch event record"],
  [2, "INC-304", "14:58", "INCIDENT", "INCIDENT_REPORTED", "Salma Faris", "Incident reporter", null, null, "Reported type KEY_MISSING (not proven); severity HIGH; current status OPEN", "Description/photos unavailable or restricted; no resolution event"],
  [2, "DSP-305", "15:07", "DISPATCH", "REASSIGNED", "Karim Zaid", "Location manager", "Hadi Mansour", "T-04", "Task T-04 reassigned Rana Darwish → Hadi Mansour; no release", "Previous assignee Rana; new assignee Hadi; dispatch record"],
];

const identities = [
  {
    id: "VS-DEMO-1021",
    make: "Toyota",
    model: "Camry",
    plate: "DEM-214",
    state: "COMPLETED",
    slot: "K-07",
    currentSlot: null,
    incident: false,
    people: ["Nora Haddad", "Samir Khalil", "Lina Odeh"],
  },
  {
    id: "VS-DEMO-1022",
    make: "Hyundai",
    model: "Tucson",
    plate: "DEM-582",
    state: "OPEN",
    slot: "K-07",
    currentSlot: null,
    incident: false,
    people: ["Maya Saeed", "Omar Nasser"],
  },
  {
    id: "VS-DEMO-1023",
    make: "Kia",
    model: "Sportage",
    plate: null,
    state: "OPEN",
    slot: "K-07",
    currentSlot: "K-07",
    incident: true,
    people: ["Hadi Mansour", "Rana Darwish", "Salma Faris"],
  },
] as const;

export const demoSessions: readonly DemoSession[] = identities.map(
  (identity, sessionIndex) => ({
    ...identity,
    events: rows
      .filter((row) => row[0] === sessionIndex)
      .map(
        (row): DemoEvent => ({
          session: identity.id,
          id: row[1],
          time: row[2],
          source: row[3],
          type: row[4],
          actor: row[5],
          role: row[6],
          participant: row[7],
          resource: row[8],
          transition: row[9],
          evidence: row[10],
        }),
      ),
  }),
);

/**
 * AND across categories for one Session. Slot and employee evidence may
 * come from different records inside [start, end); never infer custody.
 */
export function matchDemoSessions(
  query: InvestigationDemoQuery,
): readonly DemoMatch[] {
  const location = query.location.trim().toLowerCase();
  if (
    location !== "north" ||
    query.date !== "2026-10-23" ||
    !query.start ||
    !query.end ||
    query.start >= query.end
  ) {
    return [];
  }
  const key = query.slot.trim().toUpperCase();
  const employee = query.employee.trim().toLowerCase();
  const make = query.make.trim().toLowerCase();
  const model = query.model.trim().toLowerCase();
  const plate = query.plate.trim().toUpperCase();
  const sessionId = query.sessionId.trim().toUpperCase();

  return demoSessions.flatMap((session) => {
    if (
      (make && !session.make.toLowerCase().includes(make)) ||
      (model && !session.model.toLowerCase().includes(model)) ||
      (plate && !(session.plate ?? "").toUpperCase().includes(plate)) ||
      (sessionId && session.id !== sessionId)
    ) {
      return [];
    }
    const windowEvents = session.events.filter(
      (event) => event.time >= query.start && event.time < query.end,
    );
    const keyEvents = windowEvents.filter(
      (event) =>
        event.source === "KEY" && event.resource?.toUpperCase() === key,
    );
    const employeeEvents = windowEvents.filter(
      (event) =>
        event.actor?.toLowerCase() === employee ||
        event.participant?.toLowerCase() === employee,
    );
    if ((key && keyEvents.length === 0) || (employee && employeeEvents.length === 0)) {
      return [];
    }
    const witnessIds = new Set(
      (key || employee ? [...keyEvents, ...employeeEvents] : windowEvents)
        .map((event) => event.id),
    );
    const ordered = windowEvents.filter((event) => witnessIds.has(event.id));
    if (ordered.length === 0) return [];

    return [{
      session,
      witnessIds: ordered.map((event) => event.id),
      count: ordered.length,
      first: ordered[0]!.time,
      last: ordered[ordered.length - 1]!.time,
    }];
  });
}
