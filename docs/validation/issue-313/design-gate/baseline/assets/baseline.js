/* #313: static local renderer for the source-faithful frozen Analytics shell.
 * Draws source-equivalent 500x260 SVG charts from a synthetic shared fixture.
 * Reads reference-data.js because fetch() cannot open JSON under file://.
 */
(() => {
  'use strict';
  const data = window.ISSUE313_ANALYTICS_BASELINE;
  if (!data) { document.body.dataset.fixtureError = 'missing'; return; }
  const params = new URLSearchParams(window.location.search);
  let locale = params.get('lang') === 'ar' ? 'ar' : 'en';
  let theme = params.get('theme') === 'dark' ? 'dark' : 'light';
  const el = id => document.getElementById(id);
  const esc = value => String(value).replace(/[&<>"']/g, v => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[v]));
  const t = key => data.labels[locale][key] || key;
  const svgNs = 'http://www.w3.org/2000/svg';
  const symbol = (id, attrs, content) => `<${id} ${Object.entries(attrs).map(([key,value]) => `${key}="${esc(value)}"`).join(' ')}>${content || ''}</${id}>`;
  const dateRange = `${data.period.from} – ${data.period.to}`;
  function duration(seconds) {
    if (seconds === null) return t('unavailable');
    const totalMs = Math.round(Number(seconds)*1000);
    if (totalMs < 60000) return `${new Intl.NumberFormat(locale === 'ar' ? 'ar-JO' : 'en-US',{maximumFractionDigits:3}).format(totalMs/1000)}${locale === 'ar' ? ' ث' : 's'}`;
    const m = Math.floor(totalMs/60000), s = Math.floor((totalMs%60000)/1000);
    const n = new Intl.NumberFormat(locale === 'ar' ? 'ar-JO' : 'en-US');
    return `${n.format(m)}${locale === 'ar' ? ' د' : 'm'} ${n.format(s)}${locale === 'ar' ? ' ث' : 's'}`;
  }
  const number = n => locale === 'ar' ? new Intl.NumberFormat('ar-JO').format(n) : String(n);
  function chartFrame(plot, label) {
    return `<div class="chart-area"><svg class="chart-svg" role="img" aria-label="${esc(label)}" viewBox="0 0 500 260">${plot}</svg><div class="chart-tooltip" hidden></div></div>`;
  }
  function axis(max) {
    let s='';
    for(let step=0;step<=4;step++) {
      const tick=Math.round(max*step/4),y=20+210*(1-tick/max);
      s+=`<g><line x1="40" x2="480" y1="${y}" y2="${y}" stroke="var(--analytics-grid)" stroke-width="1" stroke-dasharray="4 4"/><text x="32" y="${y+4}" text-anchor="end">${tick}</text></g>`;
    }
    return s;
  }
  function drawActivity() {
    const points=data.activity, max=Math.max(4,Math.ceil(Math.max(...points.map(p=>p.handledCount),1)/4)*4);
    const slot=440/points.length, barWidth=Math.min(32,Math.max(4,slot*.6));
    let shapes=axis(max)+`<text x="12" y="130" text-anchor="middle" transform="rotate(-90 12 130)">${esc(t('carsHandled'))}</text>`;
    const labelStep=Math.max(1,Math.ceil(points.length/7));
    points.forEach((p,i)=>{
      const height=p.handledCount/max*210,x=40+i*slot+(slot-barWidth)/2,y=230-height;
      shapes+=`<rect class="activity-bar" data-tooltip="${esc(number(p.handledCount)+' · '+p.date)}" data-x="${(40+i*slot+slot/2)/500*100}" data-y="${y/260*100}" x="${x}" y="${y}" width="${barWidth}" height="${height}" rx="4" fill="#1e60f0" />`;
      if(i%labelStep===0 || i===points.length-1) shapes+=`<text class="x-axis-label" x="${40+i*slot+slot/2}" y="252" text-anchor="middle">${p.date.slice(5)}</text>`;
    });
    el('activity-chart').innerHTML=chartFrame(shapes,t('vehicleActivity'));
    el('activity-table').innerHTML=`<caption>${esc(t('vehicleActivity'))}</caption><thead><tr><th>${esc(t('chartDate'))}</th><th>${esc(t('chartCars'))}</th></tr></thead><tbody>${points.map(p=>`<tr><td dir="ltr">${p.date}</td><td>${number(p.handledCount)}</td></tr>`).join('')}</tbody>`;
  }
  function smoothPath(points) {
    const first=points[0]; if (!first) return '';
    let s=`M ${first.x} ${first.y}`;
    for(let i=0;i<points.length-1;i++){const a=points[i],b=points[i+1],x=(a.x+b.x)/2;s+=` C ${x} ${a.y}, ${x} ${b.y}, ${b.x} ${b.y}`;}
    return s;
  }
  const durationKeys=['checkInTime','parkingTime','retrievalWait','retrievalStartLatencyAuxiliary','handoffTime'];
  const shortKeys=['checkInShort','parkingShort','retrievalShort','retrievalStartShort','handoffShort'];
  function drawDurations() {
    const points=data.durations, max=Math.max(4,Math.ceil(Math.max(...points.map(p=>Number(p.averageSeconds||0)),1)/4)*4);
    const plotted=points.map((p,i)=>({...p,x:40+i/(points.length-1)*440,y:p.averageSeconds===null?null:230-Number(p.averageSeconds)/max*210}));
    let shapes=`<defs><linearGradient id="md05-analytics-duration-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#1e60f0" stop-opacity=".22"/><stop offset="100%" stop-color="#1e60f0" stop-opacity=".02"/></linearGradient></defs>`+axis(max);
    const segments=[];let part=[];
    plotted.forEach(p=>{if(p.y===null){if(part.length)segments.push(part);part=[];}else part.push(p);}); if(part.length)segments.push(part);
    segments.forEach(seg=>{const path=smoothPath(seg),a=seg[0],b=seg[seg.length-1];if(seg.length>1) shapes+=`<path d="${path} L ${b.x} 230 L ${a.x} 230 Z" fill="url(#md05-analytics-duration-area)"/>`;shapes+=`<path d="${path}" fill="none" stroke="#1e60f0" stroke-width="2.5" stroke-linecap="round"/>`;});
    plotted.forEach((p,i)=>{shapes+=`<text class="x-axis-label" x="${p.x}" y="252" text-anchor="middle">${esc(t(shortKeys[i]))}</text>`;if(p.y!==null) shapes+=`<circle cx="${p.x}" cy="${p.y}" r="4" fill="#1e60f0" stroke="white" stroke-width="2"/><circle class="duration-point" data-tooltip="${esc(t(p.key)+' · '+duration(p.averageSeconds))}" data-x="${p.x/500*100}" data-y="${p.y/260*100}" cx="${p.x}" cy="${p.y}" r="16" fill="transparent"/>`;});
    el('duration-chart').innerHTML=chartFrame(shapes,t('durationComparison'));
    el('duration-table').innerHTML=`<caption>${esc(t('durationComparison'))}</caption><thead><tr><th>${esc(t('chartMetric'))}</th><th>${esc(t('chartDisplay'))}</th><th>${esc(t('chartAverage'))}</th><th>${esc(t('chartSamples'))}</th><th>${esc(t('chartLocations'))}</th></tr></thead><tbody>${points.map(p=>`<tr><td>${esc(t(p.key))}</td><td>${esc(duration(p.averageSeconds))}</td><td dir="ltr">${p.averageSeconds||esc(t('unavailable'))}</td><td>${number(p.sampleCount)}</td><td>${esc(t('unavailable'))}</td></tr>`).join('')}</tbody>`;
  }
  function renderEvidence() {
    const k=data.kpis;
    el('cars-evidence').textContent=`${t('carsEvidence')}: ${number(k.carsHandled.perActiveEmployee)} (${number(k.carsHandled.value)}/${number(k.carsHandled.activeEmployees)}) · ${t('missingHandoffs')}: ${number(k.carsHandled.handoffsMissingAttribution)}`;
    el('retrieval-evidence').textContent=`${t('retrievalChartAverage')}: ${k.retrievalWait.averageSeconds} · ${number(k.retrievalWait.sampleCount)} ${t('retrievalSamples')}`;
    el('sla-evidence').textContent=`${t('slaEvidence')}: ${k.slaCompliance.numerator}/${k.slaCompliance.denominator} · ${t('missingTargets')}: ${k.slaCompliance.missingTargets} · ${t('invalidIntervals')}: ${k.slaCompliance.invalidIntervals}`;
    el('incident-evidence').textContent=`${t('incidentsPer1000')}: ${k.incidents.per1000} · ${t('keyExceptions')}: ${k.incidents.keyExceptions}`;
    el('source-timezone').textContent=`${t('timezone')}: ${data.scope.timezone}`;
    el('source-evidence').textContent=`${t('sourceHandoff')}: ${number(data.source.handoffAttributedCount)} · ${t('sourceEmployees')}: ${number(data.source.employeeEvidenceCount)} · ${t('missingHandoffs')}: ${number(k.carsHandled.handoffsMissingAttribution)}`;
  }
  function render() {
    document.documentElement.lang=locale;
    document.documentElement.dir=locale==='ar'?'rtl':'ltr';
    document.documentElement.dataset.theme=theme;
    document.querySelectorAll('[data-key]').forEach(node=>node.textContent=t(node.dataset.key));
    el('locale-toggle').textContent=locale==='en'?'العربية':'English';
    document.querySelectorAll('[data-theme-choice]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.themeChoice===theme)));
    el('kpi-cars').textContent=number(data.kpis.carsHandled.value);
    el('kpi-wait').textContent=duration(data.kpis.retrievalWait.averageSeconds);
    el('kpi-sla').textContent=`${number(data.kpis.slaCompliance.percentage)}%`;
    el('kpi-incidents').textContent=number(data.kpis.incidents.incidentCount);
    document.querySelectorAll('[data-period-display]').forEach(node=>node.textContent=dateRange);
    drawActivity(); drawDurations(); renderEvidence();
  }
  document.addEventListener('pointerover', event=>{
    const hit=event.target.closest('.activity-bar,.duration-point');if(!hit)return;
    const container=hit.closest('.chart-area'),tooltip=container.querySelector('.chart-tooltip');
    tooltip.textContent=hit.dataset.tooltip; tooltip.style.left=`${hit.dataset.x}%`;tooltip.style.top=`${hit.dataset.y}%`;tooltip.hidden=false;
    if(hit.classList.contains('activity-bar'))hit.setAttribute('fill','#1551ca');
  });
  document.addEventListener('pointerout',event=>{
    const hit=event.target.closest('.activity-bar,.duration-point');if(!hit)return;
    hit.closest('.chart-area').querySelector('.chart-tooltip').hidden=true;
    if(hit.classList.contains('activity-bar'))hit.setAttribute('fill','#1e60f0');
  });
  el('locale-toggle').addEventListener('click',()=>{locale=locale==='en'?'ar':'en';render();});
  document.querySelectorAll('[data-theme-choice]').forEach(b=>b.addEventListener('click',()=>{theme=b.dataset.themeChoice;render();}));
  document.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>{
    if(b.dataset.preset==='custom'){const custom=window.prompt('Design-only baseline: date range (YYYY-MM-DD – YYYY-MM-DD)',dateRange);if(!custom)return;}
    document.querySelectorAll('[data-preset]').forEach(n=>n.setAttribute('aria-pressed',String(n===b)));
    /* Freeze fixture and old chart data: period selections are preview only. */
  }));
  el('refresh-period').addEventListener('click',()=>render());
  const shell=document.querySelector('.shell'),sidebar=el('dashboard-sidebar'),scrim=el('mobile-scrim');
  el('collapse-sidebar').addEventListener('click',()=>{const collapsed=shell.dataset.sidebarCollapsed!=='true';shell.dataset.sidebarCollapsed=String(collapsed);sidebar.dataset.collapsed=String(collapsed);});
  el('mobile-menu').addEventListener('click',()=>{sidebar.classList.add('mobile-open');scrim.hidden=false;});
  scrim.addEventListener('click',()=>{sidebar.classList.remove('mobile-open');scrim.hidden=true;});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){sidebar.classList.remove('mobile-open');scrim.hidden=true;}});
  /* ?width=mobile is a screenshot helper, not a viewport spoof. Set host viewport to 320/390. */
  render();
  document.body.dataset.baselineReady='true';
})();
