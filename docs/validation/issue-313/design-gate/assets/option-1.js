/* VAYLET #313: isolated summary-first proposal. All metrics derive from shared fixture. */
(function () {
  "use strict";

  const root = document.querySelector('[data-testid="customer-feedback-section"]');
  if (!root || !window.VAYLET313_RUNTIME || !window.VAYLET313) return;

  const heading = root.querySelector("[data-feedback-heading]");
  const context = root.querySelector("[data-feedback-context]");
  const content = root.querySelector("[data-feedback-content]");
  const demo = root.querySelector("[data-feedback-demo]");
  const announcement = root.querySelector("[data-feedback-announcement]");
  const escape = (value) => String(value).replace(/[&<>"']/g, (match) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[match]);
  const number = (value) => Number(value).toLocaleString("en-US");
  const numeric = (value) => '<bdi dir="ltr">' + escape(number(value)) + "</bdi>";
  const percent = (value) => value === null ? "—" : Math.round(value * 100) + "%";

  function date(iso, language) {
    if (!iso) return "—";
    const formatted = new Intl.DateTimeFormat(language === "ar" ? "ar-JO" : "en-GB", {
      year: "numeric", month: "short", day: "numeric", timeZone: "UTC",
    }).format(new Date(iso + "T12:00:00Z"));
    return escape(formatted);
  }

  function headline(data, tr) {
    heading.textContent = tr.heading;
    demo.textContent = tr.demo;
    const chosen = data.location === "all" ? tr.all : tr[data.location];
    const periodKey = { "2026-08": "aug", "2026-09": "sep", "2026-10": "oct" }[data.period];
    context.textContent = chosen + " · " + (tr[periodKey] || data.period);
  }

  function stateMessage(data, tr, controller) {
    const label = data.status === "loading" ? tr.loading
      : data.status === "error" ? tr.error : tr.denied;
    content.setAttribute("aria-busy", String(data.status === "loading"));
    content.innerHTML = '<div class="f1-surface f1-status" data-testid="feedback-state">' +
      "<p>" + escape(label) + "</p>" +
      (data.status === "error" ? '<button type="button" class="f1-retry">' + escape(tr.retry) + "</button>" : "") +
      "</div>";
    const retry = content.querySelector(".f1-retry");
    if (retry) retry.addEventListener("click", () => controller.setValues({ state: "live" }));
  }

  function distribution(data, tr) {
    const rows = [5, 4, 3, 2, 1].map((stars, index) => {
      const count = data.counts[index];
      const share = data.rated ? count / data.rated * 100 : 0;
      const label = stars + " " + (stars === 1 ? tr.star : tr.stars);
      return '<div class="f1-dist-row" role="listitem" aria-label="' +
        escape(label + ": " + count) + '">' +
        '<span class="f1-dist-star">' + stars + ' <span aria-hidden="true">★</span></span>' +
        '<div class="f1-dist-track" aria-hidden="true"><span style="width:' +
        share.toFixed(2) + '%"></span></div>' +
        '<span class="f1-dist-count">' + numeric(count) + "</span></div>";
    });
    return '<div class="f1-insight-card">' +
      '<h3 class="f1-insight-title">' + escape(tr.distribution) + "</h3>" +
      '<div class="f1-distribution" data-testid="feedback-distribution" role="list">' +
      rows.join("") + "</div>" +
      '<p class="f1-note">' + escape(tr.sample) + ": " + numeric(data.rated) + "</p></div>";
  }

  function history(data, tr, language) {
    const items = data.records.slice(0, 4).map((record) => {
      const location = tr[record.locationId];
      return '<div class="f1-recent-item" role="listitem">' +
        '<div><div class="f1-recent-id feedback-identifier">' + escape(record.reference) + "</div>" +
        '<p class="f1-recent-meta">' + escape(location) + " · " + escape(tr.completed) +
        " " + date(record.completedAt, language) + "<br>" +
        escape(tr.submitted) + " " + date(record.ratedAt, language) + "</p></div>" +
        '<span class="f1-rating-chip" role="img" aria-label="' + record.rating + " " +
        escape(record.rating === 1 ? tr.star : tr.stars) +
        '">' + record.rating + ' <span aria-hidden="true">★</span></span></div>';
    });
    const empty = data.eligible ? tr.noRatings : tr.noEligible;
    return '<div class="f1-insight-card">' +
      '<h3 class="f1-insight-title">' + escape(tr.recent) + "</h3>" +
      '<div class="f1-recent-list" role="list" data-testid="feedback-recent-list">' +
      (items.length ? items.join("") : '<div class="feedback-empty">' + escape(empty) + "</div>") +
      "</div></div>";
  }

  function summary(data, tr, language) {
    content.setAttribute("aria-busy", "false");
    const hasRatings = data.average !== null;
    const score = hasRatings ? data.average.toFixed(2) : "—";
    const stars = hasRatings ? "★".repeat(Math.round(data.average)) +
      "☆".repeat(5 - Math.round(data.average)) : "☆☆☆☆☆";
    const participation = data.participation === null ? tr.unavailable :
      percent(data.participation);
    const coverageLabel = data.rated + " / " + data.eligible;
    const progress = data.participation === null ? "" :
      ' role="progressbar" aria-label="' + escape(tr.participation) +
      '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' +
      Math.round(data.participation * 100) + '"';
    content.innerHTML =
      '<div class="f1-surface" data-testid="feedback-state" data-state="' +
      escape(data.status === "live" ? "ready" : data.status) + '">' +
      '<div class="f1-summary-layout">' +
      '<div class="f1-score"><p class="f1-eyebrow">' + escape(tr.average) + "</p>" +
      '<div class="f1-average-line"><span class="f1-average" data-testid="feedback-avg">' +
      escape(score) + '</span><span class="f1-outof">/ 5</span></div>' +
      '<div class="f1-stars" aria-hidden="true">' + stars + "</div>" +
      '<p class="f1-score-caption">' + escape(hasRatings ? tr.sample : tr.unavailable) +
      " · " + numeric(data.rated) + "</p></div>" +
      '<div class="f1-coverage"><div><p class="f1-eyebrow">' +
      escape(tr.participation) + "</p>" +
      '<div class="f1-coverage-line"><span class="f1-coverage-fraction feedback-identifier">' +
      '<span data-testid="feedback-sample-count">' + numeric(data.rated) +
      '</span> / <span data-testid="feedback-eligible-count">' + numeric(data.eligible) +
      '</span></span><span class="f1-cover-percent">' + escape(participation) + "</span></div>" +
      '<p class="f1-coverage-copy">' + escape(tr.coverage) + "</p></div>" +
      '<div class="f1-track"' + progress + '><span style="width:' +
      (data.participation === null ? "0" : (data.participation * 100).toFixed(2)) +
      '%"></span></div></div></div></div>' +
      '<div class="f1-insights">' + distribution(data, tr) + history(data, tr, language) +
      "</div>" +
      '<p class="f1-note">' + escape(tr.cohort) + "</p>";
    if (!hasRatings) {
      const notice = document.createElement("p");
      notice.className = "f1-note";
      notice.textContent = data.eligible ? tr.noRatings : tr.noEligible;
      content.querySelector(".f1-surface").append(notice);
    }
  }

  let lastAnnouncedState = "live";
  function announceStatus(data, tr) {
    if (data.status === lastAnnouncedState) return;
    lastAnnouncedState = data.status;
    const message = {
      live: tr.live,
      empty: tr.noRatings,
      none: tr.noEligible,
      loading: tr.loading,
      error: tr.error,
      denied: tr.denied,
    };
    announcement.textContent = message[data.status] || "";
  }

  let controller;
  controller = window.VAYLET313_RUNTIME.mount(root, (data, tr, language) => {
    headline(data, tr);
    if (["loading", "error", "denied"].includes(data.status)) {
      stateMessage(data, tr, controller);
    } else {
      summary(data, tr, language);
    }
    announceStatus(data, tr);
  });
})();
