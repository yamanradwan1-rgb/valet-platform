import {
  detail,
  incidentSnapshot,
  guestSnapshot,
} from "./native-parity-11-test-fixture";
import { noop, scope, type RenderCase } from "./appearance-render-cases";

const session = {
  ...detail(),
  state: "READY",
  handoff: {
    pendingAt: "2026-09-03T10:00:00Z",
    verification: { method: "PICKUP_CODE", status: "VERIFIED" },
  },
};
const task = {
  currentAssigneeMembershipId: scope.membershipId,
  taskType: "RETRIEVAL",
  status: "IN_PROGRESS",
  vehicle: session.vehicle,
  sessionId: session.sessionId,
};
const snapshot = {
  phase: "ready",
  failure: null,
  identityGeneration: 1,
  scope,
  session,
  task,
};
export const workflowRenderCases: RenderCase[] = [
  {
    name: "parking",
    file: "parking/native-active-parking-panel",
    component: "NativeActiveParkingPanel",
    props: (_r, locale) => ({
      locale,
      onParkVehicle: noop,
      snapshot: {
        ...snapshot,
        phase: "started",
        session: { ...session, state: "PARKING" },
      },
    }),
  },
  {
    name: "key assignment",
    file: "parking/native-parking-key-return-step",
    component: "NativeParkingKeyReturnStep",
    props: (r, locale) => ({
      auth: {},
      confirmation: {},
      locale,
      online: true,
      copy: (
        r.load("parking/native-parking-confirm-copy")
          .getNativeParkingConfirmCopy as (l: string) => unknown
      )(locale),
      textAlign: locale === "ar" ? "right" : "left",
      snapshot: {
        ...snapshot,
        phase: "slot",
        keySlotCandidate: "K-9",
        parkingSpotCandidate: "12",
        conflict: null,
      },
    }),
  },
  {
    name: "retrieval",
    file: "retrieval/native-retrieval-panel",
    component: "NativeRetrievalPanel",
    props: (_r, locale) => ({
      auth: {},
      retrieval: {},
      locale,
      onBack: noop,
      snapshot: {
        ...snapshot,
        phase: "key-checkout",
        keyConfirmed: false,
        keySlotCandidate: "K-9",
        readyAt: null,
        retrievalStartedAt: null,
      },
    }),
  },
  ...(["pending", "verified"] as const).map((phase) => ({
    name: `handoff ${phase}`,
    file: "handoff/native-handoff-panel",
    component: "NativeHandoffPanel",
    props: (_r: unknown, locale: "en" | "ar") => ({
      auth: {},
      handoff: {},
      locale,
      onBack: noop,
      snapshot: {
        ...snapshot,
        phase,
        session: { ...session, state: "HANDOFF_PENDING" },
      },
    }),
  })),
  {
    name: "release",
    file: "handoff/native-release-panel",
    component: "NativeReleasePanel",
    props: (_r, locale) => ({
      locale,
      onBack: noop,
      onDone: noop,
      release: {},
      snapshot: {
        ...snapshot,
        block: null,
        completion: null,
        releaseRequiresPayment: false,
        releaseSatisfied: true,
      },
    }),
  },
  ...(["form", "loading", "context-error", "success"] as const).map(
    (phase) => ({
      name: `incident ${phase}`,
      file: "incident/native-incident-screen",
      component: "NativeIncidentScreen",
      props: (_r: unknown, locale: "en" | "ar") => ({
        locale,
        onClose: noop,
        session: {},
        snapshot: incidentSnapshot(phase),
      }),
    }),
  ),
  {
    name: "guest access",
    file: "guest-access/native-guest-access-screen",
    component: "NativeGuestAccessScreen",
    props: (_r, locale) => ({
      locale,
      configInvalid: false,
      credentialUrl: null,
      onClose: noop,
      onIssue: noop,
      session: {},
      snapshot: guestSnapshot("ready", "NOT_ISSUED"),
    }),
  },
  {
    name: "confirmation modal",
    file: "guest-access/native-guest-access-confirm-sheet",
    component: "NativeGuestAccessConfirmSheet",
    props: (_r, locale) => ({
      title: locale === "ar" ? "تأكيد" : "Confirm",
      body: locale === "ar" ? "المتابعة" : "Continue",
      cancel: locale === "ar" ? "إلغاء" : "Cancel",
      confirm: locale === "ar" ? "تأكيد" : "Confirm",
      textAlign: locale === "ar" ? "right" : "left",
      variant: "danger",
      onClose: noop,
      onConfirm: noop,
    }),
  },
  ...(["primary", "secondary", "danger", "success", "ghost"] as const).map(
    (variant) => ({
      name: `button ${variant}`,
      file: "employee-ui/employee-controls",
      component: "EmployeeButton",
      props: (_r: unknown, locale: "en" | "ar") => ({
        label: locale === "ar" ? "متابعة" : "Continue",
        variant,
        onPress: noop,
      }),
    }),
  ),
  {
    name: "disabled button",
    file: "employee-ui/employee-controls",
    component: "EmployeeButton",
    props: (_r, locale) => ({
      label: locale === "ar" ? "متابعة" : "Continue",
      disabled: true,
      onPress: noop,
    }),
  },
  {
    name: "plate field",
    file: "employee-ui/employee-fields",
    component: "EmployeeField",
    props: (_r, locale) => ({
      accessibilityLabel: locale === "ar" ? "اللوحة" : "Plate",
      textAlign: locale === "ar" ? "right" : "left",
      value: "12-34567",
      kind: "identifier",
      visualRole: "plate",
      maxLength: 40,
      onChangeText: noop,
    }),
  },
  ...(
    [
      "EmployeeCard",
      "EmployeeBadge",
      "EmployeeError",
      "EmployeeProgress",
    ] as const
  ).map((component) => ({
    name: component,
    file: "employee-ui/employee-feedback",
    component,
    props: (_r: unknown, locale: "en" | "ar") => ({
      children: locale === "ar" ? "حالة" : "Status",
      label: locale === "ar" ? "حالة" : "Status",
      textAlign: locale === "ar" ? "right" : "left",
      variant: "warning",
      showDot: true,
    }),
  })),
];
