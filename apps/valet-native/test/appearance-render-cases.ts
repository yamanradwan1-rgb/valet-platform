import { base } from "./native-check-in-locale-state-fixtures";
import { conditionSnapshot } from "./native-check-in-condition-test-support";
import { operations } from "./production-shell-test-fixture";
import type { appearanceRenderer } from "./appearance-render-evidence";

export type RenderCase = {
  name: string;
  file: string;
  component: string;
  props: (
    r: ReturnType<typeof appearanceRenderer>,
    locale: "en" | "ar",
  ) => Record<string, unknown>;
};
export const noop = () => undefined;
export const scope = {
  locationCode: "AMM",
  locationId: "location",
  locationName: "Amman",
  membershipId: "member",
  organizationId: "org",
  organizationName: "Operator",
  role: "VALET_EMPLOYEE",
  shiftId: "shift",
  shiftStartedAt: "2026-09-03T08:00:00.000Z",
};
export const directoryRow = {
  createdAt: scope.shiftStartedAt,
  updatedAt: scope.shiftStartedAt,
  sessionId: "session",
  state: "CHECKING_IN",
  keySlotCode: null,
  keySlotVisibility: "RESTRICTED",
  parkingSpotCode: null,
  parkingZoneCode: null,
  vehicle: {
    color: "Black",
    make: "Toyota",
    model: "Camry",
    plateCountry: "JO",
    plateNumberRaw: "12-34567",
    temporaryDescriptor: null,
  },
};
const align = (locale: string) => (locale === "ar" ? "right" : "left");
const copy = (
  r: ReturnType<typeof appearanceRenderer>,
  file: string,
  fn: string,
  locale: string,
) => (r.load(file)[fn] as (locale: string) => unknown)(locale);

export const shellRenderCases: RenderCase[] = [
  {
    name: "sign-in",
    file: "auth/native-auth-panel",
    component: "NativeAuthPanel",
    props: (r, locale) => ({
      gate: true,
      copy: copy(r, "auth/native-auth-copy", "getNativeAuthCopy", locale),
      session: {},
      snapshot: { phase: "signed-out", error: null },
      textAlign: align(locale),
    }),
  },
  {
    name: "shell header",
    file: "employee-ui/employee-frame",
    component: "EmployeeAppHeader",
    props: (_r, locale) => ({
      scope,
      textAlign: align(locale),
      utilities: "Settings",
    }),
  },
  {
    name: "navigation",
    file: "shell/native-production-navigation",
    component: "NativeProductionNavigation",
    props: (_r, locale) => ({
      activeDestination: "tasks",
      locale,
      onNavigate: noop,
      pinned: false,
    }),
  },
  {
    name: "Settings",
    file: "shell/native-account-menu",
    component: "NativeAccountMenu",
    props: (_r, locale) => ({
      locale,
      onRequestNotificationPermission: noop,
      onSelectLocale: noop,
      scope,
      pushSnapshot: {
        permission: "granted",
        registration: "confirmed",
        channelAvailable: true,
      },
    }),
  },
  {
    name: "Scan",
    file: "scan/native-scan-hub-screen",
    component: "NativeScanHubScreen",
    props: (_r, locale) => ({
      locale,
      textAlign: align(locale),
      navigate: noop,
      gates: Object.fromEntries(
        ["licensePlate", "keySlot", "parkingSpot", "pickupHandoff"].map((k) => [
          k,
          { available: k !== "keySlot", context: null, disabledReason: null },
        ]),
      ),
    }),
  },
  {
    name: "Shift",
    file: "shift/native-active-shift-panel",
    component: "NativeActiveShiftPanel",
    props: (_r, locale) => ({
      locale,
      textAlign: align(locale),
      session: {},
      onReviewTasks: noop,
      snapshot: {
        authority: { ...scope, currency: "JOD", identityGeneration: 1 },
        phase: "active",
        cashInput: "",
        cashValidationVisible: false,
        failure: null,
        result: null,
        online: true,
      },
    }),
  },
  ...(["ready", "loading", "error", "empty"] as const).map((phase) => ({
    name: `Vehicles ${phase}`,
    file: "vehicles/native-vehicles-screen",
    component: "NativeVehiclesScreen",
    props: (
      _r: ReturnType<typeof appearanceRenderer>,
      locale: "en" | "ar",
    ) => ({
      locale,
      textAlign: align(locale),
      directory: {},
      scope,
      snapshot: {
        phase: phase === "empty" ? "ready" : phase,
        failure: null,
        scope,
        page: {
          locationId: "location",
          rows: phase === "ready" ? [directoryRow] : [],
          truncated: false,
        },
      },
    }),
  })),
  {
    name: "#255 expanded incomplete Check-In",
    file: "vehicles/native-vehicle-row",
    component: "NativeVehicleRow",
    props: (r, locale) => ({
      locale,
      textAlign: align(locale),
      copy: copy(
        r,
        "vehicles/native-vehicles-copy",
        "getNativeVehiclesCopy",
        locale,
      ),
      row: directoryRow,
      expanded: true,
      onToggle: noop,
      checkInActions: {
        type: r.load("vehicles/native-vehicle-check-in-actions")
          .NativeVehicleCheckInActions,
        props: {
          copy: copy(
            r,
            "vehicles/native-check-in-actions-copy",
            "nativeCheckInActionsCopy",
            locale,
          ),
          textAlign: align(locale),
          phase: "idle",
          disabled: false,
          onContinue: noop,
          onCancel: noop,
          onCheck: noop,
          onRetry: noop,
        },
      },
    }),
  },
  ...(["ready", "loading", "failed"] as const).map((phase) => ({
    name: `Tasks ${phase}`,
    file: "tasks/native-tasks-panel",
    component: "NativeTasksPanel",
    props: (
      _r: ReturnType<typeof appearanceRenderer>,
      locale: "en" | "ar",
    ) => ({
      locale,
      textAlign: align(locale),
      operations: {},
      snapshot: {
        ...operations("ready"),
        phase:
          phase === "ready"
            ? "ready"
            : phase === "loading"
              ? "loading-context"
              : "error",
        scope,
        tasks:
          phase === "ready"
            ? [
                {
                  createdAt: scope.shiftStartedAt,
                  retrievalRequestedAt: scope.shiftStartedAt,
                  currentAssigneeMembershipId: null,
                  parkingSpot: null,
                  parkingZone: null,
                  sessionId: "session",
                  status: "QUEUED",
                  taskId: "task",
                  taskType: "RETRIEVAL",
                  valetSessionState: "REQUESTED",
                  valetSessionVersion: 2,
                  version: 1,
                  vehicle: directoryRow.vehicle,
                },
              ]
            : [],
        busyTaskId: null,
      },
    }),
  })),
  {
    name: "Check-In manual",
    file: "check-in/native-check-in-workflow",
    component: "NativeCheckInWorkflow",
    props: (_r, locale) => ({
      locale,
      auth: {},
      session: {},
      onClose: noop,
      snapshot: base(),
    }),
  },
  {
    name: "condition",
    file: "check-in/native-check-in-workflow",
    component: "NativeCheckInWorkflow",
    props: (_r, locale) => ({
      locale,
      auth: {},
      session: {},
      onClose: noop,
      snapshot: conditionSnapshot(),
    }),
  },
];
