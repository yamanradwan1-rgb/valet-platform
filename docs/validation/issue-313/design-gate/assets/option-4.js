/* VAYLET #313, Option 4: data-bound, offline design prototype only. */
(function () {
  "use strict";

  const root = document.querySelector('[data-testid="customer-feedback-section"]');
  if (!root || !window.VAYLET313_RUNTIME || !window.VAYLET313) return;

  const get = (name) => root.querySelector(`[data-f4="${name}"]`);
  const test = (name) => root.querySelector(`[data-testid="${name}"]`);
  const translations = {
    en: {
      eyebrow: "GUEST EXPERIENCE / EXECUTIVE VIEW",
      period: "Completed visits",
      outOf: "/ 5",
      total: "Submitted ratings",
      starShare: "Share of submitted ratings",
      historyHint: "Latest submitted ratings · visit references only",
      noHistory: "There are no submitted ratings to display.",
      summaryHint: "Based on visits with an actual rating",
      participateHint: "Of all eligible completed visits",
      rate: "Rating",
    },
    ar: {
      eyebrow: "تجربة الضيف / ملخص الإدارة",
      period: "الزيارات المكتملة",
      outOf: "/ ٥",
      total: "التقييمات المستلمة",
      starShare: "النسبة من إجمالي التقييمات المستلمة",
      historyHint: "أحدث التقييمات · مراجع الزيارات فقط",
      noHistory: "لا توجد تقييمات مستلمة لعرضها.",
      summaryHint: "استنادًا إلى الزيارات التي لديها تقييم فعلي",
      participateHint: "من إجمالي الزيارات المكتملة المؤهلة",
      rate: "التقييم",
    },
  };
  const integer = (count) => String(count);
  const pct = (ratio) => ratio === null ? "—" : `${(ratio * 100).toFixed(1).replace(/\.0$/, "")}%`;

  function element(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = value;
    return node;
  }

  function locationText(location, lang, tr) {
    if (location === "all") return tr.all;
    const item = window.VAYLET313.locationSpecs.find((entry) => entry.id === location);
    return item ? item[lang] : tr.unavailable;
  }

  function drawDistribution(data, tr, lang) {
    const bars = test("feedback-distribution");
    bars.setAttribute("aria-label", tr.distribution);
    bars.replaceChildren();
    for (let index = 0; index < 5; index += 1) {
      const stars = 5 - index;
      const count = data.counts[index];
      const share = data.rated ? count / data.rated : 0;
      const row = element("div", "f4-bar-row");
      row.setAttribute("role", "listitem");
      row.setAttribute("aria-label", `${stars} ${stars === 1 ? tr.star : tr.stars}: ${count} ${tr.visits}, ${pct(share)}`);

      const starLabel = element("span", "f4-star-key", String(stars));
      starLabel.append(element("span", "", " ★"));
      const track = element("div", "f4-bar-track");
      track.setAttribute("aria-hidden", "true");
      const fill = element("div", "f4-bar-fill");
      fill.style.width = `${share * 100}%`;
      track.append(fill);
      row.append(starLabel, track, element("span", "f4-bar-count", integer(count)), element("span", "f4-bar-percent", pct(share)));
      bars.append(row);
    }
    get("distribution-note").textContent = translations[lang].starShare;
  }

  function drawHistory(data, tr, lang) {
    const history = test("feedback-recent-list");
    history.replaceChildren();
    if (data.records.length === 0) {
      const empty = element("li", "feedback-empty", data.eligible === 0 ? tr.noEligible : tr.noRatings);
      history.append(empty);
      return;
    }
    for (const visit of data.records.slice(0, 5)) {
      const item = element("li", "f4-visit");
      const detail = element("div", "");
      const reference = element("div", "f4-visit-ref feedback-identifier", visit.reference);
      reference.setAttribute("dir", "ltr");
      const location = window.VAYLET313.locationSpecs.find((entry) => entry.id === visit.locationId);
      detail.append(reference, element("div", "f4-visit-location", location ? location[lang] : tr.unavailable));

      const dates = element("div", "f4-visit-meta");
      dates.append(`${tr.completed}: `);
      const completed = element("bdi", "feedback-identifier", visit.completedAt);
      completed.setAttribute("dir", "ltr");
      dates.append(completed, ` · ${tr.submitted}: `);
      const rated = element("bdi", "feedback-identifier", visit.ratedAt);
      rated.setAttribute("dir", "ltr");
      dates.append(rated);
      detail.append(dates);

      const score = element("div", "");
      const ratingStars = element("div", "f4-visit-stars", "★".repeat(visit.rating) + "☆".repeat(5 - visit.rating));
      ratingStars.setAttribute("aria-hidden", "true");
      const readableScore = element("span", "f4-visit-score", `${visit.rating} / 5`);
      readableScore.setAttribute("aria-label", `${translations[lang].rate}: ${visit.rating} ${visit.rating === 1 ? tr.star : tr.stars}`);
      score.append(ratingStars, readableScore);
      item.append(detail, score);
      history.append(item);
    }
  }

  let controller;
  const retry = element("button", "", "");
  retry.type = "button";
  retry.addEventListener("click", () => {
    controller?.setValues({ state: "live" });
    root.querySelector('[data-feedback-control="state"]')?.focus();
  });

  function render(data, tr, lang) {
    const strings = translations[lang];
    get("eyebrow").textContent = strings.eyebrow;
    get("title").textContent = tr.heading;
    get("demo").textContent = tr.demo;
    get("context").textContent = `${locationText(data.location, lang, tr)} · ${tr[data.period === "2026-08" ? "aug" : data.period === "2026-10" ? "oct" : "sep"]} · ${strings.period}`;
    get("average-label").textContent = tr.average;
    get("distribution-label").textContent = tr.distribution;
    get("history-label").textContent = tr.recent;
    get("participation-label").textContent = tr.participation;
    get("sample-label").textContent = strings.total;
    get("eligible-label").textContent = tr.eligible;
    get("rated-label").textContent = tr.rated;
    get("summary-hint").textContent = strings.summaryHint;
    get("participation-hint").textContent = strings.participateHint;
    get("history-hint").textContent = strings.historyHint;
    get("cohort").textContent = tr.cohort;
    get("average-scale").textContent = strings.outOf;

    const unavailable = ["loading", "error", "denied"].includes(data.status);
    const state = test("feedback-state");
    state.hidden = !unavailable;
    get("grid").hidden = unavailable;
    state.replaceChildren();
    if (unavailable) {
      state.append(element("p", "", tr[data.status]));
      if (data.status === "error") {
        retry.textContent = tr.retry;
        state.append(retry);
      }
      return;
    }

    test("feedback-avg").textContent = data.average === null ? "—" : data.average.toFixed(2);
    test("feedback-sample-count").textContent = integer(data.rated);
    test("feedback-eligible-count").textContent = integer(data.eligible);
    get("rated-count").textContent = integer(data.rated);
    get("participation-value").textContent = pct(data.participation);
    get("stars").textContent = data.average === null ? "☆☆☆☆☆" :
      "★".repeat(Math.round(data.average)) + "☆".repeat(5 - Math.round(data.average));
    const track = get("participation-track");
    track.setAttribute("aria-label", tr.participation);
    track.setAttribute("aria-valuenow", data.participation === null ? "0" : String(Math.round(data.participation * 100)));
    track.setAttribute("aria-valuetext", data.participation === null ? tr.unavailable : pct(data.participation));
    get("participation-fill").style.width = data.participation === null ? "0%" : `${data.participation * 100}%`;
    drawDistribution(data, tr, lang);
    drawHistory(data, tr, lang);
    get("summary-hint").textContent = data.eligible === 0 ? tr.noEligible : data.rated === 0 ? tr.noRatings : strings.summaryHint;
  }

  // Common runtime rebuilds the native selects on each change; keep keyboard focus.
  root.addEventListener("change", (event) => {
    const name = event.target?.dataset?.feedbackControl;
    if (!name) return;
    queueMicrotask(() => {
      const replacement = root.querySelector(`[data-feedback-control="${name}"]`);
      (replacement?.disabled ? root.querySelector('[data-feedback-control="role"]') : replacement)?.focus();
    });
  }, true);
  controller = window.VAYLET313_RUNTIME.mount(root, render);
})();
