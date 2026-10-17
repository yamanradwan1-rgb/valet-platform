"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import { ScopedContextHelp } from "../help/scoped-context-help";
import type { DemoEvent, InvestigationDemoLocale } from "./investigation-demo-types";
import styles from "./investigation-event-drawer.module.css";

interface DrawerProps {
  readonly event: DemoEvent | null;
  readonly locale: InvestigationDemoLocale;
  readonly onClose: () => void;
}

const names: Record<string, readonly [string, string]> = {
  VALET_SESSION_CHECK_IN_COMPLETED: ["Check-in completed", "اكتمال تسجيل المركبة"],
  SLOT_ASSIGNED: ["Key slot assigned", "تسجيل تعيين خانة المفتاح"],
  ASSIGNED: ["Task assigned", "تعيين المهمة"],
  VALET_SESSION_PARKED: ["Vehicle parked", "تسجيل ركن المركبة"],
  CHECKED_OUT: ["Key checked out", "تسجيل إخراج المفتاح"],
  RETURNED_TO_SLOT: ["Key returned to slot", "تسجيل إعادة المفتاح للخانة"],
  SLOT_CLEARED: ["Key slot cleared", "إخلاء خانة المفتاح"],
  VALET_SESSION_READY: ["Vehicle ready", "جاهزية المركبة"],
  VALET_SESSION_HANDOFF_PENDING: ["Handoff pending", "بانتظار التسليم"],
  HANDOFF_VERIFIED: ["Handoff verified", "التحقق من التسليم"],
  VALET_SESSION_COMPLETED: ["Session completed", "اكتمال الجلسة"],
  VALET_SESSION_RETRIEVAL_REQUESTED: ["Retrieval requested", "طلب استرجاع المركبة"],
  INCIDENT_REPORTED: ["Incident reported", "تسجيل بلاغ حادث"],
  REASSIGNED: ["Task reassigned", "إعادة تعيين المهمة"],
};

const sourceLabels = {
  en: { AUDIT: "Audit", KEY: "Key custody", DISPATCH: "Dispatch", INCIDENT: "Incident" },
  ar: { AUDIT: "التدقيق", KEY: "عهدة المفتاح", DISPATCH: "توزيع المهام", INCIDENT: "الحوادث" },
} as const;

const labels = {
  en: {
    detail: "Recorded event detail",
    close: "Close details",
    source: "Recorded source",
    id: "Event ID",
    type: "Event type",
    recorded: "Recorded timestamp",
    session: "Session",
    scope: "Scope",
    actor: "Action actor",
    role: "Actor role",
    participant: "Assignee / participant",
    membership: "Actor membership ID",
    resource: "Resource reference",
    change: "Recorded change",
    evidence: "Evidence availability",
    noActor: "No recorded employee actor",
    missing: "Not recorded",
    nameSource: "Current directory label; no immutable historical name snapshot",
    origin: "Offline demo references, not production UUIDs or API evidence",
    restriction: "Reported KEY_MISSING does not prove physical loss. Description/photos are unavailable or restricted; no resolution is recorded.",
  },
  ar: {
    detail: "تفاصيل الحدث المسجل",
    close: "إغلاق التفاصيل",
    source: "المصدر المسجل",
    id: "معرّف الحدث",
    type: "نوع الحدث",
    recorded: "وقت التسجيل",
    session: "الجلسة",
    scope: "النطاق",
    actor: "منفذ الإجراء",
    role: "دور المنفذ",
    participant: "المكلّف / المشارك",
    membership: "معرّف عضوية المنفّذ",
    resource: "مرجع المورد",
    change: "التغيير المسجل",
    evidence: "توفر الدليل",
    noActor: "لا يوجد منفذ موظف مسجل",
    missing: "غير مسجل",
    nameSource: "اسم العرض الحالي بالدليل؛ لا توجد لقطة تاريخية ثابتة",
    origin: "مراجع تجريبية محلية، ليست معرّفات UUID أو أدلة حقيقية من API",
    restriction: "تصنيف البلاغ KEY_MISSING لا يثبت الفقدان الفعلي. الوصف والصور غير متاحة أو مقيدة؛ ولا يوجد حدث حل مسجل.",
  },
} as const;

