import {
  type WebPushLocale,
  type WebPushPayload,
  webPushPayloadSchema,
} from "@valet/contracts";

const copy = {
  EMPLOYEE_RETRIEVAL_REQUESTED: {
    ar: {
      body: "يوجد طلب استرجاع جديد في قائمة المهام.",
      title: "طلب استرجاع جديد",
    },
    en: {
      body: "A new retrieval request is waiting in the task queue.",
      title: "New retrieval request",
    },
  },
  GUEST_VEHICLE_READY: {
    ar: {
      body: "مركبتك جاهزة. افتح ڤايليت لعرض آخر حالة.",
      title: "مركبتك جاهزة",
    },
    en: {
      body: "Your vehicle is ready. Open VAYLET for the latest status.",
      title: "Your vehicle is ready",
    },
  },
} as const;

type PayloadInput =
  | {
      readonly locale: WebPushLocale;
      readonly presentationType: "EMPLOYEE_RETRIEVAL_REQUESTED";
      readonly taskId: string;
    }
  | {
      readonly locale: WebPushLocale;
      readonly presentationType: "GUEST_VEHICLE_READY";
      readonly readyAt: string;
      readonly valetSessionId: string;
    };

export function buildWebPushPayload(input: PayloadInput): WebPushPayload {
  const shared = {
    direction: input.locale === "ar" ? ("rtl" as const) : ("ltr" as const),
    locale: input.locale,
    ...copy[input.presentationType][input.locale],
    version: 1 as const,
  };
  return webPushPayloadSchema.parse(
    input.presentationType === "EMPLOYEE_RETRIEVAL_REQUESTED"
      ? {
          ...shared,
          audience: "EMPLOYEE",
          identity: input.taskId,
          presentationType: input.presentationType,
          route: "TASKS",
        }
      : {
          ...shared,
          audience: "GUEST",
          identity: `${input.valetSessionId}:${input.readyAt}`,
          presentationType: input.presentationType,
          route: "GUEST_HOME",
        },
  );
}
