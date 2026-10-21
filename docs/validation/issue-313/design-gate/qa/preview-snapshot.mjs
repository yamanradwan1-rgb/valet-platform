export function similarCss(a, b, path = "") {
  if (a == null || b == null) return ["baseline comparison missing " + path];
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return ["changed array size " + path];
    return a.flatMap((item, index) => similarCss(item, b[index], path + "[" + index + "]"));
  }
  if (typeof a !== "object") {
    return a === b ? [] : [path + ": " + JSON.stringify(b) + " vs baseline " + JSON.stringify(a)];
  }
  return Object.keys(a).flatMap((key) => {
    const candidate = path ? path + "." + key : key;
    if (typeof a[key] === "object" && a[key] !== null && !Array.isArray(a[key]))
      return similarCss(a[key], b[key], candidate);
    return similarCss(a[key], b[key], candidate);
  });
}

/* The Dashboard scrolls *inside* main.content. Playwright fullPage/element
   screenshots alone capture the viewport and may show blank offscreen pixels.
   Stitch actual viewport pixels from this bounded scroll region to preserve
   the complete KPI -> Feedback -> Charts flow in one honest browser image. */
async function screenshotScrollableMain(page, file) {
  const region = await page.evaluate(() => {
    const scroller = document.querySelector("main.content");
    if (!scroller) return null;
    scroller.scrollTop = 0;
    const rect = scroller.getBoundingClientRect();
    return {
      x: rect.left, y: rect.top, width: rect.width,
      height: rect.height, scrollHeight: scroller.scrollHeight,
      clientHeight: scroller.clientHeight, scale: devicePixelRatio,
    };
  });
  if (!region) {
    await page.screenshot({ path: file, animations: "disabled", fullPage: true });
    return;
  }
  const maxScroll = Math.max(0, region.scrollHeight - region.clientHeight);
  const step = Math.max(100, Math.floor(region.clientHeight * .82));
  const targets = [];
  for (let y = 0; y < maxScroll; y += step) targets.push(y);
  targets.push(maxScroll);
  const chunks = [];
  let previous = -1;
  for (const target of targets) {
    const actual = await page.evaluate(async (desired) => {
      const scroller = document.querySelector("main.content");
      scroller.scrollTop = desired;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return scroller.scrollTop;
    }, target);
    if (actual === previous) continue;
    previous = actual;
    const buffer = await page.screenshot({ type: "jpeg", quality: 86,
      animations: "disabled", fullPage: false });
    chunks.push({ y: actual, jpeg: buffer.toString("base64") });
  }
  const base64 = await page.evaluate(async ({ frames, region: geometry }) => {
    const width = Math.max(1, Math.round(geometry.width * geometry.scale));
    const height = Math.max(1, Math.round(geometry.scrollHeight * geometry.scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Screenshot compositor unavailable");
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, width, height);
    for (const item of frames) {
      const bitmap = new Image();
      bitmap.src = "data:image/jpeg;base64," + item.jpeg;
      await bitmap.decode();
      ctx.drawImage(bitmap,
        Math.round(geometry.x * geometry.scale), Math.round(geometry.y * geometry.scale),
        width, Math.round(geometry.height * geometry.scale),
        0, Math.round(item.y * geometry.scale),
        width, Math.round(geometry.height * geometry.scale));
    }
    return canvas.toDataURL("image/png").split(",")[1];
  }, { frames: chunks, region });
  writeFileSync(file, Buffer.from(base64, "base64"));
  await page.evaluate(() => { document.querySelector("main.content").scrollTop = 0; });
}

export async function snapshot(page) {
  return page.evaluate(() => {
    function exact(selector) {
      return Array.from(document.querySelectorAll(selector));
    }
    const grid = document.querySelector('[data-testid="analytics-card-grid"]')
      ?? document.querySelector(".cards");
    const cards = exact('[data-testid="analytics-metric-card"]');
    const charts = document.querySelector('[data-testid="analytics-chart-grid"]')
      ?? document.querySelector(".charts");
    const panels = exact('[data-testid="analytics-chart-panel"]');
    const feedback = document.querySelector('[data-testid="customer-feedback-section"]')
      ?? document.querySelector("#customer-feedback")
      ?? document.querySelector(".customer-feedback");
    const rect = (node) => node ? node.getBoundingClientRect().toJSON() : null;
    const css = (node, fields) => node ? Object.fromEntries(fields.map((field) =>
      [field, getComputedStyle(node).getPropertyValue(field).trim()])) : null;
    const cardCss = cards.map((card) => ({
      card: css(card, ["padding", "border-radius", "background-color", "border-color", "min-width"]),
      value: css(card.querySelector('[data-testid="analytics-card-value"]'), ["font-size", "line-height", "font-weight"]),
      label: css(card.querySelector('[data-testid="analytics-card-label"]'), ["font-size", "line-height", "font-weight"]),
    }));
    const labels = cards.map((card) =>
      card.querySelector('[data-testid="analytics-card-label"]')?.textContent?.trim() ?? "");
    const focusables = exact('button:not([disabled]),input:not([disabled]),select:not([disabled]),a[href],summary,[tabindex="0"]')
      .filter((item) => item.getClientRects().length && getComputedStyle(item).visibility !== "hidden").length;
    const html = document.documentElement;
    const content = document.querySelector("main") ?? document.body;
    return {
      lang: html.lang, dir: html.dir, theme: html.dataset.theme ?? null,
      title: document.querySelector("h1")?.textContent?.trim() ?? null,
      bodyText: content.innerText,
      cardCount: cards.length, labels, panelCount: panels.length,
      frame: {
        innerWidth, dpr: devicePixelRatio,
        visualScale: visualViewport?.scale ?? null,
        cssZoom: html.style.zoom,
        rootScroll: html.scrollWidth, rootClient: html.clientWidth,
        bodyScroll: document.body.scrollWidth,
      },
      shell: {
        sidebar: Boolean(document.querySelector(".sidebar, .shell-sidebar, [data-testid='dashboard-sidebar']")),
        topbar: Boolean(document.querySelector(".topbar, .shell-topbar, [data-testid='dashboard-topbar']")),
      },
      geometry: { grid: rect(grid), feedback: rect(feedback), charts: rect(charts),
        cards: cards.map(rect), chartPanels: panels.map(rect) },
      css: {
        grid: css(grid, ["display", "gap", "grid-template-columns"]),
        cards: cardCss,
        charts: css(charts, ["display", "gap", "grid-template-columns"]),
        panels: panels.map((p) => css(p, ["padding", "border-radius", "background-color", "border-color"])),
      },
      focusables, visibleFeedback: Boolean(feedback && feedback.getClientRects().length),
      frozenHtml: {
        header: document.querySelector('[data-testid="md05-analytics-page"] > .header')?.outerHTML ?? null,
        cards: grid?.outerHTML ?? null,
        charts: charts?.outerHTML ?? null,
      },
      feedbackHeadings: feedback
        ? [...feedback.querySelectorAll("h2,h3,h4")].map((h) => h.textContent?.trim())
        : [],
      feedbackText: feedback?.innerText ?? "",
      interactiveCount: feedback
        ? feedback.querySelectorAll("button,select,input,summary,a[href]").length
        : 0,
    };
  });
}

export function checkSnap(record, baseline, failures, pending) {
  const { sample: v, mode, option } = record;
  const problems = [...record.problems];
  const uncertainties = [...record.uncertainties];
  const originalEn = ["Cars Handled", "Avg. Retrieval Wait", "SLA Compliance", "Incidents"];
  const originalAr = ["السيارات المُنجزة", "متوسط انتظار الاسترجاع", "الالتزام باتفاقية الخدمة", "الحوادث"];
  if (v.cardCount !== 4) problems.push("original KPI cards expected exactly four; got " + v.cardCount);
  if (v.panelCount !== 2) problems.push("original charts expected exactly two; got " + v.panelCount);
  if (v.cardCount === 4 && JSON.stringify(v.labels) !== JSON.stringify(mode.lang === "ar" ? originalAr : originalEn))
    problems.push("original KPI order or locale differs: " + v.labels.join(" | "));
  if (v.lang !== mode.lang || v.dir !== (mode.lang === "ar" ? "rtl" : "ltr"))
    problems.push("locale/dir failed " + v.lang + "/" + v.dir);
  if (v.theme && v.theme !== mode.theme) problems.push("dark/light theme not applied");
  if (mode.lang === "ar" && !/[\u0600-\u06ff]/u.test(v.bodyText))
    problems.push("Arabic content not translated");
  if (!v.visibleFeedback) problems.push("Customer Feedback section missing/not visible");
  if (/\bundefined\b|\bNaN\b|\[object Object\]/u.test(v.feedbackText))
    problems.push("unresolved data placeholder (undefined / NaN / object) visible");
  if (!v.shell.sidebar || !v.shell.topbar)
    uncertainties.push("shell must be manually compared; canonical sidebar/topbar hooks not found");
  const { grid, feedback, charts } = v.geometry;
  if (grid && feedback && charts) {
    if (grid.bottom > feedback.top + 3 || feedback.bottom > charts.top + 3)
      problems.push("insertion order cards -> feedback -> charts violated");
  } else problems.push("missing geometry hooks for original cards/feedback/charts");
  if (mode.width / (record.native ? 2 : 1) >= 320 && v.frame.rootScroll > v.frame.rootClient + 1)
    problems.push("horizontal root overflow " + v.frame.rootScroll + "/" + v.frame.rootClient);
  if (v.focusables < 2) problems.push("fewer than two visible keyboard controls");
  if (!/DEMO|Illustrative|تجريبية|توضيحية/u.test(v.bodyText)) problems.push("synthetic data disclosure not visible");
  if (/\bNPS\b|\bCSAT\b|sentiment|Google rating|AI review|تحليل المشاعر/iu.test(v.bodyText))
    problems.push("unapproved inferred metric or rating source visible");
  if (/\b(?:\+?\d{1,3}[- .]?)?\d{8,13}\b/u.test(v.bodyText))
    uncertainties.push("long numeric token visible; review for PII false-positive");
  if (baseline && v.cardCount === 4 && v.panelCount === 2) {
    problems.push(...similarCss({cards:baseline.css.cards,panels:baseline.css.panels},
      {cards:v.css.cards,panels:v.css.panels}).map((x) => "frozen CSS: " + x));
    for (const name of ["cards", "charts"]) {
      if (v.frozenHtml[name] !== baseline.frozenHtml[name])
        problems.push("frozen " + name + " DOM changed against same-period baseline");
    }
    if (v.frozenHtml.header !== baseline.frozenHtml.header)
      problems.push("frozen Analytics header DOM changed against baseline");
  } else if (!baseline && mode.lang === "en" && mode.theme === "light" && mode.width === 1440
    && !record.native) uncertainties.push("no rendered baseline yet; frozen CSS comparison unavailable");
  record.problems = problems;
  record.uncertainties = uncertainties;
  for (const error of problems) failures.push("option " + option + " " + record.id + ": " + error);
  for (const unknown of uncertainties) pending.push("option " + option + " " + record.id + ": " + unknown);
}
