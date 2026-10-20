import { describe, expect, it } from "vitest";
import { auditInvestigationCoverageSchema } from "./audit-investigation-common.js";

/** Independent R2 §7.1 oracle: constructed from writer/schema facts, not SQL. */
type Source = "AUDIT" | "KEY_CUSTODY" | "DISPATCH" | "INCIDENT";
type Relation =
  | "DIRECT"
  | "PARENT"
  | "LEGACY_INDIRECT"
  | "CONFLICT"
  | "ORPHAN"
  | "VEHICLE_ONLY"
  | "UNKNOWN_DIRECT"
  | "FOREIGN";
type Quality = "RECORDED" | "PARTIAL" | "UNVERIFIABLE";
type Fact = {
  source: Source;
  id: string;
  minute: number;
  relation: Relation;
  bornAt: 0 | 1;
  session?: string;
  parentBornAt?: 0 | 1;
  independentAnchor?: boolean;
  eventTimeProof?: boolean;
  legacy?: boolean;
};
const A = "018f1234-5678-4abc-9234-56789abcdef0";
const B = "018f1234-5678-4abc-9234-56789abcdef1";
const uuid = (n: number) =>
  `018f1234-5678-4abc-9234-${n.toString(16).padStart(12, "0")}`;
const key = (f: Fact) => `${f.source}:${f.id}`;
const fact = (
  source: Source,
  n: number,
  minute: number,
  relation: Relation,
  overrides: Partial<Fact> = {},
): Fact => ({
  source,
  id: uuid(n),
  minute,
  relation,
  bornAt: 0,
  ...overrides,
});

/** Rows are explicitly independent; source-qualified IDs are test identities. */
export const issue300ClosureFacts: readonly Fact[] = [
  fact("KEY_CUSTODY", 1, 0, "DIRECT", { session: A }),
  fact("DISPATCH", 2, 20, "DIRECT", { session: A }),
  fact("AUDIT", 3, 30, "PARENT", {
    session: A,
    parentBornAt: 0,
    independentAnchor: true,
    eventTimeProof: true,
  }),
  fact("INCIDENT", 4, 30, "DIRECT", { session: A }),
  fact("AUDIT", 5, 31, "PARENT", {
    session: A,
    parentBornAt: 1,
    independentAnchor: true,
  }),
  fact("AUDIT", 6, 32, "LEGACY_INDIRECT"),
  fact("AUDIT", 7, 33, "CONFLICT"),
  fact("AUDIT", 8, 34, "UNKNOWN_DIRECT", { session: A }),
  fact("AUDIT", 11, 37, "ORPHAN"),
  fact("AUDIT", 12, 38, "DIRECT", { session: B, legacy: true }),
  fact("DISPATCH", 13, 39, "DIRECT", { session: A, bornAt: 1 }),
];

type Decision = {
  session: string | null;
  quality: Quality | null;
  locationIntegrity: boolean;
};
const absent = (locationIntegrity = false): Decision => ({
  session: null,
  quality: null,
  locationIntegrity,
});

export function issue300ExpectedAssociation(
  item: Fact,
  snapshot: 0 | 1,
  cutoverAttested = true,
): Decision {
  if (item.bornAt > snapshot || item.relation === "FOREIGN") return absent();
  if (item.legacy && !cutoverAttested) return absent();
  if (["CONFLICT", "ORPHAN", "LEGACY_INDIRECT"].includes(item.relation)) {
    return absent(true); // Scope-only generic flag, no guessed Session.
  }
  if (item.relation === "VEHICLE_ONLY") return absent();
  if (item.relation === "PARENT") {
    if (item.parentBornAt === undefined || item.parentBornAt > snapshot)
      return absent(); // Late parent is not itself an anomaly at S0.
    if (!item.independentAnchor) return absent(true);
  }
  const quality: Quality =
    item.relation === "UNKNOWN_DIRECT"
      ? "UNVERIFIABLE"
      : item.legacy || (item.relation === "PARENT" && !item.eventTimeProof)
        ? "PARTIAL"
        : "RECORDED";
  return { session: item.session ?? null, quality, locationIntegrity: false };
}