const arabicRoles: Readonly<Record<string, string>> = {
  Reception: "الاستقبال",
  Dispatcher: "موزّع المهام",
  "Valet employee": "موظف خدمة صف المركبات",
  "Incident reporter": "مبلّغ الحادث",
  "Location manager": "مدير الموقع",
};

// Human-readable descriptions from the approved Concept A fixture.
const arabicChanges: Readonly<Record<string, string>> = {
  "AUD-101": "تم تسجيل اكتمال استلام المركبة؛ لا يدّعي الحدث حيازة المفتاح.",
  "CUS-102": "تعيين الخانة مسجل؛ لا يثبت حيازة فعلية مستمرة.",
  "DSP-103": "تعيين مهمة ركن T-01 إلى سمير؛ منفذ التعيين مختلف عن المكلّف.",
  "AUD-104": "تسجيل ركن المركبة في المنطقة A والموقف A-12.",
  "DSP-107": "تعيين مهمة استرجاع T-02 إلى لينا؛ لا يثبت حيازة المفتاح.",
  "CUS-105": "تسجيل إخراج المفتاح من K-07؛ فترة الحيازة غير مثبتة.",
  "CUS-106": "تسجيل إعادة المفتاح؛ مجرد الإعادة لا تخلي خانته.",
  "CUS-106B": "إخلاء خانة K-07 بشكل صريح، مما يسمح بإعادة تعيينها.",
  "AUD-108": "تسجيل جاهزية المركبة بعد انتهاء نافذة البحث.",
  "AUD-109B": "تسجيل حالة انتظار التسليم؛ لا نستنتج مراحل انتقال أخرى غير مسجلة.",
  "AUD-109": "نتيجة التحقق verified، دون عرض رمز الاستلام.",
  "AUD-110": "تسجيل اكتمال الجلسة.",
  "AUD-201": "اكتمال الاستلام؛ العضوية المسجلة MEM-42 والاسم الحالي من دليل الموظفين.",
  "CUS-202": "تعيين الخانة بعد إخلائها في حدث CUS-106B الساعة 14:22.",
  "DSP-203": "تعيين مهمة ركن T-03 إلى عمر.",
  "CUS-204": "تسجيل إخراج المفتاح K-07.",
  "AUD-205": "تسجيل ركن المركبة في المنطقة A والموقف A-08.",
  "CUS-206": "تسجيل إعادة المفتاح؛ لا يكفي وحده لإخلاء الخانة.",
  "CUS-206B": "إخلاء خانة K-07 بشكل صريح للسماح بإعادة استخدامها.",
  "AUD-207": "تسجيل طلب استرجاع؛ الجلسة لا تزال مفتوحة ولا يوجد سجل تسليم أو إفراج.",
  "AUD-301": "تسجيل اكتمال استقبال المركبة.",
  "CUS-302": "تعيين K-07 بعد إخلائها في CUS-206B عند 14:50.",
  "DSP-303": "تعيين مهمة T-04 إلى رنا؛ لا يوجد دليل قبولها.",
  "INC-304": "تصنيف البلاغ KEY_MISSING لا يثبت وقوع فقدان؛ الخطورة HIGH، والحالة الحالية OPEN.",
  "DSP-305": "إعادة تعيين مهمة T-04 من رنا إلى هادي بواسطة مدير الموقع كريم زيد؛ لا يوجد إفراج عن المركبة.",
};

function Fact({
  label,
  value,
  ltr = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly ltr?: boolean;
}) {
  return (
    <div className={styles.fact}>
      <dt>{label}</dt>
      <dd><bdi dir={ltr ? "ltr" : "auto"}>{value}</bdi></dd>
    </div>
  );
}

