import type { DashboardSessionState } from "@valet/contracts";

/**
 * Typed translation dictionary for the Management Dashboard.
 *
 * Keys are grouped by surface. The English dictionary is the source shape;
 * the Arabic dictionary must implement exactly the same keys, which is
 * enforced at compile time by `Record<TranslationKey, string>`.
 *
 * Only user-visible foundation strings live here. Page-specific copy is added
 * by each later integration task alongside its page.
 */
export interface TranslationDictionary {
  // Shell
  "shell.appName": string;
  "shell.navOperations": string;
  "shell.navMaps": string;
  "shell.navFinancial": string;
  "shell.navConfiguration": string;
  "shell.navOverview": string;
  "shell.navLiveOperations": string;
  "shell.navSessions": string;
  "shell.navRetrievalQueue": string;
  "shell.navTasks": string;
  "shell.navActiveShifts": string;
  "shell.navKeys": string;
  "shell.navIncidents": string;
  "shell.navMapsZones": string;
  "shell.navFinancialOverview": string;
  "shell.navAnalytics": string;
  "shell.navReports": string;
  "shell.navLocationSettings": string;
  "shell.navBranding": string;
  "shell.navSubscription": string;
  "shell.openNavigation": string;
  "shell.closeNavigation": string;
  "shell.expandSidebar": string;
  "shell.collapseSidebar": string;
  "shell.managementNavigation": string;
  "shell.switchToArabic": string;
  "shell.switchToEnglish": string;
  "shell.switchToLightTheme": string;
  "shell.switchToDarkTheme": string;
  "shell.signOut": string;
  "shell.noLocationConfigured": string;

  // Session restore / loading
  "session.restoring": string;

  // Sign in
  "signIn.title": string;
  "signIn.subtitle": string;
  "signIn.email": string;
  "signIn.password": string;
  "signIn.action": string;
  "signIn.inProgress": string;
  "signIn.emailRequired": string;
  "signIn.passwordRequired": string;
  "signIn.invalidCredentials": string;
  "signIn.rateLimited": string;
  "signIn.originNotAllowed": string;
  "signIn.networkError": string;
  "signIn.genericError": string;
  "signIn.showPassword": string;
  "signIn.hidePassword": string;

  // Session expired
  "expired.title": string;
  "expired.subtitle": string;
  "expired.action": string;

  // No access
  "noAccess.title": string;
  "noAccess.subtitle": string;
  "noAccess.action": string;

  // Foundation placeholders
  "placeholder.foundationNote": string;
  "placeholder.emptyState": string;
  "placeholder.locationMissingNote": string;

  // Overview
  "page.overview.title": string;
  "page.overview.description": string;

  // Live operations
  "page.liveOperations.title": string;
  "page.liveOperations.description": string;
  "map.smokeTitle": string;
  "map.loading": string;
  "map.failed": string;

  // Sessions
  "page.sessions.title": string;
  "page.sessions.description": string;

  // Retrieval queue
  "page.retrievalQueue.title": string;
  "page.retrievalQueue.description": string;

  // Tasks
  "page.tasks.title": string;
  "page.tasks.description": string;

  // Active shifts
  "page.activeShifts.title": string;
  "page.activeShifts.description": string;

  // Keys
  "page.keys.title": string;
  "page.keys.description": string;

  // Incidents
  "page.incidents.title": string;
  "page.incidents.description": string;

  // Maps & zones
  "page.mapsZones.title": string;
  "page.mapsZones.description": string;

  // Financial
  "page.financial.title": string;
  "page.financial.description": string;

  // Analytics
  "page.analytics.title": string;
  "page.analytics.description": string;

  // Reports
  "page.reports.title": string;
  "page.reports.description": string;

  // Location settings
  "page.locationSettings.title": string;
  "page.locationSettings.description": string;

  // Branding
  "page.branding.title": string;
  "page.branding.description": string;

  // Subscription
  "page.subscription.title": string;
  "page.subscription.description": string;

  // Enum labels: session states (all nine accepted backend states)
  "enum.session.CHECKING_IN": string;
  "enum.session.AWAITING_PARKING": string;
  "enum.session.PARKING": string;
  "enum.session.PARKED": string;
  "enum.session.REQUESTED": string;
  "enum.session.RETRIEVING": string;
  "enum.session.READY": string;
  "enum.session.HANDOFF_PENDING": string;
  "enum.session.COMPLETED": string;

  // Enum labels: task statuses and types
  "enum.task.QUEUED": string;
  "enum.task.ASSIGNED": string;
  "enum.task.ACCEPTED": string;
  "enum.task.IN_PROGRESS": string;
  "enum.task.COMPLETED": string;
  "enum.task.CANCELLED": string;
  "enum.taskType.PARKING": string;
  "enum.taskType.RETRIEVAL": string;

  // Enum labels: retrieval requests
  "enum.retrieval.OPEN": string;
  "enum.retrieval.ACCEPTED": string;
  "enum.requester.CUSTOMER": string;
  "enum.requester.STAFF": string;

  // Enum labels: incidents
  "enum.incident.OPEN": string;
  "enum.incident.INVESTIGATING": string;
  "enum.incident.RESOLVED": string;
  "enum.incident.CLOSED": string;
  "enum.severity.LOW": string;
  "enum.severity.MEDIUM": string;
  "enum.severity.HIGH": string;
  "enum.severity.CRITICAL": string;

  // Enum labels: payment status and collection methods
  "enum.payment.NOT_REQUIRED": string;
  "enum.payment.UNPAID": string;
  "enum.payment.PENDING": string;
  "enum.payment.PAID": string;
  "enum.payment.FAILED": string;
  "enum.collection.NONE": string;
  "enum.collection.CASH": string;
  "enum.collection.DIGITAL": string;

  // Enum labels: key slots and tracking freshness
  "enum.keySlot.ACTIVE": string;
  "enum.keySlot.INACTIVE": string;
  "enum.freshness.LIVE": string;
  "enum.freshness.STALE": string;
}

export type TranslationKey = keyof TranslationDictionary;

export type { DashboardSessionState };
