(() => {
  "use strict";
  const root = document.querySelector("#concept-a");
  if (!root) return;
  const fixture = window.VAYLET_304_DATA;
  const $ = (selector) => root.querySelector(selector);
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
  const wording = {
    en: {
      eyebrow: "OPERATIONS / RESOURCE CONTROL", title: "Physical resources",
      intro: "One accountable view of the slots and spaces behind every valet handoff.",
      demo: "Concept preview · Synthetic records · No changes are saved",
      inventory: "RESOURCE INVENTORY", list: "Resource register", keys: "Key Slots", spots: "Parking Spots",
      searchLabel: "Search resource code, name or vehicle", searchPlaceholder: "Search code, label or vehicle",
      status: "Status", usage: "Usage", zone: "Zone", sort: "Sort", state: "Demo state",
      code: "Code", label: "Label", vehicle: "Vehicle", action: "Action", previous: "Previous", next: "Next",
      columnNote: "Select any row to review details", truth: "Proposed unified design. Key Slot labels and custody details are illustrative; real configuration and operational reads currently remain separate.",
      total: "Resources", totalHint: "At this location", ready: "Available", readyHint: "Active and not assigned", assigned: "In use", assignedHint: "Currently linked to vehicles", attention: "Inactive", attentionHint: "Unavailable for allocation",
      all: "All", active: "Active", inactive: "Inactive", used: "In use / Occupied", inUse: "In use", occupied: "Occupied", unknown: "Unknown",
      sortCode: "Code · A to Z", sortUsage: "Usage · In use first", sortZone: "Zone · A to Z",
      live: "Live sample", emptyDemo: "Empty sample", loading: "Loading sample", error: "Error sample", unassigned: "Legacy / unassigned", noLabel: "No label", noVehicle: "No vehicle", unavailable: "Vehicle unavailable",
      details: "Details", openDetail: "Open details for", records: "records", showing: "Showing", of: "of", row: "resource", rows: "resources", clear: "Clear filters",
      none: "No resources match this view", noneHelp: "Try changing the search or status filters.", load: "Loading resources…", loadHelp: "Illustrative loading state — no request is made.",
      errorTitle: "Resources could not be loaded", errorHelp: "Illustrative error state. Existing records have not changed.", retry: "Return to records",
      panelTitle: "Resource details", resource: "Resource", type: "Resource type", activity: "Example custody activity", noActivity: "No custody activity in this illustrative record.",
      spotActivity: "Custody history is not available from the current parking spot list.", config: "Configuration", current: "Current assignment", close: "Close", qr: "View QR label", preview: "Illustrative preview", qrHeading: "QR label preview", qrHelp: "The graphic is decorative and is not a scannable resource label.", qrKeyType: "KEY SLOT", qrSpotType: "PARKING SPOT",
      createKey: "Add Key Slot", createSpot: "Add Parking Spot", createZone: "Add Parking Zone", createHeading: "Create resource preview", createHelp: "See how the configuration form could look. Submission is disabled in this design.",
      optional: "Optional label", codePlaceholder: "e.g. K-08", labelPlaceholder: "Describe this resource", zonePlaceholder: "Select a zone", previewOnly: "Preview only · not saved", cancel: "Cancel", noteSaved: "Preview only — nothing was saved.",
      checkedOut: "Checked out", returned: "Returned", sample: "Illustrative events · Not an API history", keyZone: "Not applicable", printPreview: "Print label preview", downloadPreview: "Download label preview", noOutput: "Preview only — no file generated or printed.", zoneLabel: "Zone name",
    },
    ar: {
      eyebrow: "العمليات / إدارة الموارد", title: "الموارد الفعلية", intro: "عرض موحّد للخانات والمواقف خلف كل عملية تسليم مركبة.",
      demo: "تصميم تجريبي · بيانات افتراضية · لن يتم حفظ أي تغييرات", inventory: "سجل الموارد", list: "سجل الموارد الفعلية", keys: "خانات المفاتيح", spots: "مواقف السيارات",
      searchLabel: "البحث برمز المورد أو اسمه أو المركبة", searchPlaceholder: "ابحث بالرمز أو الاسم أو المركبة",
      status: "الحالة", usage: "الاستخدام", zone: "المنطقة", sort: "الترتيب", state: "حالة تجريبية", code: "الرمز", label: "الاسم", vehicle: "المركبة", action: "الإجراء", previous: "السابق", next: "التالي",
      columnNote: "اختر أي صف لعرض التفاصيل", truth: "تصميم موحّد مقترح. أسماء خانات المفاتيح وسجل العهدة توضيحيان؛ بيانات الإعدادات والتشغيل تأتي حاليًا من قراءات منفصلة.",
      total: "الموارد", totalHint: "في هذا الموقع", ready: "متاح", readyHint: "نشط وغير مستخدم", assigned: "قيد الاستخدام", assignedHint: "مرتبط حاليًا بمركبة", attention: "غير نشط", attentionHint: "غير قابل للتخصيص",
      all: "الكل", active: "نشط", inactive: "غير نشط", used: "مستخدم / مشغول", inUse: "قيد الاستخدام", occupied: "مشغول", unknown: "غير معروف", sortCode: "الرمز · تصاعدي", sortUsage: "الاستخدام · المستخدم أولًا", sortZone: "المنطقة · تصاعدي",
      live: "بيانات نموذجية", emptyDemo: "حالة فارغة", loading: "حالة تحميل", error: "حالة خطأ", unassigned: "قديم / غير معيّن", noLabel: "بدون اسم", noVehicle: "لا توجد مركبة", unavailable: "هوية المركبة غير متاحة",
      details: "التفاصيل", openDetail: "عرض تفاصيل", records: "سجلات", showing: "عرض", of: "من", row: "مورد", rows: "موارد", clear: "مسح الفلاتر",
      none: "لا توجد موارد مطابقة", noneHelp: "جرّب تعديل البحث أو فلاتر الحالة.", load: "جارٍ تحميل الموارد…", loadHelp: "عرض توضيحي للتحميل؛ لا توجد طلبات فعلية.",
      errorTitle: "تعذّر تحميل الموارد", errorHelp: "حالة خطأ تجريبية؛ السجلات لم تتغير.", retry: "العودة للسجلات", panelTitle: "تفاصيل المورد", resource: "المورد", type: "نوع المورد", activity: "نشاط العهدة التوضيحي", noActivity: "لا توجد أحداث عهدة في هذا السجل التوضيحي.",
      spotActivity: "سجل العهدة غير متاح عبر قائمة المواقف الحالية.", config: "إعداد المورد", current: "الاستخدام الحالي", close: "إغلاق", qr: "عرض ملصق QR", preview: "معاينة توضيحية", qrHeading: "معاينة ملصق QR", qrHelp: "الرسم توضيحي فقط وليس رمزًا قابلًا للمسح.", qrKeyType: "خانة مفاتيح", qrSpotType: "موقف سيارات",
      createKey: "إضافة خانة مفاتيح", createSpot: "إضافة موقف", createZone: "إضافة منطقة مواقف", createHeading: "معاينة إضافة مورد", createHelp: "معاينة لشكل نموذج الإضافة؛ لا يوجد إرسال فعلي في هذا التصميم.",
      optional: "اسم اختياري", codePlaceholder: "مثل K-08", labelPlaceholder: "وصف المورد", zonePlaceholder: "اختر منطقة", previewOnly: "معاينة فقط · لن تُحفظ", cancel: "إلغاء", noteSaved: "معاينة فقط — لم يتم حفظ أي شيء.",
      checkedOut: "تم تسليم المفتاح", returned: "تمت إعادة المفتاح", sample: "أحداث توضيحية · ليست سجل API", keyZone: "لا ينطبق", printPreview: "معاينة طباعة الملصق", downloadPreview: "معاينة تنزيل الملصق", noOutput: "معاينة فقط — لم تتم الطباعة أو إنشاء ملف.", zoneLabel: "اسم المنطقة",
    },
  };
  const state = { locale: document.documentElement.lang === "ar" ? "ar" : "en", locationIndex: 0, family: "keys", search: "", status: "all", usage: "all", zone: "all", sort: "code", mode: "live", page: 0, selectedId: null, overlay: null, returnFocus: null };
  const t = (key) => wording[state.locale][key];
  const local = (value) => value?.[state.locale] ?? null;
  const items = () => fixture?.resources?.[fixture.locations[state.locationIndex].id]?.[state.family] ?? [];
  const isUsed = (item) => item.usage === "IN_USE" || item.usage === "OCCUPIED";
  const vehicle = (item) => item.vehicle?.plate || local(item.vehicle?.descriptor) || (isUsed(item) ? (state.locale === "ar" ? "هوية المركبة غير متاحة" : "Vehicle identity unavailable") : t("noVehicle"));
  const vehicleIsCode = (item) => !!item.vehicle?.plate;
  const codeText = (value) => `<bdi dir="ltr" class="a-code">${escapeHtml(value)}</bdi>`;
  const caption = (item) => escapeHtml(local(item.label) || t("noLabel"));
  const usageText = (item) => item.status === "INACTIVE" ? t("unknown") : (isUsed(item) ? t(state.family === "keys" ? "inUse" : "occupied") : t("ready"));
  const usageTone = (item) => item.status === "INACTIVE" ? "dim" : isUsed(item) ? "blue" : "green";
  const zoneText = (item) => state.family === "keys" ? `<span class="a-muted">—</span>` : item.zone ? `<span>${escapeHtml(local(item.zone.label))}</span><small>${codeText(item.zone.code)}</small>` : `<span class="a-muted">${t("unassigned")}</span>`;
  const selectOptions = (select, entries) => {
    const previous = select.value;
    select.innerHTML = entries.map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join("");
    select.value = entries.some(([value]) => value === previous) ? previous : entries[0][0];
  };
  function renderLabels() {
    root.querySelectorAll("[data-a-copy]").forEach((node) => { node.textContent = t(node.dataset.aCopy); });
    $("#a-search").placeholder = t("searchPlaceholder");
    $("#a-create-label").textContent = state.family === "keys" ? t("createKey") : t("createSpot");
    $("#a-create-zone").hidden = state.family !== "spots";
    $("#a-count-keys").textContent = String(fixture.resources[fixture.locations[state.locationIndex].id].keys.length);
    $("#a-count-spots").textContent = String(fixture.resources[fixture.locations[state.locationIndex].id].spots.length);
    selectOptions($("#a-status"), [["all", t("all")], ["ACTIVE", t("active")], ["INACTIVE", t("inactive")]]);
    selectOptions($("#a-usage"), [["all", t("all")], ["AVAILABLE", t("ready")], ["USED", t(state.family === "keys" ? "inUse" : "occupied")], ["UNKNOWN", t("unknown")]]);
    const zones = [...new Map(items().filter((item) => item.zone).map((item) => [item.zone.code, item.zone])).values()];
    selectOptions($("#a-zone"), [["all", t("all")], ["none", t("unassigned")], ...zones.map((zone) => [zone.code, `${zone.code} · ${local(zone.label)}`])]);
    selectOptions($("#a-sort"), [["code", t("sortCode")], ["usage", t("sortUsage")], ["zone", t("sortZone")]]);
    selectOptions($("#a-state"), [["live", t("live")], ["empty", t("emptyDemo")], ["loading", t("loading")], ["error", t("errorTitle")]]);
    for (const [id, value] of [["status", state.status], ["usage", state.usage], ["zone", state.zone], ["sort", state.sort], ["state", state.mode]]) {
      $(`#a-${id}`).value = value;
    }
    $("#a-zone-wrap").hidden = state.family === "keys";
    root.querySelectorAll("[data-family]").forEach((button) => { button.setAttribute("aria-pressed", String(button.dataset.family === state.family)); });
  }
  function renderMetrics() {
    const all = items();
    const stats = [["total", all.length, "totalHint", "slate"], ["ready", all.filter((item) => item.status === "ACTIVE" && item.usage === "AVAILABLE").length, "readyHint", "green"], ["assigned", all.filter((item) => item.status === "ACTIVE" && isUsed(item)).length, "assignedHint", "blue"], ["attention", all.filter((item) => item.status === "INACTIVE").length, "attentionHint", "amber"]];
    $("#a-metrics").innerHTML = stats.map(([name, value, hint, tone]) => `<article class="a-metric a-metric-${tone}"><div class="a-metric-head"><span>${name === "assigned" ? t(state.family === "keys" ? "inUse" : "occupied") : t(name)}</span><span class="a-metric-marker" aria-hidden="true"></span></div><strong>${value.toString().padStart(2, "0")}</strong><small>${t(hint)}</small></article>`).join("");
  }
  function filteredItems() {
    const query = state.search.trim().toLocaleLowerCase();
    const result = items().filter((item) => {
      if (state.status !== "all" && item.status !== state.status) return false;
      if (state.usage !== "all" && !(state.usage === "USED" ? isUsed(item) : item.usage === state.usage)) return false;
      if (state.family === "spots" && state.zone !== "all" && (item.zone?.code ?? "none") !== state.zone) return false;
      return !query || [item.code, local(item.label), vehicle(item), item.zone?.code, local(item.zone?.label)].some((text) => String(text || "").toLocaleLowerCase().includes(query));
    });
    return result.sort((a, b) => state.sort === "usage" ? Number(isUsed(b)) - Number(isUsed(a)) || a.code.localeCompare(b.code, undefined, { numeric: true }) : state.sort === "zone" ? (a.zone?.code ?? "zz").localeCompare(b.zone?.code ?? "zz") || a.code.localeCompare(b.code) : a.code.localeCompare(b.code, undefined, { numeric: true }));
  }
  function renderRows() {
    const data = state.mode === "live" ? filteredItems() : [];
    state.page = Math.min(state.page, Math.max(0, Math.ceil(data.length / 5) - 1));
    const pageItems = data.slice(state.page * 5, state.page * 5 + 5);
    $("#a-rows").innerHTML = pageItems.map((item) => `<tr class="a-resource-row" data-a-row="${escapeHtml(item.id)}" data-resource-code="${escapeHtml(item.code)}" tabindex="0" aria-label="${t("openDetail")} ${escapeHtml(item.code)}">
      <td data-label="${t("code")}"><span class="a-resource-code"><span class="a-row-icon" aria-hidden="true">${state.family === "keys" ? "◇" : "▦"}</span><span>${codeText(item.code)}</span></span></td>
      <td data-label="${t("label")}"><span class="a-cell-label">${caption(item)}</span></td>
      <td data-label="${t("status")}"><span class="a-status a-status-${item.status === "ACTIVE" ? "active" : "inactive"}"><i aria-hidden="true"></i>${item.status === "ACTIVE" ? t("active") : t("inactive")}</span></td>
      <td data-label="${t("usage")}"><span class="a-usage a-usage-${usageTone(item)}"><i aria-hidden="true"></i>${usageText(item)}</span></td>
      <td data-label="${t("vehicle")}"><span class="${vehicleIsCode(item) ? "a-plate" : "a-vehicle-fallback"}" ${vehicleIsCode(item) ? 'dir="ltr"' : ""}>${escapeHtml(vehicle(item))}</span></td>
      <td data-label="${t("zone")}" class="a-zone-cell">${zoneText(item)}</td>
      <td data-label="${t("action")}" class="a-action-cell"><button type="button" class="a-row-action" data-detail="${escapeHtml(item.id)}" aria-label="${t("openDetail")} ${escapeHtml(item.code)}">${t("details")} <span aria-hidden="true">↗</span></button></td>
    </tr>`).join("");
    const blocked = state.mode !== "live" || data.length === 0;
    $(".a-table").hidden = blocked;
    const read = $("#a-read-state");
    read.hidden = !blocked;
    if (blocked) {
      const isLoading = state.mode === "loading";
      const isError = state.mode === "error";
      read.innerHTML = `<span class="a-state-icon" aria-hidden="true">${isLoading ? "◌" : isError ? "!" : "⌕"}</span><h3>${isLoading ? t("load") : isError ? t("errorTitle") : t("none")}</h3><p>${isLoading ? t("loadHelp") : isError ? t("errorHelp") : t("noneHelp")}</p>${isLoading || isError ? `<button class="a-button-outline" data-retry="true" type="button">${t("retry")}</button>` : state.mode === "live" ? `<button class="a-button-outline" data-clear="true" type="button">${t("clear")}</button>` : ""}`;
    }
    $("#a-filter-message").textContent = `${data.length} ${t("records")}`;
    $("#a-page-report").textContent = data.length ? `${t("showing")} ${state.page * 5 + 1}–${Math.min(data.length, state.page * 5 + 5)} ${t("of")} ${data.length} ${t("rows")}` : `0 ${t("records")}`;
    $("#a-prev").disabled = blocked || state.page === 0;
    $("#a-next").disabled = blocked || (state.page + 1) * 5 >= data.length;
  }
  function render() { renderLabels(); renderMetrics(); renderRows(); }
  function cardPair(label, content) { return `<div class="a-detail-pair"><dt>${label}</dt><dd>${content}</dd></div>`; }
  function showDetail(item) {
    state.selectedId = item.id;
    const history = state.family === "keys" && item.custody?.length ? `<ol class="a-timeline">${item.custody.map((event) => `<li><span class="a-timeline-mark" aria-hidden="true"></span><strong>${event.event === "RETURN" ? t("returned") : t("checkedOut")}</strong><span>${escapeHtml(event.actor)}</span><time dir="ltr">${escapeHtml(event.time)}</time></li>`).join("")}</ol>` : `<p class="a-detail-muted">${t(state.family === "spots" ? "spotActivity" : "noActivity")}</p>`;
    const html = `<div class="a-drawer-head"><div><span class="a-drawer-eyebrow">${t("panelTitle")}</span><h2 id="a-drawer-title">${codeText(item.code)} <span class="a-drawer-title-label">${caption(item)}</span></h2></div><button type="button" class="a-icon-button" data-close-overlay="true" aria-label="${t("close")}">×</button></div>
      <div class="a-detail-scroll"><div class="a-detail-block"><h3>${t("config")}</h3><dl class="a-detail-list">${cardPair(t("type"), t(state.family))}${cardPair(t("code"), codeText(item.code))}${cardPair(t("label"), caption(item))}${cardPair(t("status"), `<span class="a-status a-status-${item.status === "ACTIVE" ? "active" : "inactive"}">${item.status === "ACTIVE" ? t("active") : t("inactive")}</span>`)}${state.family === "spots" ? cardPair(t("zone"), zoneText(item)) : ""}</dl></div>
      <div class="a-detail-block"><h3>${t("current")}</h3><dl class="a-detail-list">${cardPair(t("usage"), usageText(item))}${cardPair(t("vehicle"), `<span class="${vehicleIsCode(item) ? "a-plate" : "a-vehicle-fallback"}">${escapeHtml(vehicle(item))}</span>`)}</dl></div>
      <div class="a-detail-block"><h3>${t("activity")}</h3><p class="a-timeline-note">${t("sample")}</p>${history}</div></div>
      <div class="a-drawer-footer"><button type="button" class="a-primary" data-qr="${escapeHtml(item.id)}" ${item.status !== "ACTIVE" ? "disabled" : ""}>▦ ${t("qr")}</button><button type="button" class="a-button-outline" data-close-overlay="true">${t("close")}</button></div>`;
    openOverlay("drawer", html);
  }
  function showQr(item) {
    const location = fixture.locations[state.locationIndex];
    const content = `<div class="a-modal-header"><h2 id="a-modal-title">${t("qrHeading")}</h2><button type="button" class="a-icon-button" data-close-overlay="true" aria-label="${t("close")}">×</button></div><div class="a-qr-card"><span class="a-qr-brand">VAYLET</span><strong>${t(state.family === "keys" ? "qrKeyType" : "qrSpotType")}</strong><div class="a-qr-art" aria-hidden="true"><span>◼</span><span>◼</span><span>◼</span></div><strong>${codeText(item.code)}</strong><small>${escapeHtml(local(location.name))} · ${codeText(location.code)}</small></div><p class="a-modal-advisory">${t("qrHelp")}</p><div class="a-preview-actions"><button type="button" class="a-button-outline" data-preview-action="print">${t("printPreview")}</button><button type="button" class="a-button-outline" data-preview-action="download">${t("downloadPreview")}</button><button type="button" class="a-button-outline" data-close-overlay="true">${t("close")}</button></div>`;
    openOverlay("modal", content);
  }
  function showCreate(zoneOnly = false) {
    const key = state.family === "keys";
    const zones = fixture.resources[fixture.locations[state.locationIndex].id].spots.filter((item) => item.zone).map((item) => item.zone);
    const uniqueZones = [...new Map(zones.map((zone) => [zone.code, zone])).values()];
    const content = `<div class="a-modal-header"><div><h2 id="a-modal-title">${zoneOnly ? t("createZone") : t("createHeading")}</h2><p>${t("createHelp")}</p></div><button type="button" class="a-icon-button" data-close-overlay="true" aria-label="${t("close")}">×</button></div><form id="a-create-form" class="a-preview-form"><label>${t("code")}<input required name="code" maxlength="100" placeholder="${zoneOnly ? "Z-C" : key ? "K-09" : "P-09"}"></label><label>${zoneOnly ? t("zoneLabel") : key ? t("optional") : t("label")}<input name="label" ${key && !zoneOnly ? "" : "required"} maxlength="160" placeholder="${t("labelPlaceholder")}"></label>${key || zoneOnly ? "" : `<label>${t("zone")}<select required name="zone"><option value="">${t("zonePlaceholder")}</option>${uniqueZones.map((zone) => `<option value="${escapeHtml(zone.code)}">${escapeHtml(local(zone.label))} (${escapeHtml(zone.code)})</option>`).join("")}</select></label>`}<p class="a-modal-advisory">${t("demo")}</p><div class="a-preview-actions"><button type="button" class="a-button-outline" data-close-overlay="true">${t("cancel")}</button><button type="submit" class="a-primary">${t("previewOnly")}</button></div></form>`;
    openOverlay("modal", content);
  }
  function openOverlay(kind, html) {
    if (!state.overlay) state.returnFocus = document.activeElement;
    state.overlay = kind;
    $("#a-overlay").hidden = false;
    [$("#a-drawer"), $("#a-modal")].forEach((panel) => { panel.hidden = panel.id !== `a-${kind}`; });
    $(`#a-${kind}-content`).innerHTML = html;
    document.body.classList.add("a-overlay-open");
    $(`#a-${kind}`).focus();
  }
  function closeOverlay() {
    $("#a-overlay").hidden = true;
    $("#a-drawer").hidden = true;
    $("#a-modal").hidden = true;
    document.body.classList.remove("a-overlay-open");
    state.overlay = null;
    state.selectedId = null;
    const focus = state.returnFocus;
    state.returnFocus = null;
    if (focus?.isConnected) focus.focus();
    else $("#a-list-title").setAttribute("tabindex", "-1"), $("#a-list-title").focus();
  }
  function notify(message) {
    const toast = $("#a-toast");
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(notify.timeout);
    notify.timeout = setTimeout(() => { toast.hidden = true; }, 3200);
  }
  root.addEventListener("click", (event) => {
    const row = event.target.closest("tr[data-a-row]");
    const target = event.target.closest("button, [data-close-overlay]");
    if (!target) { if (row) { const item = items().find((resource) => resource.id === row.dataset.aRow); if (item) showDetail(item); } return; }
    if (!root.contains(target)) return;
    if (target.matches("[data-close-overlay]")) return closeOverlay();
    if (target.dataset.family) { state.family = target.dataset.family; state.page = 0; state.zone = "all"; state.usage = "all"; render(); }
    if (target.id === "a-create") showCreate();
    if (target.id === "a-create-zone") showCreate(true);
    if (target.dataset.previewAction) notify(t("noOutput"));
    if (target.dataset.detail) { const item = items().find((row) => row.id === target.dataset.detail); if (item) showDetail(item); }
    if (target.dataset.qr) { const item = items().find((row) => row.id === target.dataset.qr); if (item && item.status === "ACTIVE") showQr(item); }
    if (target.id === "a-prev") { state.page -= 1; renderRows(); }
    if (target.id === "a-next") { state.page += 1; renderRows(); }
    if (target.dataset.retry) { state.mode = "live"; $("#a-state").value = "live"; renderRows(); }
    if (target.dataset.clear) { state.search = ""; state.status = "all"; state.usage = "all"; state.zone = "all"; $("#a-search").value = ""; render(); }
  });
  $("#a-create-form")?.addEventListener("submit", (event) => event.preventDefault());
  root.addEventListener("submit", (event) => {
    if (event.target.id !== "a-create-form") return;
    event.preventDefault();
    closeOverlay();
    notify(t("noteSaved"));
  });
  root.addEventListener("keydown", (event) => {
    if (!event.target.matches("tr[data-a-row]") || !["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    const item = items().find((resource) => resource.id === event.target.dataset.aRow);
    if (item) showDetail(item);
  });
  $("#a-search").addEventListener("input", (event) => { state.search = event.target.value; state.page = 0; renderRows(); });
  for (const id of ["status", "usage", "zone", "sort", "state"]) {
    $(`#a-${id}`).addEventListener("change", (event) => { state[id === "state" ? "mode" : id] = event.target.value; state.page = 0; renderRows(); });
  }
  document.addEventListener("keydown", (event) => {
    if (!state.overlay) return;
    if (event.key === "Escape") { event.preventDefault(); closeOverlay(); return; }
    if (event.key !== "Tab") return;
    const panel = $(`#a-${state.overlay}`);
    const focusable = [...panel.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]')].filter((node) => node.getClientRects().length);
    if (!focusable.length) { event.preventDefault(); panel.focus(); return; }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  window.addEventListener("vaylet:shell-state", (event) => {
    const next = event.detail || {};
    state.locale = next.locale === "ar" ? "ar" : "en";
    const newIndex = next.locationIndex === 1 ? 1 : 0;
    if (newIndex !== state.locationIndex) {
      state.locationIndex = newIndex;
      state.search = ""; state.status = "all"; state.usage = "all"; state.zone = "all"; state.page = 0;
      $("#a-search").value = "";
    }
    if (state.overlay) closeOverlay();
    render();
  });
  if (!fixture?.locations?.length || !fixture?.resources) { $("#a-read-state").hidden = false; $("#a-read-state").textContent = "Demo fixture unavailable"; return; }
  render();
})();
