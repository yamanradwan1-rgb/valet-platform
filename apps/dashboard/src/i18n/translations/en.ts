import type { TranslationDictionary } from "./types";

export const enTranslations: TranslationDictionary = {
  // Shell
  "shell.appName": "VAYLET",
  "shell.navOperations": "Operations",
  "shell.navMaps": "Maps",
  "shell.navFinancial": "Financial & Insights",
  "shell.navConfiguration": "Configuration",
  "shell.navOverview": "Overview",
  "shell.navLiveOperations": "Live Operations",
  "shell.navSessions": "Vehicles in Service",
  "shell.navRetrievalQueue": "Vehicle Retrieval Queue",
  "shell.navTasks": "Tasks",
  "shell.navActiveShifts": "Active Shifts",
  "shell.navKeys": "Key Custody Board",
  "shell.navIncidents": "Incidents",
  "shell.navMapsZones": "Map Setup",
  "shell.navFinancialOverview": "Financial Overview",
  "shell.navAnalytics": "Analytics",
  "shell.navReports": "Reports",
  "shell.navLocationSettings": "Location Settings",
  "shell.navBranding": "Branding",
  "shell.navSubscription": "Subscription",
  "shell.openNavigation": "Open navigation",
  "shell.closeNavigation": "Close navigation",
  "shell.expandSidebar": "Expand sidebar",
  "shell.collapseSidebar": "Collapse sidebar",
  "shell.managementNavigation": "Management navigation",
  "shell.switchToArabic": "Switch to Arabic",
  "shell.switchToEnglish": "Switch to English",
  "shell.switchToLightTheme": "Switch to light theme",
  "shell.switchToDarkTheme": "Switch to dark theme",
  "shell.signOut": "Sign out",
  "shell.noLocationConfigured": "No location configured",

  // Session restore / loading
  "session.restoring": "Restoring your session…",

  // Sign in
  "signIn.title": "Management Dashboard",
  "signIn.subtitle": "Sign in with your staff account.",
  "signIn.email": "Email",
  "signIn.password": "Password",
  "signIn.action": "Sign in",
  "signIn.inProgress": "Signing in…",
  "signIn.emailRequired": "Email is required.",
  "signIn.passwordRequired": "Password is required.",
  "signIn.invalidCredentials": "Invalid email or password.",
  "signIn.rateLimited": "Too many attempts. Try again later.",
  "signIn.originNotAllowed": "Sign-in is not allowed from this origin.",
  "signIn.networkError":
    "Network connection unavailable. Check your connection and try again.",
  "signIn.genericError": "Unable to sign in. Please try again.",
  "signIn.showPassword": "Show password",
  "signIn.hidePassword": "Hide password",

  // Session expired
  "expired.title": "Your session has expired",
  "expired.subtitle": "Please sign in again to continue.",
  "expired.action": "Sign in again",

  // No access
  "noAccess.title": "Access not available",
  "noAccess.subtitle":
    "You don't have access to this area. Please contact your administrator.",
  "noAccess.action": "Sign out",

  // Foundation placeholders
  "placeholder.foundationNote":
    "This surface is part of the dashboard foundation. Backend data wiring arrives in a later integration task.",
  "placeholder.emptyState": "No data is wired yet for this surface.",
  "placeholder.locationMissingNote":
    "No development location is configured. Set NEXT_PUBLIC_DEV_LOCATION_ID for local development; real location bootstrap awaits a backend enumeration endpoint.",

  // Overview
  "page.overview.title": "Overview",
  "page.overview.description":
    "Live management summary for the selected location.",

  // Live operations
  "page.liveOperations.title": "Live Operations",
  "page.liveOperations.description":
    "Task-scoped live vehicle positions during Parking or Retrieval tasks.",
  "map.smokeTitle": "Map preview",
  "map.loading": "Loading map…",
  "map.failed": "The map could not be loaded.",

  // Sessions
  "page.sessions.title": "Vehicles in Service",
  "page.sessions.description":
    "Each current service session, vehicle reference, status, parking spot, key slot and current assignee when available.",

  // Retrieval queue
  "page.retrievalQueue.title": "Vehicle Retrieval Queue",
  "page.retrievalQueue.description": "Current retrieval requests snapshot.",

  // Tasks
  "page.tasks.title": "Tasks",
  "page.tasks.description": "Current parking and retrieval tasks.",

  // Active shifts
  "page.activeShifts.title": "Active Shifts",
  "page.activeShifts.description": "Current active shifts at this location.",

  // Keys
  "page.keys.title": "Key Custody Board",
  "page.keys.description": "Key-slot status and linked service sessions.",

  // Incidents
  "page.incidents.title": "Incidents",
  "page.incidents.description": "Read-only incident overview.",

  // Maps & zones
  "page.mapsZones.title": "Map Setup",
  "page.mapsZones.description":
    "Map points and polygon areas for this location.",

  // Financial
  "page.financial.title": "Financial Overview",
  "page.financial.description":
    "Currency-grouped payment aggregates; currencies are never combined.",

  // Analytics
  "page.analytics.title": "Analytics",
  "page.analytics.description":
    "Accepted operational, financial, incident and queue metrics.",

  // Reports
  "page.reports.title": "Reports",
  "page.reports.description":
    "Daily, weekly and monthly reports with CSV/PDF export.",

  // Location settings
  "page.locationSettings.title": "Location Settings",
  "page.locationSettings.description":
    "Company defaults with location-specific overrides.",

  // Branding
  "page.branding.title": "Branding",
  "page.branding.description": "Display name and primary color.",

  // Subscription
  "page.subscription.title": "Subscription",
  "page.subscription.description": "Read-only plan, status and entitlements.",

  // Enum labels: session states
  "enum.session.CHECKING_IN": "Checking in",
  "enum.session.AWAITING_PARKING": "Awaiting parking",
  "enum.session.PARKING": "Parking",
  "enum.session.PARKED": "Parked",
  "enum.session.REQUESTED": "Retrieval requested",
  "enum.session.RETRIEVING": "Retrieving vehicle",
  "enum.session.READY": "Ready for pickup",
  "enum.session.HANDOFF_PENDING": "Awaiting handoff",
  "enum.session.COMPLETED": "Completed",

  // Enum labels: task statuses and types
  "enum.task.QUEUED": "Queued",
  "enum.task.ASSIGNED": "Assigned",
  "enum.task.ACCEPTED": "Accepted",
  "enum.task.IN_PROGRESS": "In progress",
  "enum.task.COMPLETED": "Completed",
  "enum.task.CANCELLED": "Cancelled",
  "enum.taskType.PARKING": "Parking task",
  "enum.taskType.RETRIEVAL": "Vehicle retrieval task",

  // Enum labels: retrieval requests
  "enum.retrieval.OPEN": "Open",
  "enum.retrieval.ACCEPTED": "Accepted",
  "enum.requester.CUSTOMER": "Customer",
  "enum.requester.STAFF": "Staff",

  // Enum labels: incidents
  "enum.incident.OPEN": "Open",
  "enum.incident.INVESTIGATING": "Investigating",
  "enum.incident.RESOLVED": "Resolved",
  "enum.incident.CLOSED": "Closed",
  "enum.severity.LOW": "Low",
  "enum.severity.MEDIUM": "Medium",
  "enum.severity.HIGH": "High",
  "enum.severity.CRITICAL": "Critical",

  // Enum labels: payment status and collection methods
  "enum.payment.NOT_REQUIRED": "Not required",
  "enum.payment.UNPAID": "Unpaid",
  "enum.payment.PENDING": "Pending",
  "enum.payment.PAID": "Paid",
  "enum.payment.FAILED": "Failed",
  "enum.collection.NONE": "None",
  "enum.collection.CASH": "Cash",
  "enum.collection.DIGITAL": "Digital",

  // Enum labels: key slots and tracking freshness
  "enum.keySlot.ACTIVE": "Active",
  "enum.keySlot.INACTIVE": "Inactive",
  "enum.freshness.LIVE": "LIVE",
  "enum.freshness.STALE": "STALE",
};
