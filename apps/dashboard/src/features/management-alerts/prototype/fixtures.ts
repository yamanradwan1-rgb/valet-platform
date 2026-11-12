import {
  SYNTHETIC_INCIDENT_TARGET_ID,
  type DemoRole,
  type Scenario,
  type SyntheticAlert,
} from "./types";
import { demoLocations, examples, future, type DemoLocation } from "./category-fixtures";

export { demoLocations } from "./category-fixtures";
export type { DemoLocation } from "./category-fixtures";

function exampleFor(category: string): SyntheticAlert {
  const example = examples.find((item) => item.category === category);
  if (!example) throw new Error(`Missing synthetic alert fixture for ${category}`);
  return example;
}

export const arrivalAlert: SyntheticAlert = {
  ...exampleFor("ALT-08"),
  id: "SIM-INC-LIVE",
  destination: {
    state: "unavailable",
    sourceId: "SIM-INC-LIVE",
    reason: "exact-target-unproven",
  },
  title: { en: "Critical incident needs attention", ar: "حادث حرج يحتاج متابعة" },
  description: {
    en: "A newly opened critical incident needs attention at the selected location.",
    ar: "حادث حرج تم فتحه حديثاً ويحتاج متابعة في الموقع المحدد.",
  },
};

export const organizationAlert: SyntheticAlert = {
  ...exampleFor("ALT-15"),
  id: "SIM-ORG-STAFF-41",
  location: null,
  destination: {
    state: "unavailable",
    sourceId: "SIM-ORG-STAFF-41",
    reason: "exact-target-unproven",
  },
  sourceSubtype: "LOCATION_ACCESS_REVOKED",
};

export const restrictedAlt17Alert: SyntheticAlert = {
  id: "SIM-ALT17-RESTRICTED",
  category: "ALT-17",
  kind: "ACTIVE",
  severity: "IMPORTANT",
  title: { en: "Dashboard access restricted", ar: "الوصول إلى لوحة الإدارة مقيّد" },
  description: {
    en: "This account has restricted Management Dashboard access.",
    ar: "الوصول إلى لوحة الإدارة مقيّد حاليًا لهذا الحساب.",
  },
  location: null,
  time: null,
  destination: {
    state: "unavailable",
    sourceId: "SIM-ALT17-RESTRICTED",
    reason: "exact-target-unproven",
  },
};

export const categoryCoverageFixtures = examples;

export const presenceExpiryAlert: SyntheticAlert = {
  ...exampleFor("ALT-12"),
  id: "SIM-PRESENCE-EXPIRY",
  expiresAt: future(24),
  destination: {
    state: "unavailable",
    sourceId: "SIM-PRESENCE-EXPIRY",
    reason: "exact-target-unproven",
  },
};

export const unavailableDestinationAlert: SyntheticAlert = {
  ...exampleFor("ALT-16"),
  id: "SIM-ALT16-NO-DESTINATION",
  destination: {
    state: "unavailable",
    sourceId: "SIM-ALT16-NO-DESTINATION",
    reason: "exact-target-unproven",
  },
  description: {
    en: "This alert has no verified safe exact-source destination in the prototype.",
    ar: "لا توجد وجهة آمنة ومثبتة لفتح السجل المحدد في هذه المعاينة.",
  },
};

export const missingDestinationAlert: SyntheticAlert = {
  ...exampleFor("ALT-08"),
  id: "SIM-INC-MISSING-1042",
  title: { en: "Synthetic target missing", ar: "الوجهة التجريبية غير موجودة" },
  description: {
    en: "A target ID is present in this fixture, but no matching synthetic preview record exists.",
    ar: "معرّف الوجهة موجود في هذه الحالة التجريبية، لكن لا يوجد سجل معاينة مطابق.",
  },
  destination: {
    state: "missing",
    sourceId: "SIM-INC-MISSING-1042",
    targetId: SYNTHETIC_INCIDENT_TARGET_ID,
    reason: "synthetic-target-missing",
  },
};

export const unauthorizedDestinationAlert: SyntheticAlert = {
  ...exampleFor("ALT-08"),
  id: "SIM-INC-UNAUTHORIZED-1042",
  title: { en: "Synthetic target access denied", ar: "تم رفض الوصول للوجهة التجريبية" },
  description: {
    en: "This fixture simulates a denied synthetic target preview; no production authorization is checked.",
    ar: "تحاكي هذه الحالة رفض الوصول إلى معاينة تجريبية؛ ولا يتم فحص صلاحيات الإنتاج.",
  },
  destination: {
    state: "unauthorized",
    sourceId: "SIM-INC-UNAUTHORIZED-1042",
    targetId: SYNTHETIC_INCIDENT_TARGET_ID,
    reason: "synthetic-target-unauthorized",
  },
};