const rank: Record<Source, number> = {
  AUDIT: 0,
  KEY_CUSTODY: 1,
  DISPATCH: 2,
  INCIDENT: 3,
};
export function issue300ExpectedHistory(
  facts: readonly Fact[],
  snapshot: 0 | 1,
  session: string,
) {
  const unique = new Map<string, Fact>();
  for (const item of facts) {
    if (issue300ExpectedAssociation(item, snapshot).session === session)
      unique.set(key(item), item);
  }
  return [...unique.values()].sort(
    (a, b) =>
      a.minute - b.minute ||
      rank[a.source] - rank[b.source] ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

/** Coverage reflects a safe source health signal, never rejected IDs/counts. */
export function issue300ExpectedCoverage(
  facts: readonly Fact[],
  snapshot: 0 | 1,
  from: number,
  to: number,
) {
  const flagged = facts.some(
    (item) =>
      item.minute >= from &&
      item.minute < to &&
      issue300ExpectedAssociation(item, snapshot).locationIntegrity,
  );
  return auditInvestigationCoverageSchema.parse({
    AUDIT: flagged
      ? { status: "PARTIAL", reason: "INTEGRITY_ANOMALY" }
      : { status: "AVAILABLE" },
    KEY_CUSTODY: { status: "AVAILABLE" },
    DISPATCH: { status: "AVAILABLE" },
    INCIDENT: { status: "AVAILABLE" },
  });
}

/** U-003: no whole-cohort revision proof means explicit 503 and fresh Apply. */
export function issue300ExpectedPaging(more: boolean, mutableFilter: boolean) {
  if (more && mutableFilter)
    return { exhausted: false, refuse503: true, action: "EXPLICIT_APPLY" };
  return {
    exhausted: !more,
    refuse503: false,
    action: more ? "EXPLICIT_NEXT" : "NONE",
  };
}

/** Actual PARKED writer uses VALET_SESSION entity with Task metadata. */
export function issue300ExpectedParkedLink(
  claim: {
    entity: "VALET_SESSION" | "Task" | "UNKNOWN";
    entityId: string;
    session: string;
    task: {
      id: string;
      session: string;
      type: "PARKING" | "RETRIEVAL";
      bornAt: 0 | 1;
    };
    metadataTaskId?: string | null;
  },
  snapshot: 0 | 1,
) {
  if (
    claim.entity === "UNKNOWN" ||
    claim.task.bornAt > snapshot ||
    claim.task.session !== claim.session ||
    claim.task.type !== "PARKING"
  )
    return false;
  if (claim.entity === "VALET_SESSION" && claim.entityId !== claim.session)
    return false;
  if (claim.entity === "Task" && claim.entityId !== claim.task.id) return false;
  return !("metadataTaskId" in claim) || claim.metadataTaskId === claim.task.id;
}

describe("Issue300 R2 independent confidence, coverage and paging", () => {
  it("separates admission/confidence, legacy cutover and old S0/new S1", () => {
    const kinds = issue300ClosureFacts.map(
      (f) => issue300ExpectedAssociation(f, 0).quality,
    );
    expect(kinds.slice(0, 5)).toEqual([
      "RECORDED",
      "RECORDED",
      "RECORDED",
      "RECORDED",
      null,
    ]);
    expect(kinds.includes("UNVERIFIABLE")).toBe(true);
    expect(
      issue300ExpectedAssociation(issue300ClosureFacts[4]!, 1).quality,
    ).toBe("PARTIAL");
    expect(
      issue300ExpectedAssociation(issue300ClosureFacts[10]!, 0, false).session,
    ).toBe(null);
    expect(
      issue300ExpectedAssociation(
        { ...issue300ClosureFacts[4]!, independentAnchor: false },
        1,
      ).session,
    ).toBe(null);
    expect(
      issue300ExpectedAssociation(fact("AUDIT", 21, 35, "VEHICLE_ONLY"), 0)
        .session,
    ).toBe(null);
    expect(
      issue300ExpectedAssociation(
        fact("AUDIT", 22, 35, "FOREIGN", { session: A }),
        0,
      ).session,
    ).toBe(null);
  });

  it("orders four sources at ties and deduplicates (source,id), not id", () => {
    const tied = issue300ClosureFacts
      .slice(0, 4)
      .map((f) => ({ ...f, id: uuid(40), minute: 30 }));
    const result = issue300ExpectedHistory([...tied, tied[0]!], 0, A);
    expect(result.map((f) => f.source)).toEqual([
      "AUDIT",
      "KEY_CUSTODY",
      "DISPATCH",
      "INCIDENT",
    ]);
    expect(new Set(result.map(key)).size).toBe(4);
    expect(result.slice(0, 2).concat(result.slice(2)).map(key)).toEqual(
      result.map(key),
    );
  });

  it("does not equate source coverage with exhausted/unsafe continuation", () => {
    expect(
      issue300ExpectedCoverage(issue300ClosureFacts, 0, 0, 40).AUDIT,
    ).toEqual({ status: "PARTIAL", reason: "INTEGRITY_ANOMALY" });
    expect(
      issue300ExpectedCoverage(issue300ClosureFacts, 0, 0, 30).AUDIT,
    ).toEqual({ status: "AVAILABLE" });
    expect(issue300ExpectedPaging(true, true)).toEqual({
      exhausted: false,
      refuse503: true,
      action: "EXPLICIT_APPLY",
    });
    expect(issue300ExpectedPaging(true, false).exhausted).toBe(false);
    expect(issue300ExpectedPaging(false, false).exhausted).toBe(true);
  });

  it("accepts canonical PARKED and denies wrong Task, null and late parent", () => {
    const real = {
      entity: "VALET_SESSION" as const,
      entityId: A,
      session: A,
      task: {
        id: uuid(90),
        session: A,
        type: "PARKING" as const,
        bornAt: 0 as const,
      },
      metadataTaskId: uuid(90),
    };
    expect(issue300ExpectedParkedLink(real, 0)).toBe(true);
    expect(
      issue300ExpectedParkedLink(
        { ...real, entity: "Task", entityId: uuid(90) },
        0,
      ),
    ).toBe(true);
    const invalid = [
      { metadataTaskId: uuid(91) },
      { metadataTaskId: null },
      { entity: "UNKNOWN" as const },
      { task: { ...real.task, bornAt: 1 as const } },
    ];
    for (const changed of invalid) {
      expect(issue300ExpectedParkedLink({ ...real, ...changed }, 0)).toBe(
        false,
      );
    }
  });
});