const focusables = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function InvestigationEventDrawer({ event, locale, onClose }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const focusReturn = useRef<HTMLElement | null>(null);
  const closeHandler = useRef(onClose);
  const activeEventId = event?.id ?? null;
  const t = labels[locale];

  useEffect(() => {
    closeHandler.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!activeEventId) return;
    focusReturn.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const panel = panelRef.current;
    closeRef.current?.focus();
    function handleKeydown(key: KeyboardEvent) {
      const top = Array.from(
        document.querySelectorAll('[role="dialog"][aria-modal="true"]'),
      ).at(-1);
      if (!panel || top !== panel) return;
      if (key.key === "Escape") {
        key.preventDefault();
        key.stopPropagation();
        closeHandler.current();
      } else if (key.key === "Tab") {
        const controls = Array.from(panel.querySelectorAll<HTMLElement>(focusables));
        const first = controls[0];
        const last = controls.at(-1);
        if (!first || !last) return;
        if (key.shiftKey && document.activeElement === first) {
          key.preventDefault();
          last.focus();
        } else if (!key.shiftKey && document.activeElement === last) {
          key.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", handleKeydown);
    return () => {
      document.removeEventListener("keydown", handleKeydown);
      if (focusReturn.current?.isConnected) focusReturn.current.focus();
      focusReturn.current = null;
    };
  }, [activeEventId]);

  if (!event || typeof document === "undefined") return null;
  const title = names[event.type]?.[locale === "ar" ? 1 : 0] ?? event.type;
  const evidence = locale === "ar"
    ? event.id === "INC-304"
      ? "الوصف والصور مقيدة أو غير متاحة، ولا يوجد سجل حل."
      : event.id === "AUD-201"
        ? "العضوية MEM-42؛ اسم العرض الحالي من دليل الموظفين."
        : event.id === "AUD-109"
          ? "النتيجة فقط؛ رمز التسليم محجوب."
          : event.id === "AUD-207"
            ? "سجل تدقيق، دون منفّذ موظف مسجل."
            : event.id === "DSP-305"
              ? "المكلفة السابقة رنا، والمكلّف الجديد هادي؛ سجل توزيع مهام."
              : sourceLabels.ar[event.source] + " · سجل تجريبي"
    : event.evidence;

  return createPortal(
    <div
      className={styles.backdrop}
      onMouseDown={(mouse) => {
        if (mouse.target === mouse.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        aria-labelledby="investigation-demo-drawer-title"
        aria-modal="true"
        className={styles.drawer}
        dir={locale === "ar" ? "rtl" : "ltr"}
        onMouseDown={(mouse) => mouse.stopPropagation()}
        ref={panelRef}
        role="dialog"
      >
        <div className={styles.header}>
          <div className={styles.heading}>
            <span className={styles.source}>{locale === "ar" ? "سجل المصدر · للقراءة فقط" : "SOURCE RECORD · VIEW ONLY"}</span>
            <h2 id="investigation-demo-drawer-title">{title}</h2>
            <bdi className={styles.type} dir="ltr">{event.id}</bdi>
          </div>
          <div className={styles.headerActions}>
            <ScopedContextHelp helpKey="audit.detail" />
            <button
              aria-label={t.close}
              className={styles.close}
              onClick={onClose}
              ref={closeRef}
              type="button"
            ><X aria-hidden="true" size={18} /></button>
          </div>
        </div>
        <div className={styles.body}>
          <p className={styles.disclosure}>{t.origin}</p>
          <dl className={styles.section}>
            <Fact label={t.source} value={sourceLabels[locale][event.source]} />
            <Fact label={t.id} value={event.id} ltr />
            <Fact label={t.type} value={event.type} ltr />
            <Fact label={t.recorded} value={`2026-10-23 ${event.time}:00 UTC+03:00`} ltr />
            <Fact label={t.session} value={event.session} ltr />
            <Fact label={t.scope} value={locale === "ar" ? "الموقع التجريبي الشمالي / المنطقة A" : "VAYLET Pilot North / Zone A"} />
          </dl>
          <dl className={styles.section}>
            <Fact label={t.actor} value={event.actor ?? t.noActor} />
            <Fact label={t.role} value={event.role ? (locale === "ar" ? arabicRoles[event.role] ?? event.role : event.role) : t.missing} />
            <Fact label={t.participant} value={event.participant ?? t.missing} />
            <Fact label={t.resource} value={event.resource ?? t.missing} ltr={Boolean(event.resource)} />
            {event.id === "AUD-201" ? <Fact label={t.membership} value="MEM-42" ltr /> : null}
          </dl>
          {event.actor ? <p className={styles.disclosure}>{t.nameSource}</p> : null}
          <section className={styles.section}>
            <h3>{t.change}</h3>
            <p>{locale === "ar" ? arabicChanges[event.id] ?? event.transition : event.transition}</p>
          </section>
          <section className={styles.section}>
            <h3>{t.evidence}</h3>
            <p>{evidence}</p>
            {event.source === "INCIDENT" ? <p className={styles.notice}>{t.restriction}</p> : null}
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}
