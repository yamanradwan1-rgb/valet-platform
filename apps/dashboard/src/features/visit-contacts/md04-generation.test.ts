import { describe, expect, it } from "vitest";

import type { SelectedDashboardScope } from "../../components/scope";
import { ScopeGenerationGuard } from "../../lib/scope/scope-generation";
import { auditRequestKey } from "../audit/audit-query-identity";
import { auditScopeKey } from "../audit/audit-scope";
import {
  normalizeVisitSearchIdentity,
  visitContactSearchRequestKey,
} from "./visit-contact-query-identity";
import { visitHistoryRequestKey } from "./visit-history-query-identity";
import { visitContactScopeKey } from "./visit-contact-scope";

const organization = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  name: "Org",
  timezone: "Asia/Amman",
};
const company: SelectedDashboardScope = {
  authority: "COMPANY_ADMIN",
  context: {
    capabilities: [],
    organization,
    scope: { kind: "ALL_LOCATIONS" },
    selectedLocation: null,
  },
};
const base = {
  identityGeneration: 3,
  selectedScope: company,
  selectionRevision: 7,
  sessionGeneration: 5,
};

describe("MD-04 complete query generations", () => {
  it("changes Visit Contact keys for identity/session/scope/query/cursor dimensions", () => {
    const scope = visitContactScopeKey(base);
    const query = normalizeVisitSearchIdentity("NAME", {
      name: "Alice", phone: "", plate: "", plateCountry: "",
    });
    const first = visitContactSearchRequestKey({
      cursor: null, queryIdentity: query, revision: 0, scopeKey: scope,
    });
    expect(first).not.toBe(visitContactSearchRequestKey({
      cursor: "abcdefgh", queryIdentity: query, revision: 0, scopeKey: scope,
    }));
    expect(first).not.toBe(visitContactSearchRequestKey({
      cursor: null, queryIdentity: "PHONE:079", revision: 0, scopeKey: scope,
    }));
    expect(scope).not.toBe(visitContactScopeKey({ ...base, identityGeneration: 4 }));
    expect(scope).not.toBe(visitContactScopeKey({ ...base, sessionGeneration: 6 }));
    expect(scope).not.toBe(visitContactScopeKey({ ...base, selectionRevision: 8 }));
  });

  it("changes history keys for customer/vehicle subject and cursor", () => {
    const scopeKey = visitContactScopeKey(base);
    const customer = visitHistoryRequestKey({
      cursor: null,
      revision: 0,
      scopeKey,
      subject: { kind: "CUSTOMER", id: "customer-a" },
    });
    expect(customer).not.toBe(visitHistoryRequestKey({
      cursor: null,
      revision: 0,
      scopeKey,
      subject: { kind: "VEHICLE", id: "vehicle-a" },
    }));
    expect(customer).not.toBe(visitHistoryRequestKey({
      cursor: "abcdefgh",
      revision: 0,
      scopeKey,
      subject: { kind: "CUSTOMER", id: "customer-a" },
    }));
  });

  it("changes Audit keys for scope, filter, cursor, session and identity", () => {
    const scope = auditScopeKey(base);
    const first = auditRequestKey({
      cursor: null, eventType: null, revision: 0, scopeKey: scope,
    });
    expect(first).not.toBe(auditRequestKey({
      cursor: null, eventType: "SHIFT_STARTED", revision: 0, scopeKey: scope,
    }));
    expect(first).not.toBe(auditRequestKey({
      cursor: "abcdefgh", eventType: null, revision: 0, scopeKey: scope,
    }));
    expect(scope).not.toBe(auditScopeKey({ ...base, identityGeneration: 4 }));
    expect(scope).not.toBe(auditScopeKey({ ...base, sessionGeneration: 6 }));
    expect(scope).not.toBe(auditScopeKey({ ...base, selectionRevision: 8 }));
  });

  it.each(["Visit Contacts", "Audit"])(
    "%s rejects stale success and stale failure generations",
    () => {
      const guard = new ScopeGenerationGuard();
      const old = guard.begin();
      const current = guard.begin();
      expect(old.signal.aborted).toBe(true);
      expect(guard.accept(old, "late-success")).toBeUndefined();
      expect(guard.isCurrent(old)).toBe(false);
      expect(guard.accept(current, "current-success")).toBe("current-success");
      guard.invalidate();
      expect(guard.isCurrent(current)).toBe(false);
    },
  );

  it("does not resurrect an old A request after mode A to B to A", () => {
    const guard = new ScopeGenerationGuard();
    const oldA = guard.begin();
    const modeB = guard.begin();
    const newA = guard.begin();
    expect(guard.accept(oldA, "old-a-rows")).toBeUndefined();
    expect(guard.accept(modeB, "mode-b-rows")).toBeUndefined();
    expect(guard.accept(newA, "new-a-rows")).toBe("new-a-rows");
  });

  it("rejects an old customer-history response after switching to vehicle history", () => {
    const guard = new ScopeGenerationGuard();
    const customer = guard.begin();
    const vehicle = guard.begin();
    expect(guard.accept(customer, "customer-history")).toBeUndefined();
    expect(guard.accept(vehicle, "vehicle-history")).toBe("vehicle-history");
  });

  it("rejects the first Organization Audit response after Organization to Location to Organization", () => {
    const guard = new ScopeGenerationGuard();
    const firstOrganization = guard.begin();
    const location = guard.begin();
    const secondOrganization = guard.begin();
    expect(guard.accept(firstOrganization, "old-org")).toBeUndefined();
    expect(guard.accept(location, "location")).toBeUndefined();
    expect(guard.accept(secondOrganization, "new-org")).toBe("new-org");
  });

  it("rejects an old Audit filter response after filter A to B", () => {
    const guard = new ScopeGenerationGuard();
    const filterA = guard.begin();
    const filterB = guard.begin();
    expect(guard.accept(filterA, "filter-a")).toBeUndefined();
    expect(guard.accept(filterB, "filter-b")).toBe("filter-b");
  });
});
