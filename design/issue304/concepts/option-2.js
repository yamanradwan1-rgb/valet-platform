(() => {
  "use strict";

  const root = document.querySelector("[data-opt2-root]");
  const demo = window.VAYLET_304_DATA;
  if (!root || !demo || !Array.isArray(demo.locations)) return;

  const COPY = {
    en: {
      kicker: "OPERATIONS / RESOURCE CONTROL", title: "Keys & Spots",
      subtitle: "Know what is available, where vehicles are held, and what needs attention.",
      sampleData: "Synthetic preview data", previewState: "Preview state",
      currentScope: "Current location", scopeNote: "Location-level resource view",
      keysTitle: "Key slots", spotsTitle: "Parking spots",
      addKey: "Add key slot", addSpot: "Add spot", addZone: "+ Zone",
      dataCaveat: "Availability and configuration are separate. Operational key details are a proposed combined view; no APIs or records are changed.",
      ready: "Ready", loading: "Loading", empty: "Empty", error: "Error",
      activeKeys: "Active key slots", freeKeys: "Keys available", usedKeys: "Keys in use",
      activeSpots: "Active parking spots", freeSpots: "Spots available", usedSpots: "Spots occupied",
      configured: "configured", disabled: "inactive", activeOf: "of",
      emptyState: "No resources in this preview state", emptyHint: "Switch to Ready to see the canonical synthetic records.",
      loadingState: "Loading resource preview…", loadingHint: "Illustrative loading state; no request is sent.",
      errorState: "Unable to load resource preview", errorHint: "Simulated error. The canonical records are unchanged.",
      retry: "Show ready state", resource: "Resource", condition: "Status / use",
      vehicle: "Vehicle / zone", actions: "Actions", active: "Active", inactive: "Inactive",
      available: "Available", inUse: "In use", occupied: "Occupied", unknown: "Unknown",
      unassigned: "Unassigned", unavailable: "No vehicle", identityUnavailable: "Vehicle identity unavailable", details: "Details", qr: "QR",
      location: "Location", label: "Label", code: "Code", zone: "Zone",
      keyType: "KEY SLOT", spotType: "PARKING SPOT",
      cancel: "Close", viewQr: "QR label preview", inspection: "Resource details",
      noLabel: "No label", noHistory: "No illustrative custody events",
      history: "Illustrative custody history", checkedOut: "Checked out", returned: "Returned",
      previewNote: "Design-only preview. No changes are saved.",
      qrDisclaimer: "Non-scannable QR illustration. Print and download are preview-only.",
      print: "Preview print", download: "Preview download",
      createKey: "Add key slot", createSpot: "Add parking spot", createZone: "Add parking zone",
      createPreview: "Preview creation", fakeSave: "Preview only — nothing was saved.",
      hintKey: "The human-friendly key label is a proposed field.",
      hintZone: "A new zone cannot be saved from this design preview.",
      hintSpot: "Choose a representative zone in this design preview.",
      selectZone: "Select zone", close: "Close details",
    },
    ar: {
      kicker: "العمليات / إدارة الموارد", title: "المفاتيح والمواقف",
      subtitle: "اعرف الموارد المتاحة والمركبات المرتبطة بها وما يحتاج إلى متابعة.",
      sampleData: "بيانات تجريبية غير حقيقية", previewState: "حالة المعاينة",
      currentScope: "الموقع الحالي", scopeNote: "عرض الموارد لهذا الموقع",
      keysTitle: "خانات المفاتيح", spotsTitle: "مواقف السيارات",
      addKey: "إضافة خانة مفتاح", addSpot: "إضافة موقف", addZone: "+ منطقة",
      dataCaveat: "التوفر منفصل عن حالة التهيئة. تفاصيل تشغيل المفاتيح المجمعة مقترحة؛ لا تُستخدم واجهات API ولا تُغيَّر بيانات.",
      ready: "جاهز", loading: "جارٍ التحميل", empty: "فارغ", error: "خطأ",
      activeKeys: "خانات مفاتيح نشطة", freeKeys: "مفاتيح متاحة", usedKeys: "مفاتيح قيد الاستخدام",
      activeSpots: "مواقف نشطة", freeSpots: "مواقف متاحة", usedSpots: "مواقف مشغولة",
      configured: "مُهيّأ", disabled: "غير نشط", activeOf: "من أصل",
      emptyState: "لا موارد في حالة المعاينة هذه", emptyHint: "اختر جاهز لعرض السجلات التجريبية الأساسية.",
      loadingState: "جارٍ تحميل المعاينة…", loadingHint: "حالة تحميل توضيحية دون إرسال أي طلب.",
      errorState: "تعذّر عرض الموارد", errorHint: "خطأ تجريبي. السجلات الأساسية لم تتغير.",
      retry: "عرض الحالة الجاهزة", resource: "المورد", condition: "الحالة / الاستخدام",
      vehicle: "المركبة / المنطقة", actions: "إجراءات", active: "نشط", inactive: "غير نشط",
      available: "متاح", inUse: "قيد الاستخدام", occupied: "مشغول", unknown: "غير معروف",
      unassigned: "غير معيّن", unavailable: "لا توجد مركبة", identityUnavailable: "هوية المركبة غير متاحة", details: "التفاصيل", qr: "QR",
      location: "الموقع", label: "التسمية", code: "الرمز", zone: "المنطقة",
      keyType: "خانة مفتاح", spotType: "موقف سيارة",
      cancel: "إغلاق", viewQr: "معاينة ملصق QR", inspection: "تفاصيل المورد",
      noLabel: "دون تسمية", noHistory: "لا توجد حركة عهدة تجريبية",
      history: "سجل عهدة توضيحي", checkedOut: "تسليم", returned: "إرجاع",
      previewNote: "هذه معاينة تصميم فقط. لن تُحفظ أي تغييرات.",
      qrDisclaimer: "رسم توضيحي غير قابل للمسح. الطباعة والتنزيل للمعاينة فقط.",
      print: "معاينة الطباعة", download: "معاينة التنزيل",
      createKey: "إضافة خانة مفتاح", createSpot: "إضافة موقف", createZone: "إضافة منطقة وقوف",
      createPreview: "معاينة الإنشاء", fakeSave: "معاينة فقط — لم تُحفظ أي بيانات.",
      hintKey: "تسمية خانة المفتاح للعرض فقط، وهي حقل مقترح.",
      hintZone: "إنشاء المنطقة غير متاح للحفظ في هذه المعاينة.",
      hintSpot: "اختر منطقة تمثيلية في هذه المعاينة.",
      selectZone: "اختر المنطقة", close: "إغلاق التفاصيل",
    },
  };

  let locale = document.documentElement.lang === "ar" ? "ar" : "en";
  let locationIndex = 0;
  let preview = "ready";
  let selectedDialog = null;
  let returnFocus = null;
  const t = (key) => COPY[locale][key] || key;
  const localized = (value) => value == null ? t("noLabel") : typeof value === "string" ? value : (value[locale] || value.en);
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
  const location = () => demo.locations[locationIndex] || demo.locations[0];
  const items = (family) => demo.resources[location().id][family];
  const isActive = (entry) => entry.status === "ACTIVE";
  const available = (entry) => isActive(entry) && entry.usage === "AVAILABLE";
  const usageLabel = (entry) => !isActive(entry) ? t("unknown")
    : t({ AVAILABLE: "available", IN_USE: "inUse", OCCUPIED: "occupied" }[entry.usage] || "unknown");
  const car = (entry) => entry.vehicle?.plate || (entry.vehicle?.descriptor
    ? localized(entry.vehicle.descriptor) : t(entry.vehicle ? "identityUnavailable" : "unavailable"));
  const announce = (message) => { root.querySelector("[data-opt2-announcement]").textContent = message; };

  function renderMetrics() {
    const keys = items("keys");
    const spots = items("spots");
    const metric = [
      ["activeKeys", keys.filter(isActive).length, `${keys.length} ${t("configured")}`, "neutral"],
      ["freeKeys", keys.filter(available).length, `${t("activeOf")} ${keys.filter(isActive).length} ${t("active")}`, "good"],
      ["usedKeys", keys.filter((item) => isActive(item) && item.usage === "IN_USE").length, t("inUse"), "caution"],
      ["activeSpots", spots.filter(isActive).length, `${spots.length} ${t("configured")}`, "neutral"],
      ["freeSpots", spots.filter(available).length, `${t("activeOf")} ${spots.filter(isActive).length} ${t("active")}`, "good"],
      ["usedSpots", spots.filter((item) => isActive(item) && item.usage === "OCCUPIED").length, t("occupied"), "caution"],
    ];
    root.querySelector("[data-opt2-metrics]").innerHTML = metric.map(([name, value, note, tone]) =>
      `<div class="opt2-metric" data-tone="${tone}"><div class="opt2-metric-label">${escapeHtml(t(name))}</div><div class="opt2-metric-value">${preview === "ready" ? value : "—"}</div><div class="opt2-metric-sub">${preview === "ready" ? escapeHtml(note) : escapeHtml(t(preview))}</div></div>`
    ).join("");
  }

  function renderRow(item, family) {
    const zone = item.zone ? `${escapeHtml(localized(item.zone.label))} <span dir="ltr">${escapeHtml(item.zone.code)}</span>` : t("unassigned");
    const secondary = localized(item.label);
    const vehicleZone = family === "spots"
      ? `<span class="opt2-secondary-text">${zone}</span><span class="opt2-vehicle" dir="auto">${escapeHtml(car(item))}</span>`
      : `<span class="opt2-vehicle" dir="auto">${escapeHtml(car(item))}</span>`;
    const tone = !isActive(item) ? "muted" : available(item) ? "good" : "caution";
    const chip = `<span class="opt2-chip" data-tone="${tone}">${escapeHtml(usageLabel(item))}</span>`;
    const status = `<span class="opt2-secondary-text">${t(isActive(item) ? "active" : "inactive")}</span>`;
    const labelId = escapeHtml(item.id);
    return `<tr data-resource-code="${escapeHtml(item.code)}" data-resource-family="${family}"><td><bdi class="opt2-resource-code" dir="ltr">${escapeHtml(item.code)}</bdi><span class="opt2-secondary-text" dir="auto">${escapeHtml(secondary)}</span></td>
      <td><span class="opt2-status-stack">${chip}</span>${status}</td>
      <td>${vehicleZone}</td>
      <td><div class="opt2-row-actions"><button type="button" class="opt2-action" aria-label="${escapeHtml(t("details") + " " + item.code)}" data-opt2-detail="${labelId}" data-family="${family}">${t("details")}</button><button type="button" class="opt2-action" aria-label="${escapeHtml(t("qr") + " " + item.code)}" data-opt2-qr="${labelId}" data-family="${family}" ${isActive(item) ? "" : "disabled"}>${t("qr")}</button></div></td></tr>`;
  }

  function renderTable(family) {
    const target = root.querySelector(`[data-opt2-table="${family}"]`);
    const configured = items(family);
    const inactive = configured.filter((item) => !isActive(item)).length;
    root.querySelector(`[data-opt2-summary="${family}"]`).textContent = preview === "ready"
      ? `${configured.length} ${t("configured")} · ${inactive} ${t("disabled")}` : t(preview);
    if (preview === "loading") {
      target.innerHTML = `<div aria-label="${escapeHtml(t("loadingState"))}" role="status">${Array.from({length: 4}, () => '<div class="opt2-skeleton"><span></span><span></span><span></span></div>').join("")}<div class="opt2-state"><strong>${t("loadingState")}</strong><p>${t("loadingHint")}</p></div></div>`;
      return;
    }
    if (preview !== "ready" || configured.length === 0) {
      const key = preview === "error" ? "error" : "empty";
      target.innerHTML = `<div class="opt2-state" role="status"><span aria-hidden="true" class="opt2-state-icon">${key === "error" ? "!" : "□"}</span><strong>${t(key + "State")}</strong><p>${t(key + "Hint")}</p><button type="button" class="opt2-btn opt2-btn-subtle" data-opt2-retry>${t("retry")}</button></div>`;
      return;
    }
    target.innerHTML = `<table class="opt2-table"><thead><tr><th scope="col">${t("resource")}</th><th scope="col">${t("condition")}</th><th scope="col">${t("vehicle")}</th><th scope="col">${t("actions")}</th></tr></thead><tbody>${configured.map((entry) => renderRow(entry, family)).join("")}</tbody></table>`;
  }

  function render() {
    root.querySelectorAll("[data-opt2-copy]").forEach((element) => { element.textContent = t(element.dataset.opt2Copy); });
    root.querySelector("[data-opt2-location]").textContent = localized(location().name);
    root.querySelectorAll("[data-opt2-state] option").forEach((option) => { option.textContent = t(option.value); });
    root.querySelector("[data-opt2-state]").value = preview;
    renderMetrics();
    renderTable("keys");
    renderTable("spots");
    if (selectedDialog) openDialog(selectedDialog.kind, selectedDialog.family, selectedDialog.id, true);
  }

  const detailPair = (name, value) => `<dt>${escapeHtml(name)}</dt><dd>${value}</dd>`;
  function detailContent(entry, family) {
    const summary = [
      detailPair(t("code"), `<bdi dir="ltr">${escapeHtml(entry.code)}</bdi>`),
      detailPair(t("label"), escapeHtml(localized(entry.label))),
      detailPair(t("location"), escapeHtml(localized(location().name))),
      detailPair(t("condition"), `${t(isActive(entry) ? "active" : "inactive")} / ${usageLabel(entry)}`),
      detailPair(t("vehicle"), escapeHtml(car(entry))),
    ];
    if (family === "spots") summary.push(detailPair(t("zone"), entry.zone
      ? `${escapeHtml(localized(entry.zone.label))} · <bdi dir="ltr">${escapeHtml(entry.zone.code)}</bdi>` : t("unassigned")));
    let history = "";
    if (family === "keys") {
      const events = entry.custody.map((event) => `<li><time dir="ltr">${escapeHtml(event.time)}</time><strong>${t(event.event === "CHECKOUT" ? "checkedOut" : "returned")}</strong><span>${escapeHtml(event.actor)}</span></li>`).join("");
      history = `<h3 class="opt2-help">${t("history")}</h3>${events ? `<ul class="opt2-events">${events}</ul>` : `<p class="opt2-help">${t("noHistory")}</p>`}`;
    }
    return `<dl class="opt2-dl">${summary.join("")}</dl>${history}`;
  }

  function qrContent(entry, family) {
    const cells = Array.from({ length: 169 }, (_, idx) => {
      const x = idx % 13, y = Math.floor(idx / 13);
      const corner = (a, b) => (x >= a && x < a + 5 && y >= b && y < b + 5);
      const finder = corner(0,0) || corner(8,0) || corner(0,8);
      const filled = finder ? (x % 8 === 0 || y % 8 === 0 || (x % 8 >= 2 && x % 8 <= 3 && y % 8 >= 2 && y % 8 <= 3)) : ((x * 31 + y * 17 + x * y) % 7 < 3);
      return `<span${filled ? ' style="background:#142549"' : ""}></span>`;
    }).join("");
    return `<div class="opt2-qr-label"><strong>VAYLET</strong><span>${t(family === "keys" ? "keyType" : "spotType")}</span>
      <bdi class="opt2-qr-code" dir="ltr">${escapeHtml(entry.code)}</bdi>
      <div class="opt2-qr" role="img" aria-label="${escapeHtml(t("qrDisclaimer"))}">${cells}</div>
      <span>${escapeHtml(localized(location().name))}</span>
      <small dir="ltr">${escapeHtml(location().code)}</small></div>
      <p class="opt2-help" style="text-align:center">${t("qrDisclaimer")}</p>`;
  }

  function createContent(family) {
    const zones = [...new Map(items("spots").filter((item) => item.zone).map((item) => [item.zone.code, item.zone])).values()];
    const options = zones.map((zone) => `<option value="${escapeHtml(zone.code)}">${escapeHtml(localized(zone.label))} (${escapeHtml(zone.code)})</option>`).join("");
    const zonePicker = family === "spots" ? `<div class="opt2-field"><label for="opt2-input-zone">${t("zone")}</label><select id="opt2-input-zone" required><option value="">${t("selectZone")}</option>${options}</select></div>` : "";
    return `<form data-opt2-preview-form><div class="opt2-field"><label for="opt2-input-code">${t("code")}</label><input id="opt2-input-code" maxlength="100" required autocomplete="off" placeholder="${family === "keys" ? "K-09" : family === "spots" ? "P-09" : "Z-C"}"></div>
      <div class="opt2-field"><label for="opt2-input-label">${t("label")}</label><input id="opt2-input-label" maxlength="160" ${family === "keys" ? "" : "required"} autocomplete="off" placeholder="${family === "keys" ? "North counter" : family === "spots" ? "Bay 09" : "Central Zone"}"></div>
      ${zonePicker}<p class="opt2-help">${t(family === "keys" ? "hintKey" : family === "spots" ? "hintSpot" : "hintZone")}</p>
      <div class="opt2-dialog-actions"><button type="button" class="opt2-btn" data-opt2-close>${t("cancel")}</button><button type="submit" class="opt2-btn opt2-btn-primary">${t("createPreview")}</button></div><p class="opt2-help" data-opt2-save-message role="status"></p></form>`;
  }

  function openDialog(kind, family, id, preserveFocus = false) {
    const entry = kind === "create" ? null : items(family).find((item) => item.id === id);
    if (kind !== "create" && !entry) return;
    const title = kind === "create" ? t({keys: "createKey", spots: "createSpot", zone: "createZone"}[family])
      : kind === "qr" ? t("viewQr") : t("inspection");
    const body = kind === "create" ? createContent(family)
      : kind === "qr" ? qrContent(entry, family) : detailContent(entry, family);
    const actions = kind === "qr" ? `<div class="opt2-dialog-actions"><button type="button" class="opt2-btn" data-opt2-preview-action>${t("print")}</button><button type="button" class="opt2-btn" data-opt2-preview-action>${t("download")}</button></div>` : "";
    const modal = root.querySelector("[data-opt2-dialog]");
    modal.innerHTML = `<div class="opt2-dialog-head"><div><h2 id="opt2-dialog-title">${title}</h2><p>${t("previewNote")}</p></div><button type="button" class="opt2-dialog-close" data-opt2-close aria-label="${t("close")}">×</button></div><div class="opt2-dialog-content">${body}${actions}</div>`;
    if (!preserveFocus) returnFocus = document.activeElement;
    selectedDialog = { kind, family, id };
    root.querySelector("[data-opt2-dialog-backdrop]").hidden = false;
    modal.querySelector("[data-opt2-close]").focus();
  }

  function closeDialog() {
    root.querySelector("[data-opt2-dialog-backdrop]").hidden = true;
    selectedDialog = null;
    const target = returnFocus;
    returnFocus = null;
    if (target?.isConnected) target.focus();
  }

  root.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) {
      if (event.target.matches("[data-opt2-dialog-backdrop]")) closeDialog();
      return;
    }
    if (button.hasAttribute("data-opt2-close")) closeDialog();
    else if (button.hasAttribute("data-opt2-retry")) { preview = "ready"; render(); }
    else if (button.hasAttribute("data-opt2-preview-action")) announce(t("fakeSave"));
    else if (button.hasAttribute("data-opt2-create")) openDialog("create", button.dataset.opt2Create, null);
    else if (button.hasAttribute("data-opt2-detail")) openDialog("detail", button.dataset.family, button.dataset.opt2Detail);
    else if (button.hasAttribute("data-opt2-qr")) openDialog("qr", button.dataset.family, button.dataset.opt2Qr);
  });
  root.addEventListener("submit", (event) => {
    if (!event.target.matches("[data-opt2-preview-form]")) return;
    event.preventDefault();
    event.target.querySelector("[data-opt2-save-message]").textContent = t("fakeSave");
    announce(t("fakeSave"));
  });
  root.querySelector("[data-opt2-state]").addEventListener("change", (event) => {
    preview = event.target.value;
    if (selectedDialog) closeDialog();
    render();
  });
  document.addEventListener("keydown", (event) => {
    if (!selectedDialog) return;
    if (event.key === "Escape") { event.preventDefault(); closeDialog(); return; }
    if (event.key !== "Tab") return;
    const focusable = Array.from(root.querySelectorAll('[data-opt2-dialog] button:not(:disabled), [data-opt2-dialog] input, [data-opt2-dialog] select'));
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  window.addEventListener("vaylet:shell-state", (event) => {
    const state = event.detail || {};
    locale = state.locale === "ar" ? "ar" : "en";
    if (Number.isInteger(state.locationIndex) && demo.locations[state.locationIndex] && state.locationIndex !== locationIndex) {
      locationIndex = state.locationIndex;
      if (selectedDialog) closeDialog();
    }
    render();
  });
  render();
})();