export function arrivalAlertForLocation(location: DemoLocation): SyntheticAlert {
  const selected = demoLocations[location];
  return {
    ...arrivalAlert,
    location: selected,
    description: {
      en: `A newly opened critical incident needs attention at ${selected.en}.`,
      ar: `حادث حرج تم فتحه حديثاً ويحتاج متابعة في ${selected.ar}.`,
    },
  };
}

export const thresholdAlert: SyntheticAlert = {
  ...exampleFor("ALT-01"),
  id: "SIM-RET-TIMER",
  title: { en: "Retrieval SLA exceeded", ar: "تجاوز مدة استرجاع المركبة" },
  destination: {
    state: "unavailable",
    sourceId: "SIM-RET-TIMER",
    reason: "exact-target-unproven",
  },
};

export function initialAlerts(scenario: Scenario): SyntheticAlert[] {
  switch (scenario) {
    case "empty": return [];
    case "one": return [exampleFor("ALT-08")];
    case "multiple": return examples.slice(0, 6);
    case "destination-unavailable": return [
      unavailableDestinationAlert,
      missingDestinationAlert,
      unauthorizedDestinationAlert,
    ];
    case "overflow": return Array.from({ length: 26 }, (_, index) => {
      // ALT-15 is Company Admin-only and cannot be duplicated as a Location case.
      const locationCases = examples.filter((item) => item.category !== "ALT-15");
      const sample = locationCases[index % locationCases.length];
      if (!sample) throw new Error("Missing synthetic overflow fixture");
      const id = `SIM-${sample.id.replace(/^SIM-/, "")}-${index + 1}` as const;
      return {
        ...sample,
        id,
        destination: {
          state: "unavailable",
          sourceId: id,
          reason: "exact-target-unproven",
        },
      };
    });
    case "loading":
    case "slow":
    case "failure":
    case "unavailable": return examples.slice(0, 3);
  }
}

export function scopedAlerts(scenario: Scenario, location: DemoLocation): SyntheticAlert[] {
  return initialAlerts(scenario).map((alert) => ({
    ...alert,
    id: `SIM-${location.toUpperCase()}-${alert.id.replace(/^SIM-/, "")}`,
    location: alert.location === null ? null : demoLocations[location],
  }));
}

export function roleScopedAlerts(
  locationAlerts: SyntheticAlert[],
  organizationEvents: SyntheticAlert[],
  role: DemoRole,
): SyntheticAlert[] {
  if (role === "unauthorized") return [];
  const safeLocationAlerts = locationAlerts.filter((item) =>
    item.category !== "ALT-14" && item.category !== "ALT-15" && item.category !== "ALT-17" &&
    !(role === "location-manager" && item.category === "ALT-05"),
  );
  return role === "company-admin"
    ? [
      ...safeLocationAlerts,
      ...organizationEvents.filter((item) =>
        item.category === "ALT-15" && item.kind === "OCCURRENCE" && item.location === null),
    ]
    : safeLocationAlerts;
}

export function filterAttention(
  items: SyntheticAlert[],
  seen: Set<string>,
  now = Date.now(),
): SyntheticAlert[] {
  const occurrenceWindowMs = 7 * 24 * 60 * 60 * 1000;
  return items.filter((item) => {
    if (item.category === "ALT-14" || item.category === "ALT-17") return false;
    if (item.kind === "ACTIVE") {
      if (item.category !== "ALT-12" || item.expiresAt == null) return true;
      const expiry = Date.parse(item.expiresAt);
      return Number.isFinite(expiry) && expiry > now;
    }
    if (seen.has(item.id) || item.time === null) return false;
    const occurredAt = Date.parse(item.time);
    const age = now - occurredAt;
    return Number.isFinite(occurredAt) && age >= 0 && age < occurrenceWindowMs;
  });
}

export function sortAlerts(items: SyntheticAlert[]) {
  return [...items].sort((left, right) => {
    if (left.severity !== right.severity) return left.severity === "CRITICAL" ? -1 : 1;
    const leftTime = left.time ? Date.parse(left.time) : 0;
    const rightTime = right.time ? Date.parse(right.time) : 0;
    return rightTime - leftTime;
  });
}
