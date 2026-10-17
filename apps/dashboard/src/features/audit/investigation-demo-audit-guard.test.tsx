import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { auditCopy } from "./audit-copy";
import { AuditFilters } from "./audit-filters";
import { auditScope, auditScopeKey } from "./audit-scope";

const locale = vi.hoisted(() => ({ current: "en" as "en" | "ar" }));

vi.mock("../../lib/i18n/locale-provider", () => ({
  useDashboardLocale: () => ({ locale: locale.current }),
}));

vi.mock("../help/scoped-context-help", () => ({
  ScopedContextHelp: () => <button aria-label="Audit help" type="button" />,
}));

function filters(showEventType: boolean, language: "en" | "ar") {
  locale.current = language;
  return renderToStaticMarkup(
    <AuditFilters
      eventType={null}
      onEventType={() => {}}
      showEventType={showEventType}
      t={auditCopy(language)}
    />,
  );
}

type SelectedScope = Parameters<typeof auditScope>[0];

function locationManager(organizationId: string, locationId: string): SelectedScope {
  return {
    authority: "LOCATION_MANAGER",
    organization: { organizationId },
    location: { locationId },
  } as SelectedScope;
}

function scopeKey(selectedScope: SelectedScope, selectionRevision = 0) {
  return auditScopeKey({
    identityGeneration: 4,
    sessionGeneration: 8,
    selectionRevision,
    selectedScope,
  });
}

describe("Issue #300 Audit Events regression gates", () => {
  it.each(["en", "ar"] as const)(
    "preserves Supervisor's restricted filter surface in %s",
    (language) => {
      const html = filters(false, language);
      expect(html).not.toContain("<select");
      expect(html).toContain(auditCopy(language).locationScope);
      expect(html).toContain('aria-label="Audit help"');
    },
  );

  it.each(["en", "ar"] as const)(
    "retains the authorized management event-type field in %s",
    (language) => {
      const html = filters(true, language);
      expect(html).toContain("<select");
      expect(html).toContain(auditCopy(language).eventType);
      expect(html).toContain(auditCopy(language).allEventTypes);
    },
  );

  it("isolates Audit state across location, tenant and selection revision changes", () => {
    const first = locationManager("tenant-a", "location-1");
    const secondLocation = locationManager("tenant-a", "location-2");
    const otherTenant = locationManager("tenant-b", "location-1");

    expect(auditScope(first)).toMatchObject({
      role: "LOCATION_MANAGER",
      kind: "LOCATION",
      organizationId: "tenant-a",
      locationId: "location-1",
    });
    expect(scopeKey(first)).not.toBe(scopeKey(secondLocation));
    expect(scopeKey(first)).not.toBe(scopeKey(otherTenant));
    expect(scopeKey(first)).not.toBe(scopeKey(first, 1));
  });

  it("does not promote subscription-only authority into Audit read access", () => {
    const subscriptionOnly = {
      authority: "COMPANY_ADMIN_SUBSCRIPTION",
      organization: { organizationId: "tenant-a" },
    } as SelectedScope;

    expect(auditScope(subscriptionOnly)).toBeNull();
    expect(scopeKey(subscriptionOnly)).toContain(":denied:");
  });
});
