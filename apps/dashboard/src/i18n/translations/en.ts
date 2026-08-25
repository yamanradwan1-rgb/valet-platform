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
  "overview.infoNote":
    "A live management summary for the selected location. Only metrics currently available for this location are shown.",
  "overview.loading": "Loading overview…",
  "overview.action.retry": "Retry",
  "overview.error.loadFailed":
    "We couldn't load the overview right now. Please try again.",
  "overview.error.network":
    "Network connection unavailable. Check your connection and try again.",
  "overview.error.accessDenied":
    "You don't have access to this location's overview.",
  "overview.kpi.vehiclesInService": "Vehicles in service",
  "overview.kpi.vehiclesInServiceSub": "All session states except Completed",
  "overview.kpi.activeRetrievals": "Active retrieval requests",
  "overview.kpi.queueSub": "Current queue snapshot",
  "overview.kpi.oldestWait": "Oldest request wait",
  "overview.kpi.locationCurrency": "Location currency",
  "overview.states.title": "Vehicle service states",
  "overview.states.viewSessions": "View sessions",
  "overview.financial.snapshotTitle": "Financial snapshot",
  "overview.financial.payments": "Payments",
  "overview.financial.amountDue": "Amount due",
  "overview.financial.amountPaid": "Amount paid",
  "overview.financial.tips": "Tips",
  "overview.financial.details": "Details",
  "overview.financial.empty":
    "No payment activity recorded for this location yet.",
  "overview.empty.noActivity":
    "No current vehicle activity at this location right now.",
  "overview.sections.title": "Operational sections",
  "overview.sections.sessionsDescription":
    "Current vehicles and service status.",
  "overview.sections.retrievalQueueDescription":
    "Open and accepted retrieval requests.",
  "overview.sections.tasksDescription": "Parking and retrieval task facts.",
  "overview.sections.activeShiftsDescription":
    "Current active shifts at this location.",
  "overview.sections.keysDescription":
    "Key-slot status and linked service session.",
  "overview.sections.incidentsDescription": "Current incident overview.",
  "overview.duration.minutesUnit": "m",
  "overview.duration.secondsUnit": "s",
  "overview.value.unavailable": "—",

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
  "page.activeShifts.empty": "No active shifts at this location right now.",
  "page.activeShifts.kpiLabel": "Active shifts shown",
  "page.activeShifts.kpiSub":
    "Counts rows loaded so far; Load more extends the list.",
  "page.activeShifts.scopeNote":
    "Lists active shifts with their shift ID, membership ID and start time only. Employee names, performance and task totals are not part of this backend view.",
  "page.activeShifts.column.shiftId": "Shift ID",
  "page.activeShifts.column.membershipId": "Membership ID",
  "page.activeShifts.column.startedAt": "Started at",
  "page.activeShifts.rowSubtitle": "Active shift",

  // Keys
  "page.keys.title": "Key Custody Board",
  "page.keys.description": "Key-slot status and linked service sessions.",
  "page.keys.empty": "No key slots are configured for this location yet.",
  "page.keys.kpiSlots": "Key slots loaded",
  "page.keys.kpiActiveSlots": "Active among loaded",
  "page.keys.kpiHoldingSession": "Holding a session (loaded)",
  "page.keys.scopeNote":
    "Shows each key slot's current status and the service session currently linked to it. Custody history is kept separately and is never guessed from this snapshot.",
  "page.keys.holdingSessionIdLabel": "Holding session ID",
  "page.keys.noHoldingSession": "No holding session",
  "page.keys.detailTitle": "Key slot detail",
  "page.keys.field.keySlotId": "Key slot ID",
  "page.keys.field.code": "Code",
  "page.keys.field.status": "Status",

  // Incidents
  "page.incidents.title": "Incidents",
  "page.incidents.description":
    "Current open and investigating incidents at this location. Read-only monitoring.",
  "page.incidents.empty": "No open or investigating incidents right now.",
  "page.incidents.kpiVisible": "Incidents currently listed",
  "page.incidents.kpiHighCritical": "High / critical among listed",
  "page.incidents.monitoringNote":
    "Read-only monitoring of current incidents: this view lists OPEN and INVESTIGATING cases only, and resolved or closed incidents leave it. Creation, evidence, resolution and closing are handled outside the Management Dashboard.",
  "page.incidents.column.incidentId": "Incident ID",
  "page.incidents.column.sessionId": "Session ID",
  "page.incidents.column.status": "Status",
  "page.incidents.column.severity": "Severity",
  "page.incidents.column.type": "Type",
  "page.incidents.column.createdAt": "Created",
  "page.incidents.column.resolvedAt": "Resolved",
  "page.incidents.detailTitle": "Incident detail",
  "page.incidents.field.description": "Description",
  "page.incidents.field.rawType": "Recorded type",
  "page.incidents.unresolved": "Unresolved",

  // Shared data-surface actions and states (D2 integration pages)
  "actions.loadMore": "Load more",
  "actions.retry": "Retry",
  "states.loading": "Loading…",
  "states.errorGeneric": "This data could not be loaded.",
  "states.networkError":
    "Network connection unavailable. Check your connection and try again.",
  "states.accessDenied":
    "Your account does not have access to this location's data.",

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

  // Shared operations controls (D2-003)
  "common.loadMore": "Load more",
  "common.retry": "Retry",
  "common.loading": "Loading…",
  "common.loadingMore": "Loading more…",
  "common.close": "Close",

  // Shared error surfaces (D2-003); raw backend codes are never rendered
  "errors.requestFailed":
    "This data could not be loaded. Please try again.",
  "errors.moreFailed": "Additional entries could not be loaded.",
  "errors.accessDenied":
    "You don't have access to this location's data.",
  "errors.sessionExpired": "Your session has expired. Please sign in again.",
  "errors.rateLimited":
    "Too many requests. Please wait a moment and try again.",

  // Shared nullability fallbacks (D2-003)
  "fallback.unassigned": "Unassigned",
  "fallback.notAssigned": "Not assigned",

  // Sessions / Vehicles in Service (D2-003)
  "page.sessions.contractNote":
    "Shows each current service session, vehicle reference, status, parking spot, key slot and current assignee when available. Customer details and the full session timeline are not shown here; completed sessions are not part of this view.",
  "sessions.filterGroup": "Filter by state",
  "sessions.filterAll": "All states",
  "sessions.filterScopeHint":
    "State filters apply to the sessions already loaded below.",
  "sessions.column.vehicle": "Vehicle",
  "sessions.column.state": "State",
  "sessions.column.created": "Created",
  "sessions.column.updated": "Updated",
  "sessions.column.parkingSpotId": "Parking spot ID",
  "sessions.column.keySlotId": "Key slot ID",
  "sessions.column.assignee": "Assignee membership ID",
  "sessions.empty": "No matching service sessions in the loaded results.",
  "sessions.detail.title": "Service Session Detail",
  "sessions.detail.sessionId": "Session ID",
  "sessions.detail.vehicleId": "Vehicle ID",
  "sessions.detail.plateNumber": "Plate number",
  "sessions.detail.plateCountry": "Plate country",
  "sessions.detail.temporaryDescriptor": "Temporary descriptor",
  "sessions.detail.state": "State",
  "sessions.detail.createdAt": "Created at",
  "sessions.detail.updatedAt": "Updated at",
  "sessions.detail.parkingSpotId": "Parking spot ID",
  "sessions.detail.keySlotId": "Key slot ID",
  "sessions.detail.assigneeMembershipId": "Current assignee membership ID",
  "sessions.fallback.unnamedVehicle": "Unnamed vehicle",

  // Retrieval queue (D2-003)
  "page.retrievalQueue.contractNote":
    "Shows current vehicle retrieval requests, who requested them, the related service session and the current task when one exists. Queue-wide wait information is available in Analytics.",
  "retrievalQueue.column.requestId": "Request ID",
  "retrievalQueue.column.requestedAt": "Requested at",
  "retrievalQueue.column.status": "Status",
  "retrievalQueue.column.requester": "Requester",
  "retrievalQueue.column.sessionId": "Session ID",
  "retrievalQueue.column.taskStatus": "Task status",
  "retrievalQueue.column.assignee": "Assignee membership ID",
  "retrievalQueue.empty": "No active vehicle retrieval requests.",
  "retrievalQueue.detail.title": "Retrieval Request Detail",
  "retrievalQueue.detail.requestId": "Request ID",
  "retrievalQueue.detail.valetSessionId": "Valet session ID",
  "retrievalQueue.detail.requestedAt": "Requested at",
  "retrievalQueue.detail.status": "Status",
  "retrievalQueue.detail.requester": "Requester",
  "retrievalQueue.detail.requesterTypeCode": "Requester type code",
  "retrievalQueue.detail.taskId": "Task ID",
  "retrievalQueue.detail.taskStatus": "Task status",
  "retrievalQueue.detail.assigneeMembershipId":
    "Current assignee membership ID",

  // Tasks (D2-003)
  "page.tasks.contractNote":
    "This overview shows current task facts only. Reassignment reasons and history belong to dispatch history and are not reconstructed here.",
  "tasks.column.taskId": "Task ID",
  "tasks.column.type": "Type",
  "tasks.column.status": "Status",
  "tasks.column.sessionId": "Session ID",
  "tasks.column.assignee": "Assignee membership ID",
  "tasks.column.created": "Created",
  "tasks.column.updated": "Updated",
  "tasks.empty": "No tasks to show yet.",
  "tasks.detail.title": "Task Detail",
  "tasks.detail.taskId": "Task ID",
  "tasks.detail.taskType": "Task type",
  "tasks.detail.taskTypeCode": "Task type code",
  "tasks.detail.status": "Status",
  "tasks.detail.valetSessionId": "Valet session ID",
  "tasks.detail.assigneeMembershipId": "Current assignee membership ID",
  "tasks.detail.createdAt": "Created at",
  "tasks.detail.updatedAt": "Updated at",
};
