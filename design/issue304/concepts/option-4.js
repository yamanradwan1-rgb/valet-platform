(() => {
  'use strict';
  const root = document.getElementById('concept-d');
  if (!root) return;
  const $ = (selector) => root.querySelector(selector);
  const demo = window.VAYLET_304_DATA;
  const copy = JSON.parse(document.getElementById('d-copy-json').textContent);
  const state = {
    locale: document.documentElement.lang === 'ar' ? 'ar' : 'en',
    locationIndex: window.VAYLET_304_SHELL_STATE?.locationIndex || 0,
    kind: 'keys', selected: null, search: '', demo: 'ready', collapsed: new Set()
  };
  const t = (key) => copy[state.locale][key] || key;
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const localized = (value) => value?.[state.locale] || '';
  const scope = () => demo?.resources?.[demo.locations[state.locationIndex]?.id] || { keys: [], spots: [] };
  const resources = () => scope()[state.kind] || [];
  const name = (item) => localized(item.label) || t('nameFallback');
  const active = (item) => item.status === 'ACTIVE';
  const currentUsage = (item) => !active(item) ? 'unknown' :
    item.usage === 'AVAILABLE' ? 'available' : item.usage === 'OCCUPIED' ? 'occupied' : item.usage === 'IN_USE' ? 'inUse' : 'unknown';
  function vehicleName(item) {
    if (!item.vehicle) return t('noVehicle');
    const plate = String(item.vehicle.plate || '').trim().replace(/\s+/g, ' ').toUpperCase();
    return plate || localized(item.vehicle.descriptor) || t('vehicleUnavailable');
  }
  function groups(items) {
    if (state.kind === 'keys') {
      return [
        { id: 'used', title: t('inUse'), desc: t('inUseDesc'), icon: '◇',
          items: items.filter((item) => active(item) && item.usage === 'IN_USE') },
        { id: 'free', title: t('available'), desc: t('availableDesc'), icon: '◇',
          items: items.filter((item) => active(item) && item.usage === 'AVAILABLE') },
        { id: 'inactive', title: t('inactive'), desc: t('inactiveDesc'), icon: '⨯',
          items: items.filter((item) => !active(item) || !['AVAILABLE', 'IN_USE'].includes(item.usage)) }
      ];
    }
    const zones = new Map();
    items.forEach((item) => {
      const id = item.zone?.code || '__legacy__';
      if (!zones.has(id)) zones.set(id, { id: 'zone-' + id, title: item.zone ? localized(item.zone.label) : t('noZone'),
        desc: item.zone ? t('groupZone') + ' · ' + item.zone.code : t('noZoneDesc'), icon: '▤', items: [] });
      zones.get(id).items.push(item);
    });
    return [...zones.values()].sort((a, b) => a.id === 'zone-__legacy__' ? 1 : b.id === 'zone-__legacy__' ? -1 : a.id.localeCompare(b.id));
  }
  const searchMatches = (item) => [item.code, name(item), vehicleName(item), item.zone?.code, localized(item.zone?.label)]
    .filter(Boolean).join(' ').toLocaleLowerCase().includes(state.search.toLocaleLowerCase());
  function statusBadge(item) {
    const value = currentUsage(item);
    const tone = value === 'available' ? 'green' : value === 'occupied' || value === 'inUse' ? 'amber' : '';
    return '<span class="d-status" data-tone="' + tone + '">' + escape(t(value)) + '</span>';
  }
  function renderRow(item) {
    return [
      '<button type="button" class="d-resource" data-d-resource="', escape(item.id),
      '" data-resource-code="', escape(item.code), '" aria-pressed="', state.selected === item.id, '">',
      '<span class="d-resource-marker" aria-hidden="true">', state.kind === 'keys' ? '◇' : '▤', '</span>',
      '<span class="d-resource-info"><span class="d-resource-name">', escape(name(item)), '</span>',
      '<span class="d-resource-sub"><bdi class="d-code">', escape(item.code), '</bdi><span class="d-sep"></span>',
      escape(active(item) ? t('active') : t('inactiveStatus')), '</span></span>',
      statusBadge(item), '<span class="d-resource-arrow" aria-hidden="true">›</span></button>'
    ].join('');
  }
  function renderGroup(group, index) {
    const id = 'd-group-' + index;
    const expanded = !state.collapsed.has(state.kind + ':' + group.id);
    return [
      '<section class="d-group"><h3 style="margin:0"><button type="button" class="d-group-toggle"',
      ' data-d-group="', escape(group.id), '" aria-expanded="', expanded, '" aria-controls="', id, '">',
      '<span class="d-group-icon" aria-hidden="true">', group.icon, '</span>',
      '<span class="d-group-titles"><span class="d-group-title">', escape(group.title), '</span>',
      '<span class="d-group-description">', escape(group.desc), '</span></span>',
      '<span class="d-group-count">', group.items.length, '</span>',
      '<span class="d-chevron" aria-hidden="true">›</span></button></h3>',
      '<div class="d-resource-list" id="', id, '"', expanded ? '' : ' hidden', '>',
      group.items.map(renderRow).join(''), '</div></section>'
    ].join('');
  }
  function stateMarkup(symbol, title, description, retry = false) {
    return '<div class="d-state"><span class="d-state-symbol' + (state.demo === 'loading' ? ' d-loading-mark' : '') +
      '" aria-hidden="true">' + symbol + '</span><strong>' + escape(t(title)) + '</strong><p>' +
      escape(t(description)) + '</p>' + (retry ? '<button class="d-button" type="button" data-d-reset>' +
      escape(t('reset')) + '</button>' : '') + '</div>';
  }
  function renderInspector(item) {
    if (!item) {
      $('#d-inspector-content').innerHTML = stateMarkup('◇', 'viewDetails', 'readyNote');
      return;
    }
    const isKey = state.kind === 'keys';
    const rows = [
      ['config', active(item) ? 'active' : 'inactiveStatus'],
      ['usage', currentUsage(item)]
    ];
    const history = (item.custody || []).map((entry) =>
      '<li><span class="d-history-dot" aria-hidden="true"></span><div class="d-history-main"><div>' +
      '<div class="d-history-name">' + escape(t(entry.event === 'RETURN' ? 'historyReturn' : 'historyCheck')) +
      '</div><div class="d-history-actor">' + escape(t('actor')) + ' · ' + escape(entry.actor) +
      '</div></div><time class="d-history-time">' + escape(entry.time) + '</time></div></li>').join('');
    $('#d-inspector-content').innerHTML = [
      '<header class="d-inspector-top"><div class="d-inspector-kicker"><span>',
      escape(t(isKey ? 'selectedKey' : 'selectedSpot')), '</span><span>', escape(t('illustrative')), '</span></div>',
      '<div class="d-inspector-title-row"><span class="d-inspector-mark" aria-hidden="true">',
      isKey ? '◇' : '▤', '</span><div><h2 class="d-inspector-title">',
      escape(name(item)), '</h2><p class="d-inspector-code"><bdi class="d-code">',
      escape(item.code), '</bdi></p></div></div></header>',
      '<div class="d-inspector-body"><div class="d-field-grid">',
      rows.map(([label, value]) => '<div class="d-read-field"><span class="d-read-label">' +
        escape(t(label)) + '</span><span class="d-read-value">' + escape(t(value)) + '</span></div>').join(''),
      '</div><div class="d-detail-section"><div class="d-detail-heading"><h3>',
      escape(t(isKey ? 'vehicle' : 'occupancy')), '</h3><span class="d-minor-tag">',
      escape(t('illustrative')), '</span></div><div class="d-vehicle"><span class="d-vehicle-icon" aria-hidden="true">▱</span>',
      '<span class="d-vehicle-meta"><strong>', escape(vehicleName(item)),
      '</strong><small>', escape(isKey ? t('vehicle') : (item.zone ? localized(item.zone.label) : t('noZone'))),
      '</small></span></div></div>',
      isKey
        ? '<div class="d-detail-section"><div class="d-detail-heading"><h3>' + escape(t('keyHistory')) +
          '</h3><span class="d-minor-tag">' + escape(t('illustrative')) + '</span></div>' +
          (history ? '<ol class="d-history">' + history + '</ol>' :
            '<p class="d-empty-history">' + escape(t('historyEmpty')) + '</p>') + '</div>'
        : '<div class="d-detail-section"><div class="d-read-field"><span class="d-read-label">' +
          escape(t('zone')) + '</span><span class="d-read-value">' +
          escape(item.zone ? localized(item.zone.label) + ' · ' + item.zone.code : t('noZone')) +
          '</span></div></div>',
      '</div><div class="d-inspector-actions"><button type="button" class="d-button" data-d-qr',
      active(item) ? '' : ' disabled title="' + escape(t('cannotQr')) + '"',
      '>', escape(t('qr')), '</button><button type="button" class="d-button" data-d-create>',
      escape(t('createAnother')), '</button></div>'
    ].join('');
  }
  function render() {
    root.querySelectorAll('[data-d-copy]').forEach((node) => { node.textContent = t(node.dataset.dCopy); });
    $('#d-create [data-d-copy]').textContent = t(state.kind === 'keys' ? 'createKey' : 'createSpot');
    $('#d-zone-create').hidden = state.kind !== 'spots';
    $('#d-search').placeholder = t('searchHint');
    $('#d-tabs').setAttribute('aria-label', t('section') + ' · ' + t('keys') + ' / ' + t('spots'));
    $('#d-inspector').setAttribute('aria-label', t('viewDetails'));
    ['ready', 'loading', 'empty', 'error'].forEach((name, index) => { $('#d-demo-state').options[index].textContent = t(name); });
    $('#d-keys-count').textContent = scope().keys.length;
    $('#d-spots-count').textContent = scope().spots.length;
    root.querySelectorAll('[data-d-kind]').forEach((button) =>
      button.setAttribute('aria-pressed', String(button.dataset.dKind === state.kind)));
    $('#d-inventory-heading').textContent = t(state.kind === 'keys' ? 'keyGroups' : 'spotGroups');
    const all = resources().filter(searchMatches);
    const grouped = groups(all).filter((group) => group.items.length > 0);
    $('#d-results').textContent = all.length + ' ' + t('resources') + ' · ' + grouped.length + ' ' + t('groups');
    const list = $('#d-group-list');
    if (!demo || state.demo === 'error') list.innerHTML = stateMarkup('!', 'errorTitle', demo ? 'errorInfo' : 'missingData', true);
    else if (state.demo === 'loading') list.innerHTML = stateMarkup('↻', 'loadingTitle', 'loadingInfo');
    else if (state.demo === 'empty') list.innerHTML = stateMarkup('□', 'emptyTitle', 'emptyInfo', true);
    else if (!all.length) list.innerHTML = stateMarkup('⌕', 'noMatches', 'noMatchesInfo');
    else list.innerHTML = grouped.map(renderGroup).join('');
    if (!all.some((item) => item.id === state.selected)) {
      state.selected = all.find((item) => active(item) && item.usage !== 'AVAILABLE')?.id || all[0]?.id || null;
    }
    renderInspector(state.demo === 'ready' && demo ? all.find((item) => item.id === state.selected) : null);
  }
  function notify(message = 'noSave') {
    const toast = $('#d-toast');
    toast.textContent = t(message);
    toast.hidden = false;
    window.clearTimeout(notify.timeout);
    notify.timeout = window.setTimeout(() => { toast.hidden = true; }, 3200);
  }
  function openDialog(type, item) {
    const dialog = $('#d-dialog');
    const trigger = document.activeElement;
    const isQr = type === 'qr';
    const title = isQr ? t('qr') : t(type === 'zone' ? 'newZone' : state.kind === 'keys' ? 'newKey' : 'newSpot');
    const zones = [...new Map(scope().spots.filter((spot) => spot.zone)
      .map((spot) => [spot.zone.code, spot.zone])).values()];
    const zoneOptions = zones.map((zone) => '<option value="' + escape(zone.code) + '">' +
      escape(localized(zone.label)) + ' · ' + escape(zone.code) + '</option>').join('');
    const qrCells = Array.from({ length: 81 }, () => '<i></i>').join('');
    const form = isQr ? [
      '<div class="d-qr-preview"><div class="d-qr-graphic" aria-hidden="true"><span class="d-qr-motif">',
      qrCells, '</span></div><span class="d-qr-code">', escape(item.code),
      '</span><span class="d-qr-watermark">', escape(t('qrPreview')), '</span></div>',
      '<p class="d-qr-caption">VAYLET · ', escape(state.kind === 'keys' ? t('keys') : t('spots')),
      ' · ', escape(localized(demo.locations[state.locationIndex].name)),
      ' · <bdi class="d-code">', escape(demo.locations[state.locationIndex].code), '</bdi></p>',
      '<div class="d-dialog-actions"><button type="button" class="d-button" data-d-preview-output="print">',
      escape(t('printPreview')), '</button><button type="button" class="d-button" data-d-preview-output="download">',
      escape(t('downloadPreview')), '</button></div>'
    ].join('') : [
      '<form id="d-create-form"><label class="d-form-field">', escape(t(type === 'zone' ? 'zoneCode' : 'code')),
      '<input name="code" required maxlength="100" placeholder="', type === 'zone' ? 'Z-C' : state.kind === 'keys' ? 'K-09' : 'P-09',
      '"></label>',
      type === 'zone' || state.kind === 'spots'
        ? '<label class="d-form-field">' + escape(t('label')) +
          '<input name="label" required maxlength="160" placeholder="' + escape(t('label')) + '"></label>' : '',
      type === 'create' && state.kind === 'spots'
        ? '<label class="d-form-field">' + escape(t('zoneRequired')) +
          '<select required name="zone">' + zoneOptions + '</select></label>' : '',
      '<p class="d-form-hint">', escape(t('createIntro')), '</p>',
      '<div class="d-dialog-actions">',
      type === 'create' && state.kind === 'spots'
        ? '<button class="d-button" type="button" data-d-create-zone>' + escape(t('addZone')) + '</button>' : '',
      '<button type="button" class="d-button" data-d-close>', escape(t('discard')), '</button>',
      '<button type="submit" class="d-button d-button-primary">', escape(t('savePreview')),
      '</button></div></form>'
    ].join('');
    $('#d-dialog-content').innerHTML = [
      '<header class="d-dialog-top"><div><h2 id="d-dialog-title">', escape(title), '</h2><p>',
      escape(isQr ? t('qrIntro') : t('createIntro')),
      '</p></div><button class="d-dialog-close" type="button" data-d-close aria-label="',
      escape(t('close')), '">×</button></header><div class="d-dialog-main">', form, '</div>'
    ].join('');
    dialog.showModal();
    dialog.querySelector('[data-d-close]')?.focus();
    dialog.addEventListener('close', () => { if (trigger?.isConnected) trigger.focus(); }, { once: true });
  }
  // Edge can advance focus to BODY at the native modal boundary; wrap explicitly.
  document.addEventListener('keydown', (event) => {
    const dialog = $('#d-dialog');
    if (!dialog.open || event.key !== 'Tab') return;
    const focusable = [...dialog.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
    )].filter((element) => element.getClientRects().length > 0);
    if (!focusable.length) { event.preventDefault(); dialog.focus(); return; }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const current = document.activeElement;
    if (!dialog.contains(current) ||
      (event.shiftKey && current === first) || (!event.shiftKey && current === last)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    }
  }, true);
  root.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button || !root.contains(button)) return;
    if (button.dataset.dKind) {
      state.kind = button.dataset.dKind; state.selected = null; state.search = '';
      $('#d-search').value = ''; render();
    } else if (button.dataset.dGroup) {
      const key = state.kind + ':' + button.dataset.dGroup;
      state.collapsed.has(key) ? state.collapsed.delete(key) : state.collapsed.add(key);
      render();
      root.querySelectorAll('[data-d-group]').forEach((node) => {
        if (node.dataset.dGroup === button.dataset.dGroup) node.focus({ preventScroll: true });
      });
    } else if (button.dataset.dResource) {
      state.selected = button.dataset.dResource;
      render();
      root.querySelectorAll('[data-d-resource]').forEach((node) => {
        if (node.dataset.dResource === state.selected) node.focus({ preventScroll: true });
      });
    } else if (button.hasAttribute('data-d-reset')) {
      state.demo = 'ready'; $('#d-demo-state').value = 'ready'; render();
    } else if (button.hasAttribute('data-d-close')) $('#d-dialog').close();
    else if (button.hasAttribute('data-d-preview-output')) notify('previewUnavailable');
    else if (button.id === 'd-zone-create') openDialog('zone');
    else if (button.hasAttribute('data-d-create-zone')) { $('#d-dialog').close(); openDialog('zone'); }
    else if (button.hasAttribute('data-d-qr')) {
      const item = resources().find((candidate) => candidate.id === state.selected);
      if (item && active(item)) openDialog('qr', item);
    } else if (button.hasAttribute('data-d-create') || button.id === 'd-create') openDialog('create');
  });
  root.addEventListener('submit', (event) => {
    if (event.target.id !== 'd-create-form') return;
    event.preventDefault();
    $('#d-dialog').close();
    notify();
  });
  $('#d-search').addEventListener('input', (event) => {
    state.search = event.target.value.trim(); render();
  });
  $('#d-demo-state').addEventListener('change', (event) => {
    state.demo = event.target.value; render();
  });
  window.addEventListener('vaylet:shell-state', (event) => {
    const next = event.detail || {};
    const locale = next.locale === 'ar' ? 'ar' : 'en';
    const locationIndex = next.locationIndex === 1 ? 1 : 0;
    if (state.locationIndex !== locationIndex) {
      state.locationIndex = locationIndex;
      state.selected = null;
      state.search = '';
      $('#d-search').value = '';
      state.collapsed.clear();
    }
    state.locale = locale;
    render();
  });
  render();
})();
