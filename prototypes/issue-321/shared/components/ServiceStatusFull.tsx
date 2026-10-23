import { Camera, CreditCard, RefreshCw, Search, Smartphone } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { sampleServices } from "../fixtures/simulated-data";
import type { PrototypeLocale } from "../types/variant";
import { HelpDialog } from "./HelpDialog";
import "./service-status-full.css";

type ServiceKey = (typeof sampleServices)[number]["key"];
type FilterKey = "ALL" | ServiceKey;

const services = {
  PLATE_OCR: {
    label: { en: "Plate OCR", ar: "قراءة اللوحات" },
    Icon: Camera,
  },
  STAFF_PUSH: {
    label: { en: "Staff Push", ar: "إشعارات الموظفين" },
    Icon: Smartphone,
  },
  DIGITAL_PAYMENT: {
    label: { en: "Digital Payment", ar: "الدفع الرقمي" },
    Icon: CreditCard,
  },
} as const;

const copy = {
  en: {
    intro: "Read-only service configuration status; not guaranteed live provider health.",
    refresh: "Refresh",
    refreshing: "Refreshing preview…",
    all: "All services",
    filters: "Filter services",
    search: "Search services or status",
    status: "Current status",
    unknown: "Unknown",
    unqueried: "Not queried",
    readOnly: "Read only",
    unknownDetail: "No authorized live service status is available in this prototype.",
    empty: "No services match the current filter or search.",
    notice: "Synthetic preview · No API request or provider configuration is performed.",
    refreshed: "Local preview refreshed. Service statuses remain unknown; no API was called.",
  },
  ar: {
    intro: "حالة تهيئة الخدمات للقراءة فقط، وليست ضمانًا لصحة المزود المباشرة.",
    refresh: "تحديث",
    refreshing: "جارٍ تحديث المعاينة…",
    all: "جميع الخدمات",
    filters: "تصفية الخدمات",
    search: "ابحث عن خدمة أو حالة",
    status: "الحالة الحالية",
    unknown: "غير معروفة",
    unqueried: "لم تُستعلم",
    readOnly: "قراءة فقط",
    unknownDetail: "لا تتوفر حالة حية مسترجعة للخدمة ضمن هذا النموذج.",
    empty: "لا توجد خدمات تطابق الفلتر أو البحث الحالي.",
    notice: "معاينة تجريبية · دون استدعاء API أو تعديل إعدادات المزوّد.",
    refreshed: "تم تحديث المعاينة المحلية. الحالات ما زالت غير معروفة، ولم يُستدعَ API.",
  },
} as const;

/** The fixture status is deliberately null: a real provider state needs an authorized API read. */
export function ServiceStatusFull({ locale }: { readonly locale: PrototypeLocale }) {
  const [filter, setFilter] = useState<FilterKey>("ALL");
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshed, setRefreshed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const t = copy[locale];

  useEffect(() => () => {
    if (timer.current !== null) clearTimeout(timer.current);
  }, []);

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase(locale);
    return sampleServices.filter((item) => {
      if (filter !== "ALL" && item.key !== filter) return false;
      const searchable = `${services[item.key].label.en} ${services[item.key].label.ar} ${item.key} ${t.unknown} Unknown`;
      return searchable.toLocaleLowerCase(locale).includes(term);
    });
  }, [filter, query, locale, t.unknown]);

  function refreshPreview() {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshed(false);
    timer.current = setTimeout(() => {
      setRefreshing(false);
      setRefreshed(true);
      timer.current = null;
    }, 320);
  }

  return (
    <section className="p321-services-full" aria-label={locale === "ar" ? "حالات الخدمات" : "Service statuses"}>
      <div className="p321-services-toolbar">
        <div className="p321-services-intro">
          <p>{t.intro}</p>
          <HelpDialog helpKey="services.status" locale={locale} />
        </div>
        <button className="p321-services-refresh" type="button" disabled={refreshing} onClick={refreshPreview}>
          <RefreshCw aria-hidden="true" size={17} className={refreshing ? "p321-services-spinning" : ""} />
          {refreshing ? t.refreshing : t.refresh}
        </button>
      </div>

      <div className="p321-services-controls">
        <div className="p321-services-filters" role="group" aria-label={t.filters}>
          {(["ALL", ...sampleServices.map((item) => item.key)] as FilterKey[]).map((key) => (
            <button key={key} type="button" aria-pressed={filter === key}
              onClick={() => setFilter(key)}>
              {key === "ALL" ? t.all : services[key].label[locale]}
            </button>
          ))}
        </div>
        <label className="p321-services-search">
          <span className="p321-visually-hidden">{t.search}</span>
          <Search size={17} aria-hidden="true" />
          <input type="search" autoComplete="off" value={query} placeholder={t.search}
            onChange={(event) => setQuery(event.target.value)} />
        </label>
      </div>

      {filtered.length ? (
        <div className="p321-services-grid">
          {filtered.map((item) => {
            const service = services[item.key];
            const Icon = service.Icon;
            return (
              <article key={item.key} data-integration={item.key} className="p321-services-card">
                <div className="p321-services-card-top">
                  <div className="p321-services-identity">
                    <span className="p321-services-icon"><Icon aria-hidden="true" size={20} /></span>
                    <div>
                      <h3>{service.label[locale]}</h3>
                      <bdi dir="ltr" className="p321-services-code">{item.key}</bdi>
                    </div>
                  </div>
                  <span className="p321-services-status">{t.unknown}</span>
                </div>
                <p className="p321-services-card-detail">{t.unknownDetail}</p>
                <div className="p321-services-card-bottom">
                  <span>{t.status}: <strong>{t.unqueried}</strong></span>
                  <span className="p321-services-readonly">{t.readOnly}</span>
                </div>
              </article>
            );
          })}
        </div>
      ) : <div className="p321-services-empty" role="status">{t.empty}</div>}

      <p className="p321-services-disclaimer">{t.notice}</p>
      <div className="p321-services-announcement" role="status" aria-live="polite">
        {refreshed ? t.refreshed : ""}
      </div>
    </section>
  );
}
