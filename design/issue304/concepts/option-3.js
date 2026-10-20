(() => {
  "use strict";
  const root = document.querySelector('[data-concept="c"]');
  const modal = document.querySelector('[data-c-modal]');
  const fixture = window.VAYLET_304_DATA;
  if (!root || !modal || !fixture?.resources || !fixture?.locations) return;

  const copy = JSON.parse(document.querySelector("[data-c-copy]").textContent);
  const $ = selector => root.querySelector(selector);
  const $$ = selector => Array.from(root.querySelectorAll(selector));
  const m$ = selector => modal.querySelector(selector);
  const state = { locale: document.documentElement.lang === "ar" ? "ar" : "en", family: "keys", filter: "all", preview: "normal", locationIndex: 0, mobile: false, selected: { keys: null, spots: null }, modal: null, modalReturn: null, rowReturn: null };
  const t = key => (copy[key] || [key, key])[state.locale === "ar" ? 1 : 0];
  const local = field => field && typeof field === "object" ? field[state.locale] || field.en || "" : field || "";
  const safe = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const scope = () => fixture.locations[Math.max(0, Math.min(state.locationIndex, fixture.locations.length - 1))];
  const data = family => fixture.resources[scope()?.id]?.[family] || [];
  const items = () => data(state.family);
  const busy = item => item.usage === "IN_USE" || item.usage === "OCCUPIED";
  const stateKind = item => item.status !== "ACTIVE" ? "inactive" : item.usage === "UNKNOWN" ? "unknown" : busy(item) ? "busy" : "available";
  const usage = item => item.usage === "UNKNOWN" ? t("unknown") : item.usage === "IN_USE" ? t("inUse") : item.usage === "OCCUPIED" ? t("occupied") : t("available");
  const vehicle = item => {
    if (item.status !== "ACTIVE" || item.usage === "UNKNOWN") return t("vehicleAssociationUnknown");
    if (item.usage === "AVAILABLE") return t("noVehicle");
    const plate = typeof item.vehicle?.plate === "string" ? item.vehicle.plate.trim().replace(/\s+/g, " ").toUpperCase() : "";
    return plate || local(item.vehicle?.descriptor) || t("vehicleUnknown");
  };
  const matches = item => {
    const filter = state.filter;
    return filter === "all" || (filter === "busy" ? busy(item) : filter === "inactive" ? item.status !== "ACTIVE" : item.status === "ACTIVE" && item.usage === "AVAILABLE");
  };
  const shown = () => items().filter(matches);
  const chosen = () => items().find(item => item.id === state.selected[state.family]) || null;
  function translate() {
    [...$$("[data-c-text]"), ...modal.querySelectorAll("[data-c-text]")].forEach(el => { el.textContent = t(el.dataset.cText); });
    $('[data-c-family-label]').setAttribute("aria-label", t("familyLabel"));
    $('[data-c-filter-label]').setAttribute("aria-label", t("filterLabel"));
    m$("[data-c-close]").setAttribute("aria-label", t("close"));
    m$("[data-c-qr-art]").setAttribute("aria-label", t("qrIllustrative"));
    $('[data-c-kpis-label]').setAttribute("aria-label", t("kpiSummary"));
    m$('input[name="code"]').placeholder = t("codePlaceholder");
    m$('input[name="label"]').placeholder = t("labelPlaceholder");
    $("[data-c-open-add] span").textContent = t(state.family === "keys" ? "addKey" : "addSpot");
    $('[data-c-open-zone]').hidden = state.family !== "spots";
    $('[data-c-filter="busy"]').textContent = t(state.family === "keys" ? "busyFilter" : "occupied");
    $('[data-c-preview-state]').setAttribute("aria-label", t("previewState"));
    ["sampleData", "emptyMode", "loadingMode", "errorMode"].forEach((key, i) => { $('[data-c-preview-state]').options[i].textContent = t(key); });
  }
  function renderList() {
    const list = $("[data-c-list]");
    const visible = state.preview === "normal" ? shown() : [];
    const all = items();
    const count = state.preview === "normal" ? all.length : 0;
    $("[data-c-list-total]").textContent = count + " " + t("resources");
    $("[data-c-visible-count]").textContent = visible.length + " / " + count;
    $('[data-c-empty]').hidden = visible.length !== 0;
    $('[data-c-empty]').textContent = t(state.preview === "normal" ? "none" : state.preview === "empty" ? "emptyPreview" : state.preview === "loading" ? "loadingPreview" : "errorPreview");
    list.replaceChildren();
    visible.forEach(item => {
      const li = document.createElement("li");
      const button = document.createElement("button");
      const kind = stateKind(item);
      button.type = "button";
      button.className = "c-resource";
      button.dataset.cId = item.id;
      button.setAttribute("aria-current", String(chosen()?.id === item.id));
      button.setAttribute("aria-label", [item.code, vehicle(item), local(item.label) || t("noLabel"), usage(item)].join(", "));
      button.innerHTML = `<span class="c-row-icon" data-kind="${state.family}">${state.family === "keys" ? "K" : "P"}</span>
        <span class="c-row-main"><span class="c-row-top"><bdi class="c-row-code" dir="ltr">${safe(item.code)}</bdi><span class="c-mini-state" data-state="${kind}">${safe(kind === "inactive" ? t("inactive") : kind === "unknown" ? t("unknown") : usage(item))}</span></span>
        <span class="c-row-vehicle" data-c-vehicle-state="${kind}"><bdi class="c-row-identity" dir="${item.status === "ACTIVE" && busy(item) && typeof item.vehicle?.plate === "string" && item.vehicle.plate.trim() ? "ltr" : "auto"}">${safe(vehicle(item))}</bdi><span class="c-row-vehicle-caption">${safe(t("associatedVehicle"))}</span></span>
        <span class="c-row-label">${safe(local(item.label) || t("noLabel"))}</span></span>`;
      button.addEventListener("click", () => select(item.id, button));
      li.append(button);
      list.append(li);
    });
  }
  function renderDetails() {
    const entry = chosen();
    $('[data-c-preview-wash]').hidden = state.preview === "normal";
    $('[data-c-detail-scroll]').hidden = state.preview !== "normal";
    $('[data-c-preview-message]').textContent = t(state.preview === "empty" ? "emptyPreview" : state.preview === "loading" ? "loadingPreview" : "errorPreview");
    if (state.preview !== "normal") { $('[data-c-detail]').hidden = false; return; }
    if (!entry) {
      $('[data-c-detail]').hidden = true;
      return;
    }
    $('[data-c-detail]').hidden = false;
    const all = items();
    $('[data-c-position]').textContent = String(all.indexOf(entry) + 1).padStart(2, "0") + " / " + String(all.length).padStart(2, "0");
    $('[data-c-hero-icon]').textContent = state.family === "keys" ? "K" : "P";
    $('[data-c-hero-icon]').dataset.kind = state.family;
    $('[data-c-resource-type]').textContent = t(state.family === "keys" ? "keySlot" : "parkingSpot") + " · " + scope().code;
    $('[data-c-code]').textContent = entry.code;
    $('[data-c-label]').textContent = local(entry.label) || t("noLabel");
    $('[data-c-spec-code]').textContent = entry.code;
    $('[data-c-spec-label]').textContent = local(entry.label) || t("noLabel");
    $('[data-c-spec-location]').textContent = local(scope().name);
    $('[data-c-zone-row]').hidden = state.family !== "spots";
    $('[data-c-spec-zone]').textContent = entry.zone ? local(entry.zone.label) + " · " + entry.zone.code : t("unassigned");
    $('[data-c-open-qr]').disabled = entry.status !== "ACTIVE";
    $('[data-c-open-qr]').title = entry.status !== "ACTIVE" ? t("qrUnavailable") : "";
    const status = $('[data-c-status]');
    const operational = $('[data-c-usage]');
    status.dataset.kind = entry.status === "ACTIVE" ? "available" : "inactive";
    operational.dataset.kind = stateKind(entry);
    status.innerHTML = '<span class="c-status-dot" aria-hidden="true"></span>';
    operational.innerHTML = '<span class="c-status-dot" aria-hidden="true"></span>';
    status.append(document.createTextNode(t(entry.status === "ACTIVE" ? "active" : "inactive")));
    operational.append(document.createTextNode(usage(entry)));
    $('[data-c-usage-hint]').textContent = t(entry.usage === "UNKNOWN" ? "usageUnknown" : busy(entry) ? "usageBusy" : "usageFree");
    Object.assign($('[data-c-vehicle]'), { textContent: vehicle(entry), dir: entry.status === "ACTIVE" && busy(entry) && typeof entry.vehicle?.plate === "string" && entry.vehicle.plate.trim() ? "ltr" : "auto" });
    $('[data-c-vehicle-hint]').textContent = t(entry.status !== "ACTIVE" || entry.usage === "UNKNOWN" ? "vehicleAssociationUnknown" : busy(entry) ? "vehicleCurrent" : "vehicleEmpty");
    $('[data-c-timeline-intro]').textContent = t(state.family === "keys" ? "custodyIntro" : "spotIntro");
    $('[data-c-timeline-title]').textContent = t(state.family === "keys" ? "custody" : "noHistory");
    const timeline = $('[data-c-timeline]');
    timeline.replaceChildren();
    const events = state.family === "keys" ? (entry.custody || []) : [];
    $('[data-c-no-events]').hidden = events.length > 0 || state.family === "spots";
    if (state.family === "spots") {
      const item = document.createElement("li");
      item.innerHTML = `<div class="c-timeline-title">${safe(t("parkingZone"))}</div><div class="c-timeline-actor">${safe(entry.zone ? local(entry.zone.label) + " · " + entry.zone.code : t("unassigned"))}</div>`;
      timeline.append(item);
    } else {
      events.forEach(event => {
        const item = document.createElement("li");
        item.dataset.event = event.event;
        item.innerHTML = `<div class="c-timeline-title"><span>${safe(t(event.event === "RETURN" ? "return" : "checkout"))}</span><bdi dir="ltr" class="c-timeline-time">${safe(event.time)}</bdi></div><div class="c-timeline-actor">${safe(event.actor)}</div>`;
        timeline.append(item);
      });
    }
  }
  function render() {
    const available = items();
    if (!available.some(item => item.id === state.selected[state.family])) state.selected[state.family] = available.find(item => item.status === "ACTIVE" && busy(item))?.id || available[0]?.id || null;
    const filtered = shown();
    if (filtered.length && !filtered.some(item => item.id === state.selected[state.family])) state.selected[state.family] = filtered[0].id;
    for (const family of ["keys", "spots"]) {
      const all = data(family);
      const active = all.filter(item => item.status === "ACTIVE");
      const free = active.filter(item => item.usage === "AVAILABLE").length;
      const inUse = active.filter(item => item.usage === (family === "keys" ? "IN_USE" : "OCCUPIED")).length;
      const busyName = family === "keys" ? "keys-in-use" : "spots-occupied";
      $("[data-c-kpi='" + family + "-active'] [data-c-kpi-value]").textContent = active.length;
      $("[data-c-kpi='" + family + "-available'] [data-c-kpi-value]").textContent = free;
      $("[data-c-kpi='" + busyName + "'] [data-c-kpi-value]").textContent = inUse;
      $('[data-c-kpi-caption="' + family + '-configured"]').textContent = all.length + " " + t("configuredCount");
      $('[data-c-kpi-caption="' + family + '-available"]').textContent = t("ofActiveCount") + " " + active.length + " " + t("activeCount");
      $('[data-c-count="' + family + '"]').textContent = String(all.length).padStart(2, "0");
    }
    $$("[data-c-family]").forEach(button => {
      const active = button.dataset.cFamily === state.family;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    $$("[data-c-filter]").forEach(button => {
      const active = button.dataset.cFilter === state.filter;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    translate();
    renderList();
    renderDetails();
  }
  function mobileMode() { return window.matchMedia("(max-width: 820px)").matches; }
  function backToList() {
    if (!state.mobile) return;
    state.mobile = false;
    root.dataset.mobileDetails = "false";
    const previous = state.rowReturn && state.rowReturn.isConnected ? state.rowReturn : $('[data-c-list] [aria-current="true"]');
    previous?.focus();
  }
  function select(id, trigger) {
    state.selected[state.family] = id;
    state.rowReturn = trigger;
    if (mobileMode()) {
      state.mobile = true;
      root.dataset.mobileDetails = "true";
    }
    render();
    if (state.mobile) $('[data-c-back]').focus();
  }
  function closeModal() {
    if (!state.modal) return;
    modal.hidden = true;
    m$("[data-c-qr-modal]").hidden = true;
    m$("[data-c-add-modal]").hidden = true;
    state.modal = null;
    state.modalReturn?.isConnected && state.modalReturn.focus();
  }
  function openModal(kind, trigger) {
    if (kind === "qr" && chosen()?.status !== "ACTIVE") return;
    state.modalReturn = trigger;
    state.modal = kind;
    modal.hidden = false;
    m$("[data-c-qr-modal]").hidden = kind !== "qr";
    m$("[data-c-add-modal]").hidden = kind === "qr";
    m$("[data-c-modal-title]").textContent = t(kind === "qr" ? "qrTitle" : kind === "zone" ? "addZone" : state.family === "keys" ? "addKey" : "addSpot");
    if (kind === "qr") {
      const entry = chosen();
      if (!entry) return closeModal();
      m$("[data-c-qr-family]").textContent = t(state.family === "keys" ? "keySlot" : "parkingSpot");
      m$("[data-c-qr-code]").textContent = entry.code;
      m$("[data-c-qr-location]").textContent = local(scope().name) + " · " + scope().code;
    } else {
      m$("[data-c-add-form]").reset();
      m$("[data-c-draft]").hidden = true;
      m$("[data-c-add-zone-row]").hidden = kind === "zone" || state.family === "keys";
      m$('input[name="label"]').required = kind === "zone" || (kind === "add" && state.family === "spots");
      const zones = [...new Map(data("spots").filter(item => item.zone).map(item => [item.zone.code, item.zone])).values()];
      const select = m$('select[name="zone"]');
      select.replaceChildren(new Option(t("draftZone"), ""));
      zones.forEach(zone => select.add(new Option(local(zone.label) + " · " + zone.code, zone.code)));
      select.required = kind === "add" && state.family === "spots";
      m$('input[name="code"]').placeholder = kind === "zone" ? "Z-C" : state.family === "spots" ? "P-08" : t("codePlaceholder");
    }
    m$("[data-c-close]").focus();
  }
  $$("[data-c-family]").forEach(button => button.addEventListener("click", () => {
    backToList();
    state.family = button.dataset.cFamily;
    state.filter = "all";
    render();
  }));
  $$("[data-c-filter]").forEach(button => button.addEventListener("click", () => { state.filter = button.dataset.cFilter; render(); }));
  $('[data-c-back]').addEventListener("click", backToList);
  $('[data-c-open-qr]').addEventListener("click", event => openModal("qr", event.currentTarget));
  $('[data-c-open-add]').addEventListener("click", event => openModal("add", event.currentTarget));
  $('[data-c-open-zone]').addEventListener("click", event => openModal("zone", event.currentTarget));
  $('[data-c-preview-state]').addEventListener("change", event => { backToList(); state.preview = event.target.value; render(); });
  m$("[data-c-add-form]").addEventListener("submit", event => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const code = form.elements.code.value.trim();
    const label = form.elements.label.value.trim() || t("noLabel");
    const zone = state.modal === "add" && state.family === "spots" ? " · " + form.elements.zone.selectedOptions[0].text : "";
    const draft = m$("[data-c-draft]");
    draft.textContent = t("draftNotice") + " " + code + " — " + label + zone;
    draft.hidden = false;
  });
  m$("[data-c-print]").addEventListener("click", () => window.print());
  m$("[data-c-download]").addEventListener("click", () => {
    const entry = chosen();
    if (!entry || entry.status !== "ACTIVE") return;
    const pixels = m$("[data-c-qr-art] svg g").innerHTML;
    const code = safe(entry.code);
    const type = safe(t(state.family === "keys" ? "keySlot" : "parkingSpot"));
    const location = safe(local(scope().name) + " · " + scope().code);
    const label = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="440" viewBox="0 0 320 440"><rect width="320" height="440" fill="#fff"/><text x="160" y="44" text-anchor="middle" fill="#1253d4" font-size="26" font-family="Arial" font-weight="bold">VAYLET</text><text x="160" y="74" text-anchor="middle" fill="#52627e" font-size="12" font-family="Arial">${type}</text><text x="160" y="104" text-anchor="middle" fill="#14213b" font-size="20" font-family="Arial" font-weight="bold">${code}</text><text x="160" y="131" text-anchor="middle" fill="#52627e" font-size="12" font-family="Arial">${location}</text><svg x="45" y="146" width="230" height="230" viewBox="0 0 25 25"><rect width="25" height="25" fill="#fff"/><g fill="#0f172a">${pixels}</g></svg><text x="160" y="412" text-anchor="middle" fill="#64748b" font-size="12" font-family="Arial">ILLUSTRATIVE QR · NOT SCANNABLE</text></svg>`;
    const uri = URL.createObjectURL(new Blob([label], { type: "image/svg+xml" }));
    const link = document.createElement("a");
    link.href = uri; link.download = "vaylet-" + entry.code.replace(/[^a-z0-9_-]/gi, "_") + "-demo.svg"; link.click();
    setTimeout(() => URL.revokeObjectURL(uri), 1000);
  });
  modal.querySelectorAll("[data-c-close]").forEach(button => button.addEventListener("click", closeModal));
  modal.addEventListener("click", event => { if (event.target === modal) closeModal(); });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      if (state.modal) { event.preventDefault(); closeModal(); }
      else if (state.mobile) { event.preventDefault(); backToList(); }
      return;
    }
    if (state.modal && event.key === "Tab") {
      const focusable = Array.from(modal.querySelectorAll("button,input,select")).filter(el => !el.disabled && !el.closest("[hidden]"));
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (!first) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  window.addEventListener("resize", () => { if (!mobileMode() && state.mobile) backToList(); });
  window.addEventListener("vaylet:shell-state", event => {
    const next = event.detail || {};
    const locale = next.locale === "ar" ? "ar" : "en";
    const locationIndex = Number.isInteger(next.locationIndex) ? next.locationIndex : state.locationIndex;
    if (locationIndex !== state.locationIndex) {
      closeModal();
      backToList();
      state.locationIndex = locationIndex;
      state.selected = { keys: null, spots: null };
      state.filter = "all";
    }
    state.locale = locale;
    render();
  });
  render();
})();
