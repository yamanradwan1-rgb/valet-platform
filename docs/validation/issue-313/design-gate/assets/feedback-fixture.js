/* VAYLET #313 — deterministic, locally computed DESIGN DATA ONLY.
   No network activity, browser storage, identifiers or customer information. */
(function () {
  "use strict";
  const locationSpecs = [
    { id: "main", en: "Main Garage", ar: "الموقف الرئيسي", sep: { eligible: 70, counts: [18, 15, 9, 4, 2] }, oct: { eligible: 8, counts: [2, 1, 1, 0, 0] } },
    { id: "north", en: "North Garage", ar: "الموقف الشمالي", sep: { eligible: 50, counts: [12, 9, 5, 3, 1] }, oct: { eligible: 6, counts: [1, 0, 0, 1, 0] } },
  ];
  const localeText = {
    en: {
      heading: "Customer Feedback", demo: "DEMO DATA — Illustrative only",
      average: "Average rating", rated: "Rated visits", eligible: "Eligible completed visits",
      participation: "Participation", distribution: "Star distribution", recent: "Recent visit ratings",
      review: "View rating data", star: "star", stars: "stars", visits: "visits",
      sample: "ratings", unavailable: "Not available", noRatings: "No ratings for eligible visits in this period.",
      noEligible: "No eligible completed visits in this period. Participation cannot be calculated.",
      loading: "Loading illustrative feedback…", error: "Simulated feedback request failed.",
      denied: "Feedback unavailable: access denied in this demonstration.",
      retry: "Retry simulation", visit: "Visit reference", location: "Location",
      completed: "Completed", submitted: "Rated", coverage: "Rated / eligible completed visits",
      simulation: "State controls simulate future authorized API outcomes.",
      scope: "Authorized context", period: "Completed-visit period", state: "Simulation",
      company: "Company Admin · all authorized Locations",
      manager: "Location Manager · Main Garage only",
      all: "All authorized Locations", main: "Main Garage", north: "North Garage",
      sep: "September 2026", oct: "October 2026", aug: "August 2026",
      live: "Illustrative data", empty: "No ratings", none: "No eligible visits",
      fail: "Error", busy: "Loading", forbidden: "Access denied",
      cohort: "Period based on completed visit date (Location-local), not when rating was submitted.",
    },
    ar: {
      heading: "تقييمات العملاء", demo: "بيانات تجريبية للعرض فقط",
      average: "متوسط التقييم", rated: "الزيارات المقيّمة", eligible: "الزيارات المكتملة المؤهلة",
      participation: "نسبة المشاركة", distribution: "توزيع النجوم", recent: "أحدث تقييمات الزيارات",
      review: "عرض بيانات التقييم", star: "نجمة", stars: "نجوم", visits: "زيارة",
      sample: "تقييمًا", unavailable: "غير متاح", noRatings: "لا توجد تقييمات للزيارات المؤهلة خلال الفترة.",
      noEligible: "لا توجد زيارات مكتملة مؤهلة خلال الفترة. يتعذر حساب نسبة المشاركة.",
      loading: "جارٍ تحميل تقييمات العرض…", error: "فشل طلب التقييم التجريبي.",
      denied: "التقييمات غير متاحة: محاكاة رفض الوصول.",
      retry: "إعادة تجربة المحاكاة", visit: "مرجع الزيارة", location: "الموقع",
      completed: "مكتملة في", submitted: "تم تقييمها في", coverage: "زيارات مقيّمة / زيارات مكتملة مؤهلة",
      simulation: "التحكم في الحالات يحاكي ردود واجهة برمجية مستقبلية مصرّح بها.",
      scope: "نطاق الصلاحية", period: "فترة الزيارات المكتملة", state: "المحاكاة",
      company: "مسؤول الشركة · جميع المواقع المصرّح بها",
      manager: "مدير الموقع · الموقف الرئيسي فقط",
      all: "جميع المواقع المصرّح بها", main: "الموقف الرئيسي", north: "الموقف الشمالي",
      sep: "سبتمبر 2026", oct: "أكتوبر 2026", aug: "أغسطس 2026",
      live: "بيانات توضيحية", empty: "بدون تقييمات", none: "بدون زيارات مؤهلة",
      fail: "خطأ", busy: "تحميل", forbidden: "رفض الوصول",
      cohort: "تُحدد الفترة بتاريخ اكتمال الزيارة المحلي للموقع، وليس بتاريخ إرسال التقييم.",
    },
  };
  const pad = (v) => String(v).padStart(2, "0");
  function datePlus(dateIso, days) {
    const d = new Date(dateIso + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }
  const records = [];
  let sequence = 1;
  for (const loc of locationSpecs) {
    for (const period of ["sep", "oct"]) {
      const config = loc[period];
      const month = period === "sep" ? "09" : "10";
      const maxDay = period === "sep" ? 30 : 20;
      const ratings = config.counts.flatMap((count, ix) => Array(count).fill(5 - ix));
      for (let i = 0; i < config.eligible; i++) {
        const day = 1 + (i * 7 + (loc.id === "north" ? 2 : 0)) % maxDay;
        const completedAt = "2026-" + month + "-" + pad(day);
        const rating = ratings[i] ?? null;
        const ratedAt = rating === null ? null : datePlus(completedAt, i === 0 && period === "sep" ? 4 : (i % 3));
        records.push({
          reference: "DEMO-VISIT-" + String(sequence++).padStart(3, "0"),
          locationId: loc.id, completedAt, ratedAt, rating,
        });
      }
    }
  }
  function selectData(config) {
    const period = config?.period === "oct" ? "2026-10" : config?.period === "aug" ? "2026-08" : "2026-09";
    const manager = config?.role === "manager";
    const location = manager ? "main" : (config?.location === "main" || config?.location === "north" ? config.location : "all");
    const mode = ["empty", "none", "loading", "error", "denied"].includes(config?.state) ? config.state : "live";
    const relevant = mode === "denied" || mode === "error" || mode === "loading" || mode === "none"
      ? [] : records.filter((record) => record.completedAt.slice(0, 7) === period && (location === "all" || record.locationId === location));
    const rated = mode === "empty" ? [] : relevant.filter((record) => record.rating !== null);
    const counts = [5, 4, 3, 2, 1].map((star) => rated.filter((r) => r.rating === star).length);
    const totalStars = counts.reduce((sum, count, ix) => sum + count * (5 - ix), 0);
    const eligible = relevant.length;
    const ratedCount = rated.length;
    return {
      status: mode, role: manager ? "manager" : "company", location, period,
      eligible, rated: ratedCount, counts,
      participation: eligible ? ratedCount / eligible : null,
      average: ratedCount ? totalStars / ratedCount : null,
      records: rated.slice().sort((a,b) => b.ratedAt.localeCompare(a.ratedAt) || a.reference.localeCompare(b.reference)).slice(0,8),
      scopeLocations: manager ? ["main"] : location === "all" ? ["main", "north"] : [location],
    };
  }
  function validate() {
    const all = selectData({ period: "sep" });
    const main = selectData({ period: "sep", location: "main" });
    const north = selectData({ period: "sep", location: "north" });
    return all.eligible === 120 && all.rated === 78 && all.counts.join(",") === "30,24,14,7,3"
      && all.average === 305 / 78 && all.participation === 0.65
      && main.eligible === 70 && main.rated === 48
      && north.eligible === 50 && north.rated === 30
      && all.counts.every((n,i) => n === main.counts[i] + north.counts[i])
      && selectData({ period: "aug" }).average === null
      && selectData({ period: "sep", state: "empty" }).average === null;
  }
  if (!validate()) throw new Error("VAYLET #313 fixture invariant failed");
  window.VAYLET313 = Object.freeze({
    selectData, localeText, locationSpecs: Object.freeze(locationSpecs),
    availablePeriods: Object.freeze(["sep", "oct", "aug"]),
    validate,
  });
})();
