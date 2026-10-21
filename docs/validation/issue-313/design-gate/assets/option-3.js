/* VAYLET #313 — history-first rendering; data and controls come from shared fixture/runtime. */
(function () {
  "use strict";
  const root = document.querySelector('[data-testid="customer-feedback-section"]');
  if (!root) return;

  const get = (selector) => root.querySelector(selector);
  const strings = {
    en: {
      kicker: "VISIT FEEDBACK / 03",
      subtitle: "Recent completed-visit ratings are the focus, with a concise overview alongside.",
      history: "VISIT HISTORY",
      pulse: "QUICK PULSE",
      overview: "Rating overview",
      averageSuffix: "Average rating / 5",
      latest: "Latest {visible} of {rated} rated visits",
      noTable: "No visit ratings to display.",
      ready: "Showing illustrative visits in the authorized Location scope.",
      show: "Showing latest {visible} of {rated} ratings",
      rating: "Rating",
      outOf: "out of 5",
      labels: ["Visit reference", "Location", "Completed", "Rated", "Rating"],
    },
    ar: {
      kicker: "تقييمات الزيارات / ٠٣",
      subtitle: "أحدث تقييمات الزيارات المكتملة أولًا، مع ملخص مختصر إلى جانب السجل.",
      history: "سجل الزيارات",
      pulse: "نظرة سريعة",
      overview: "ملخص التقييمات",
      averageSuffix: "متوسط التقييم / ٥",
      latest: "أحدث {visible} من {rated} زيارات مقيّمة",
      noTable: "لا توجد تقييمات زيارات للعرض.",
      ready: "هذه زيارات تجريبية ضمن المواقع المصرّح بعرضها.",
      show: "عرض أحدث {visible} من {rated} تقييمًا",
      rating: "التقييم",
      outOf: "من ٥",
      labels: ["مرجع الزيارة", "الموقع", "مكتملة في", "تم تقييمها في", "التقييم"],
    },
  };

  function element(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = String(value);
    return node;
  }

  function setText(selector, value) {
    get(selector).textContent = value;
  }

  function visitRef(reference) {
    const bdi = element("bdi", "feedback-identifier fb3-visit-reference", reference);
    bdi.dir = "ltr";
    return bdi;
  }

  function isoDate(date) {
    const bdi = element("bdi", "feedback-identifier", date);
    bdi.dir = "ltr";
    return bdi;
  }

  function ratingNode(rating, s) {
    const wrapper = element("span", "fb3-rating");
    wrapper.setAttribute("aria-label", s.rating + ": " + rating + " " + s.outOf);
    const stars = element("span", "fb3-rating-stars", "★".repeat(rating) + "☆".repeat(5 - rating));
    stars.setAttribute("aria-hidden", "true");
    const number = element("span", "fb3-rating-number", rating + "/5");
    number.setAttribute("aria-hidden", "true");
    wrapper.append(stars, number);
    return wrapper;
  }

  function rowCell(value, className) {
    const td = element("td", className);
    if (value instanceof Node) td.append(value);
    else td.textContent = String(value);
    return td;
  }

  function drawTable(data, tr, s) {
    const table = element("table", "fb3-table");
    const caption = element("caption", "", tr.recent);
    const head = element("thead");
    const headingRow = element("tr");
    for (const name of s.labels) {
      const th = element("th", "", name);
      th.scope = "col";
      headingRow.append(th);
    }
    head.append(headingRow);
    const body = element("tbody");
    for (const record of data.records) {
      const row = element("tr");
      row.append(
        rowCell(visitRef(record.reference)),
        rowCell(tr[record.locationId]),
        rowCell(isoDate(record.completedAt)),
        rowCell(isoDate(record.ratedAt)),
        rowCell(ratingNode(record.rating, s)),
      );
      body.append(row);
    }
    table.append(caption, head, body);
    return table;
  }

  function detailPair(label, value) {
    const wrapper = element("div");
    wrapper.append(element("dt", "", label));
    const dd = element("dd");
    if (value instanceof Node) dd.append(value);
    else dd.textContent = String(value);
    wrapper.append(dd);
    return wrapper;
  }

  function drawMobile(data, tr, s) {
    const list = element("ol", "fb3-mobile-list");
    for (const record of data.records) {
      const card = element("li", "fb3-visit-card");
      const top = element("div", "fb3-visit-top");
      const identification = element("div", "fb3-visit-meta");
      identification.append(element("small", "", tr.visit), visitRef(record.reference));
      top.append(identification, ratingNode(record.rating, s));
      const details = element("dl");
      details.append(
        detailPair(tr.location, tr[record.locationId]),
        detailPair(tr.completed, isoDate(record.completedAt)),
        detailPair(tr.submitted, isoDate(record.ratedAt)),
      );
      card.append(top, details);
      list.append(card);
    }
    return list;
  }

  function drawDistribution(data, tr, canRead) {
    const host = get('[data-testid="feedback-distribution"]');
    const rows = [];
    for (let star = 5; star >= 1; star--) {
      const count = canRead ? data.counts[5 - star] : 0;
      const row = element("div", "fb3-distribution-row");
      row.setAttribute("aria-label", star + " " + (star === 1 ? tr.star : tr.stars) + ": " + (canRead ? count : tr.unavailable));
      row.append(element("span", "", star + "★"));
      const track = element("span", "fb3-dist-track");
      track.setAttribute("aria-hidden", "true");
      const fill = element("span");
      fill.style.width = (data.rated && canRead ? (count / data.rated) * 100 : 0) + "%";
      track.append(fill);
      row.append(track, element("strong", "", canRead ? count : "—"));
      rows.push(row);
    }
    host.replaceChildren(...rows);
  }

  function drawHistory(data, tr, s, canRead) {
    const history = get('[data-testid="feedback-recent-list"]');
    const note = get("#fb3-history-footer");
    if (data.records.length && canRead) {
      history.replaceChildren(drawTable(data, tr, s), drawMobile(data, tr, s));
      const latest = s.show.replace("{visible}", data.records.length).replace("{rated}", data.rated);
      setText("#fb3-record-count", data.records.length + " / " + data.rated);
      note.textContent = latest + " · " + tr.cohort;
      return;
    }
    const message = data.status === "loading" ? tr.loading
      : data.status === "error" ? tr.error
      : data.status === "denied" ? tr.denied
      : !data.eligible ? tr.noEligible : tr.noRatings;
    const empty = element("div", "feedback-empty", message);
    history.replaceChildren(empty);
    setText("#fb3-record-count", canRead ? "0 / " + data.rated : "—");
    note.textContent = canRead ? tr.cohort : "";
  }

  function render(data, tr, language) {
    const s = strings[language];
    const canRead = !["loading", "error", "denied"].includes(data.status);
    setText("#fb3-kicker", s.kicker);
    setText("#fb3-heading", tr.heading);
    setText("#fb3-description", s.subtitle);
    setText("#fb3-demo-label", tr.demo);
    setText("#fb3-record-label", s.history);
    setText("#fb3-list-title", tr.recent);
    setText("#fb3-period-explainer", tr.cohort);
    setText("#fb3-overview-caption", s.pulse);
    setText("#fb3-overview-title", s.overview);
    setText("#fb3-average-label", s.averageSuffix);
    setText("#fb3-sample-label", tr.rated);
    setText("#fb3-eligible-label", tr.eligible);
    setText("#fb3-participation-label", tr.participation);
    setText("#fb3-distribution-title", tr.distribution);
    setText('[data-testid="feedback-avg"]', canRead && data.average !== null ? data.average.toFixed(2) : "—");
    setText('[data-testid="feedback-sample-count"]', canRead ? data.rated : "—");
    setText('[data-testid="feedback-eligible-count"]', canRead ? data.eligible : "—");
    setText("#fb3-participation-value", canRead && data.participation !== null
      ? Math.round(data.participation * 100) + "%" : tr.unavailable);
    get("#fb3-participation-bar").style.width = (canRead && data.participation !== null
      ? data.participation * 100 : 0) + "%";
    drawHistory(data, tr, s, canRead);
    drawDistribution(data, tr, canRead);
    const statusText = data.status === "loading" ? tr.loading
      : data.status === "error" ? tr.error
      : data.status === "denied" ? tr.denied
      : !data.eligible ? tr.noEligible
      : !data.rated ? tr.noRatings : s.ready;
    const status = get('[data-testid="feedback-state"]');
    status.textContent = statusText;
    if (data.status === "error") {
      const retry = element("button", "fb3-retry", tr.retry);
      retry.type = "button";
      retry.addEventListener("click", () => runtime.setValues({ state: "live" }));
      status.append(" ", retry);
    }
  }

  const runtime = window.VAYLET313_RUNTIME.mount(root, render);
})();
