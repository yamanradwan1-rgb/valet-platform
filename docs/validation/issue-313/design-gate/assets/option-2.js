/* VAYLET #313 option 2 — statistical distribution first; synthetic local data only. */
(function () {
  "use strict";
  const root = document.querySelector('[data-testid="customer-feedback-section"]');
  if (!root) return;

  const copy = {
    en: {
      kicker: "FEEDBACK INSIGHTS / 02", breakdown: "How ratings are distributed",
      breakout: "Distribution among submitted ratings", perspective: "Evidence behind the score",
      scoreHint: "of 5 stars", coverageTitle: "Rating coverage", distributionBasis: "Share of rated visits",
      scale: "Bar lengths scaled to the most frequent rating; percentages use rated visits.",
      scopeTitle: "Viewing", completionTitle: "Completed in", averageTitle: "Average score",
      newest: "Latest submitted ratings", sample: "Rated", eligible: "Eligible", shown: "shown",
      submittedLabel: "Submitted", completedLabel: "Completed", zero: "No measured rating",
      recentEmpty: "No visit ratings to show for this selection.",
      ready: "Ready", empty: "No ratings", none: "No eligible visits",
      loading: "Loading", error: "Unavailable", denied: "Access denied",
      foot: "Each completed visit can have one 1–5 star rating. The visit's local completion date determines its period.",
    },
    ar: {
      kicker: "تحليل التقييمات / ٠٢", breakdown: "كيف تتوزع التقييمات؟",
      breakout: "التوزيع بين التقييمات المُرسلة", perspective: "البيانات التي تستند إليها النتيجة",
      scoreHint: "من ٥ نجوم", coverageTitle: "تغطية التقييمات", distributionBasis: "الحصة من الزيارات المقيّمة",
      scale: "أطوال الأشرطة نسبةً إلى التقييم الأكثر تكرارًا، والنسب من الزيارات المقيّمة.",
      scopeTitle: "النطاق", completionTitle: "اكتملت في", averageTitle: "متوسط النتيجة",
      newest: "أحدث التقييمات المُرسلة", sample: "مقيّمة", eligible: "مؤهلة", shown: "معروضة",
      submittedLabel: "إرسال التقييم", completedLabel: "اكتمال الزيارة", zero: "لا يوجد متوسط مقاس",
      recentEmpty: "لا توجد تقييمات زيارات لعرضها ضمن هذا الاختيار.",
      ready: "جاهزة", empty: "بدون تقييمات", none: "بدون زيارات مؤهلة",
      loading: "جارٍ التحميل", error: "غير متاح", denied: "الوصول مرفوض",
      foot: "كل زيارة مكتملة تقبل تقييمًا واحدًا من ١ إلى ٥. يُحدد تاريخ اكتمال الزيارة المحلي فترة العرض.",
    },
  };

  function element(tag, className, value) {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (value !== undefined) item.textContent = value;
    return item;
  }

  function append(parent, tag, className, value) {
    const child = element(tag, className, value);
    parent.append(child);
    return child;
  }

  function statNumber(value, lang) {
    return value === null ? "—" : new Intl.NumberFormat(lang === "ar" ? "ar-JO" : "en-US").format(value);
  }

  function fraction(value, lang) {
    return value === null ? "—" : new Intl.NumberFormat(lang === "ar" ? "ar-JO" : "en-US", {
      style: "percent", maximumFractionDigits: 0,
    }).format(value);
  }

  function starGlyph(count) {
    return "★".repeat(count);
  }

  function distribution(container, data, tr, ui, lang, present, available) {
    container.replaceChildren();
    const top = append(container, "div", "in-panel-head");
    append(top, "p", "in-overline", ui.breakout);
    append(top, "h3", "in-panel-title", ui.breakdown);
    const legend = append(container, "p", "in-panel-caption", ui.distributionBasis);
    legend.id = "in-distribution-caption";

    if (!available) {
      append(container, "p", "in-placeholder", tr[data.status] || tr.unavailable);
      return;
    }
    if (!present) {
      append(container, "p", "in-placeholder", data.eligible ? tr.noRatings : tr.noEligible);
      return;
    }

    const bars = append(container, "div", "in-bars");
    bars.setAttribute("role", "list");
    bars.setAttribute("aria-describedby", legend.id);
    const largest = Math.max(...data.counts);
    for (let index = 0; index < 5; index++) {
      const rating = 5 - index;
      const count = data.counts[index];
      const row = append(bars, "div", "in-bar-row");
      row.setAttribute("role", "listitem");
      row.setAttribute("aria-label", `${rating} ${rating === 1 ? tr.star : tr.stars}: ${count} ${tr.visits}, ${fraction(count / data.rated, lang)}`);
      const descriptor = append(row, "span", "in-star-label");
      append(descriptor, "span", "in-star-digit", statNumber(rating, lang));
      append(descriptor, "span", "in-star-icon", "★").setAttribute("aria-hidden", "true");
      const track = append(row, "div", "in-track");
      track.setAttribute("aria-hidden", "true");
      const fill = append(track, "div", `in-fill in-fill-${rating}`);
      fill.style.width = `${count / largest * 100}%`;
      const number = append(row, "span", "in-count", statNumber(count, lang));
      number.setAttribute("dir", "ltr");
      append(row, "span", "in-percent", fraction(count / data.rated, lang));
    }
    append(container, "p", "in-scale-note", ui.scale);
  }

  function coverage(container, data, tr, ui, lang, present, available) {
    container.replaceChildren();
    append(container, "p", "in-overline", ui.perspective);
    append(container, "h3", "in-panel-title", ui.coverageTitle).id = "feedback-coverage-heading";
    const ratio = append(container, "div", "in-coverage-rate", available ? fraction(data.participation, lang) : "—");
    ratio.setAttribute("aria-label", `${tr.participation}: ${ratio.textContent}`);
    append(container, "p", "in-muted", tr.coverage);
    const progress = append(container, "div", "in-coverage-track");
    progress.setAttribute("role", "progressbar");
    progress.setAttribute("aria-label", tr.participation);
    progress.setAttribute("aria-valuemin", "0");
    progress.setAttribute("aria-valuemax", "100");
    if (available && data.participation !== null) {
      progress.setAttribute("aria-valuenow", String(Math.round(data.participation * 100)));
    } else {
      progress.setAttribute("aria-valuetext", tr.unavailable);
    }
    append(progress, "span", "in-coverage-fill").style.width = available && data.participation !== null
      ? `${data.participation * 100}%` : "0%";

    const counts = append(container, "div", "in-denominator");
    const rated = append(counts, "div", "in-denominator-cell");
    const sampleValue = append(rated, "strong", "in-denominator-number", available ? statNumber(data.rated, lang) : "—");
    sampleValue.dataset.testid = "feedback-sample-count";
    append(rated, "span", "in-muted", ui.sample);
    const eligible = append(counts, "div", "in-denominator-cell");
    const eligibleValue = append(eligible, "strong", "in-denominator-number", available ? statNumber(data.eligible, lang) : "—");
    eligibleValue.dataset.testid = "feedback-eligible-count";
    append(eligible, "span", "in-muted", ui.eligible);

    const score = append(container, "div", "in-average-line");
    const scoreValue = append(score, "strong", "in-average-number", present && available
      ? new Intl.NumberFormat(lang === "ar" ? "ar-JO" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(data.average)
      : "—");
    scoreValue.dataset.testid = "feedback-avg";
    const scoreLabel = append(score, "div", "in-average-label");
    append(scoreLabel, "strong", "", ui.averageTitle);
    append(scoreLabel, "span", "in-muted", present && available ? ui.scoreHint : ui.zero);
  }

  function recent(container, data, tr, ui, lang, available) {
    container.replaceChildren();
    const heading = append(container, "div", "in-recent-head");
    append(heading, "h3", "in-panel-title", ui.newest);
    append(heading, "span", "in-recent-count", `${available ? statNumber(Math.min(data.records.length, 5), lang) : "—"} ${ui.shown}`);
    if (!available || !data.records.length) {
      append(container, "p", "in-recent-empty", available ? ui.recentEmpty : tr[data.status]);
      return;
    }
    const list = append(container, "ul", "in-recent-list");
    for (const record of data.records.slice(0, 5)) {
      const item = append(list, "li", "in-recent-item");
      const meta = append(item, "div", "in-recent-meta");
      append(meta, "strong", "in-reference", record.reference).setAttribute("dir", "ltr");
      append(meta, "span", "in-location", tr[record.locationId]);
      const dates = append(item, "div", "in-date-pair");
      const completion = append(dates, "span", "", `${ui.completedLabel} `);
      append(completion, "bdi", "in-date", record.completedAt).setAttribute("dir", "ltr");
      const submitted = append(dates, "span", "", `${ui.submittedLabel} `);
      append(submitted, "bdi", "in-date", record.ratedAt).setAttribute("dir", "ltr");
      const rating = append(item, "span", "in-recent-stars");
      rating.setAttribute("role", "img");
      rating.setAttribute("aria-label", `${statNumber(record.rating, lang)} ${record.rating === 1 ? tr.star : tr.stars}`);
      rating.setAttribute("dir", "ltr");
      append(rating, "span", "", starGlyph(record.rating)).setAttribute("aria-hidden", "true");
    }
  }

  function render(data, tr, lang) {
    const ui = copy[lang];
    const available = !["loading", "error", "denied"].includes(data.status);
    const present = available && data.rated > 0;
    const state = data.status === "live" ? (data.eligible === 0 ? "none" : data.rated === 0 ? "empty" : "ready") : data.status;
    root.querySelector(".in-eyebrow").textContent = ui.kicker;
    root.querySelector("#feedback-heading").textContent = tr.heading;
    root.querySelector(".feedback-demo-label").textContent = tr.demo;
    const stateNode = root.querySelector('[data-testid="feedback-state"]');
    stateNode.textContent = ui[state];
    stateNode.dataset.status = state;
    const context = root.querySelector(".in-context");
    context.replaceChildren();
    const scope = data.role === "manager" ? tr.manager : data.location === "all" ? tr.company
      : `${lang === "ar" ? "مسؤول الشركة" : "Company Admin"} · ${tr[data.location]}`;
    append(context, "span", "", `${ui.scopeTitle}: ${scope}`);
    append(context, "span", "", `${ui.completionTitle}: ${tr[data.period === "2026-08" ? "aug" : data.period === "2026-10" ? "oct" : "sep"]}`);
    distribution(root.querySelector('[data-testid="feedback-distribution"]'), data, tr, ui, lang, present, available);
    coverage(root.querySelector(".in-aside"), data, tr, ui, lang, present, available);
    recent(root.querySelector('[data-testid="feedback-recent-list"]'), data, tr, ui, lang, available);
    root.querySelector(".in-footnote").textContent = ui.foot;
  }

  window.VAYLET313_RUNTIME.mount(root, render);
})();
