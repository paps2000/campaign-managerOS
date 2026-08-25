/* Campaign OS — Campañas: listado, detalle y fuentes
   ====================================
   El listado con sus filtros, el detalle con sus pestañas, el motor de
   coherencia que cuadra tracker/escenario/métricas, los contactos del cliente,
   el panel de carga de los sheets y la paleta de temas.

   El tablero salió a js/dashboard.js, la campanita a js/notificaciones.js y
   todo el tracker a js/tracker.js.
   Script CLÁSICO a propósito (NO type="module"): el HTML llama estas funciones
   desde atributos onclick/onchange, que sólo resuelven contra el scope global,
   y todos los archivos de js/ comparten ese mismo scope. El orden de <script>
   en index.html es el orden real de ejecución. */

// ============================================================
// CAMPAÑAS
// ============================================================
const CAMP_STATUSES = ['En proceso','Ajustes','Pendiente cliente','En reporte','En producción','Completado'];
let _campStatusFilter = '';
function setCampStatusFilter(s) { _campStatusFilter = (_campStatusFilter===s)?'':s; renderCampaignGrid(); }
function _getCampViews() { try { return JSON.parse(localStorage.getItem('cmos:campViews')||'[]'); } catch(e){ return []; } }
function saveCampaignView() {
  const search = (document.getElementById('campFilterSearch')?.value||'').trim();
  if(!search && !_campStatusFilter) { showToast('Aplica un filtro antes de guardar','error'); return; }
  const name = prompt('Nombre de la vista:', _campStatusFilter || search || 'Vista');
  if(!name) return;
  const views = _getCampViews();
  views.push({ name: name.trim(), search, status: _campStatusFilter });
  try { localStorage.setItem('cmos:campViews', JSON.stringify(views.slice(-12))); } catch(e){}
  renderCampaignGrid();
  showToast('Vista guardada','success');
}
function applyCampaignView(i) {
  const v = _getCampViews()[i]; if(!v) return;
  _campStatusFilter = v.status||'';
  const inp = document.getElementById('campFilterSearch'); if(inp) inp.value = v.search||'';
  renderCampaignGrid();
}
function deleteCampaignView(i, e) {
  if(e) e.stopPropagation();
  const views = _getCampViews(); views.splice(i,1);
  try { localStorage.setItem('cmos:campViews', JSON.stringify(views)); } catch(e){}
  renderCampaignGrid();
}
/* La inicial del círculo. Se saltan los signos de arranque porque los nombres
   de creador se guardan como handle: con "@sofiavlogs", "@martinacocina" y
   "@elrodrigo" los tres círculos decían "@" y el grupo entero era ilegible. */
function _inicialCreador(nombre) {
  const limpio = String(nombre || '').replace(/^[^\p{L}\p{N}]+/u, '');
  return (limpio[0] || String(nombre || '?')[0] || '?').toUpperCase();
}

/* ¿Todas las campañas del workspace, o sólo en las que estoy?
   El listado leía `_cache.campaigns` a pelo: no filtraba ni siquiera por
   permiso, así que todo el mundo veía campañas ajenas —y para quien lleva tres
   cuentas, la pantalla de campañas era el catálogo de la agencia entera.
   Por defecto se abre en "Mías". El interruptor sigue estando para cuando de
   verdad hay que ir a buscar una que no llevas. */
let _campScope = (() => {
  try { return localStorage.getItem('cmos:campScope') || 'mias'; } catch(e) { return 'mias'; }
})();
function setCampScope(v) {
  _campScope = (v === 'todas') ? 'todas' : 'mias';
  try { localStorage.setItem('cmos:campScope', _campScope); } catch(e){}
  renderCampaignGrid();
}
function campanasEnAlcance() {
  const todas = (typeof visibleCampaigns === 'function') ? visibleCampaigns() : (_cache.campaigns||[]);
  if(_campScope === 'todas') return todas;
  const mias = (typeof misCampanas === 'function') ? misCampanas() : todas;
  return mias;
}

function renderCampaignGrid() {
  // Mías / Todas
  const scopeWrap = document.getElementById('campScopePills');
  if(scopeWrap) {
    const nTodas = ((typeof visibleCampaigns === 'function') ? visibleCampaigns() : (_cache.campaigns||[])).length;
    const nMias  = ((typeof misCampanas === 'function') ? misCampanas() : []).length;
    scopeWrap.innerHTML = [['mias','Mías',nMias],['todas','Todas',nTodas]].map(([v,label,n]) =>
      `<button class="metrics-tab-pill ${_campScope===v?'active':''}" onclick="setCampScope('${v}')" aria-pressed="${_campScope===v}">${label} · ${n}</button>`).join('');
  }
  const titulo = document.getElementById('campListTitle');
  if(titulo) titulo.textContent = _campScope === 'todas' ? 'Todas las campañas' : 'Mis campañas';
  // Status filter pills
  const pillWrap = document.getElementById('campStatusPills');
  if(pillWrap) pillWrap.innerHTML = CAMP_STATUSES.map(s=>`<button class="metrics-tab-pill ${_campStatusFilter===s?'active':''}" onclick="setCampStatusFilter('${s}')">${s}</button>`).join('');
  // Saved views
  const svWrap = document.getElementById('campSavedViews');
  if(svWrap) {
    const views = _getCampViews();
    svWrap.innerHTML = views.length
      ? '<span style="font-size:11px;color:var(--text-muted);align-self:center;">Vistas:</span>' + views.map((v,i)=>`<span class="metrics-tab-pill" style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;" onclick="applyCampaignView(${i})">${_esc(v.name)}<span onclick="deleteCampaignView(${i},event)" style="opacity:.6;">✕</span></span>`).join('')
      : '';
  }
  const q = (document.getElementById('campFilterSearch')?.value||'').toLowerCase().trim();
  const campaigns = campanasEnAlcance().filter(c => {
    if(_campStatusFilter && c.status !== _campStatusFilter) return false;
    if(q && !((c.name||'').toLowerCase().includes(q) || (c.client||'').toLowerCase().includes(q))) return false;
    return true;
  });
  const grid = document.getElementById('campaignGrid');
  // Skeleton while initial Firestore load is pending
  if(!_cache._initialized && campaigns.length===0) {
    grid.innerHTML = Array.from({length:4}).map(()=>`
      <div class="campaign-card" style="pointer-events:none;">
        <div class="campaign-card-header">
          <div style="flex:1"><div class="tdev-skel-bar" style="height:16px;width:60%;margin-bottom:8px;"></div><div class="tdev-skel-bar" style="height:12px;width:40%;"></div></div>
          <div class="tdev-skel-bar" style="height:22px;width:70px;border-radius:20px;"></div>
        </div>
        <div class="tdev-skel-bar" style="height:14px;width:85%;margin:12px 0;"></div>
        <div class="tdev-skel-bar" style="height:8px;width:100%;margin-top:14px;"></div>
        <div class="tdev-skel-bar" style="height:8px;width:100%;margin-top:14px;"></div>
      </div>`).join('');
    return;
  }
  const statusBadge = (s) => {
    const map = {'En proceso':'badge-blue','Ajustes':'badge-yellow','Pendiente cliente':'badge-orange','En reporte':'badge-red','En producción':'badge-purple','Completado':'badge-green'};
    return `<span class="badge ${map[s]||'badge-gray'}">${_esc(s)}</span>`;
  };
  if(campaigns.length===0) {
    const vacio = (q||_campStatusFilter)
      ? 'Sin campañas con esos filtros.'
      : (_campScope === 'mias'
          ? 'No estás en ninguna campaña todavía. Toca <strong>Todas</strong> para buscar una y seguirla.'
          : 'No hay campañas. ¡Crea la primera!');
    grid.innerHTML=`<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">${ICN_clipboard}</div><p>${vacio}</p></div>`;
    return;
  }
  grid.innerHTML = campaigns.map(c=>{
    const pasos = Array.isArray(c.flowSteps) ? c.flowSteps : [];
    const done = pasos.filter(f=>f.status==='Completado'||f.status==='Aprobado').length;
    // Dividir entre cero imprimía "NaN%" en la tarjeta.
    const pct = pasos.length ? Math.round((done/pasos.length)*100) : 0;
    // Content completitud: published contenidos in master tracker / goal
    // (campaign.goal.contenidos > BIG NUMBERS row > sum of escenario creators)
    let goalCont = (c.goal && c.goal.contenidos) || 0;
    let escSum = 0;
    let goalFromSheet = false;
    // Memoize parseEscenarioRows / _parseUgcResults per campaign — they were
    // running on every snapshot for every card, parsing thousands of rows.
    let _parsedEsc = null;
    const _getParsedEsc = () => {
      if(_parsedEsc) return _parsedEsc;
      if(!c.escenarioRows || !c.escenarioRows.length) return null;
      try {
        _parsedEsc = c._memoEscenario && c._memoEscenarioStamp === c.escenarioRows.length
          ? c._memoEscenario
          : parseEscenarioRows(c.escenarioRows);
        c._memoEscenario = _parsedEsc;
        c._memoEscenarioStamp = c.escenarioRows.length;
      } catch(e) { _parsedEsc = null; }
      return _parsedEsc;
    };
    if(!goalCont) {
      const p = _getParsedEsc();
      if(p) {
        if(p.goal && p.goal.totalContenidos) { goalCont = p.goal.totalContenidos; goalFromSheet = true; }
        else escSum = p.creators.reduce((a,cr)=>a+cr.contenidosTotal,0);
      }
    }
    if(!goalCont) goalCont = escSum;
    let trackerPub = 0;
    (c.trackerRows||[]).forEach(row => {
      const ec = (typeof _trackerStatusOf==='function')
        ? _trackerStatusOf(row)
        : (row['ESTATUS CONTENIDO']||row['Estatus Contenido']||'');
      if(_isPublishedStatus(ec)) trackerPub++;
    });
    let ugcPub = 0;
    if(typeof _parseUgcResults==='function' && c.ugcRows) {
      if(!c._memoUgc || c._memoUgcStamp !== c.ugcRows.length) {
        c._memoUgc = _parseUgcResults(c.ugcRows);
        c._memoUgcStamp = c.ugcRows.length;
      }
      ugcPub = c._memoUgc?.contenidosPublicados || 0;
    }
    const ugcCommitted = (() => { const p = _getParsedEsc(); return p?.ugc?.cantidadContenidos || 0; })();
    const totalPub = trackerPub + ugcPub;
    // Don't add UGC committed when the goal already comes from the sheet's
    // BIG NUMBERS / TOTAL row — it already encompasses both AON and UGC.
    // Also don't add UGC when goal came from the campaign-creation form
    // (user enters the final total there too).
    const goalHasUgcBuiltIn = goalFromSheet || (c.goal && c.goal.contenidos > 0);
    const totalCerrado = goalHasUgcBuiltIn ? goalCont : (goalCont + ugcCommitted);
    const contPct = totalCerrado > 0 ? Math.round((totalPub / totalCerrado) * 100) : 0;
    const sub = isSubscribed(c.id);
    const subBtn = `<button class="sub-btn ${sub?'sub-active':''}" onclick="toggleSubscribeCampaign('${c.id}',event)" title="${sub?'Dejar de seguir':'Seguir campaña'}">${sub?'✓ Siguiendo':'+ Seguir'}</button>`;
    return `<div class="campaign-card" onclick="openCampaignDetail('${c.id}')">
      <div class="campaign-card-header">
        <div>
          <div class="campaign-name">${_esc(c.name)}</div>
          <div class="campaign-client">${_esc(c.client)}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">${statusBadge(c.status)}${subBtn}</div>
      </div>
      <div class="campaign-meta">
        <span class="badge badge-lavender"><span class="badge-icn">${ICN_users}</span>${(c.influencers||[]).length} ${(c.influencers||[]).length===1?'creador':'creadores'}</span>
        <span class="badge badge-mint"><span class="badge-icn">${ICN_calendar}</span>${_esc(c.season||'—')}</span>
        ${(()=>{ const r=c.responsables||{}; return ['operaciones','cuentas','creativo','data'].map(k=>{ const uids=getAreaUids(r,k); return uids.map(uid=>{ const u=allUsers.find(x=>x.uid===uid); return u?`<span class="badge badge-area-${u.area||k.charAt(0).toUpperCase()+k.slice(1)}">${_esc(u.name||u.email.split('@')[0])}</span>`:'';}).join(''); }).join(''); })()||''}
      </div>
      ${(()=>{ const ppl=(c.influencers||[]).filter(i=>i&&i.name); if(!ppl.length) return ''; const max=5; const shown=ppl.slice(0,max); const extra=ppl.length-shown.length; const av=shown.map(i=>`<div class="t-avatar" data-nombre="${_esc(i.name)}" aria-label="${_esc(i.name)}">${_esc(_inicialCreador(i.name))}</div>`).join('')+(extra>0?`<div class="t-avatar is-more" data-nombre="${_esc(ppl.slice(max).map(x=>x.name).join(', '))}" aria-label="${_esc(ppl.slice(max).map(x=>x.name).join(', '))}">+${extra}</div>`:''); return `<div class="camp-people tdev-avatars"><div class="camp-people-avatars">${av}</div></div>`; })()}
      <div class="campaign-progress">
        <div class="progress-label"><span>Flujo</span><span>${pct}%</span></div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
      </div>
      <div class="campaign-progress" style="margin-top:8px;">
        <div class="progress-label"><span>Contenidos publicados</span><span>${totalPub}/${totalCerrado||'—'} · ${contPct}%</span></div>
        <div class="progress-bar"><div class="progress-fill" style="width:${contPct}%;background:linear-gradient(90deg,#bbf7d0,#166534);"></div></div>
      </div>
      ${campaignLoadDotsHtml(c)}
    </div>`;
  }).join('');
}

function showCampaignList() {
  try { localStorage.removeItem('cmos:lastCampaignId'); localStorage.removeItem('cmos:lastCampaignTab'); } catch(e){}
  document.getElementById('campaignList').style.display='block';
  document.getElementById('campaignDetailView').classList.remove('active');
  currentCampaignId = null;
  // Después de limpiar currentCampaignId, si no rutaActual() seguiría armando
  // la ruta de la campaña que acabamos de cerrar.
  try { escribirRuta(); } catch(e){}
  try { marcarFresco(document.getElementById('page-campannas')); } catch(e){}
  renderCampaignGrid();
}

// El grid de Resumen (responsables, presupuesto, participantes) se re-renderiza
// también desde rerenderCurrent(): antes solo se pintaba al abrir la campaña,
// así que un cambio de responsables no se veía hasta volver a entrar.
function renderCampaignInfoGrid(c) {
  const statusBadge = (s) => {
    const map = {'En proceso':'badge-blue','Ajustes':'badge-yellow','Pendiente cliente':'badge-orange','En reporte':'badge-red','En producción':'badge-purple','Completado':'badge-green'};
    return `<span class="badge ${map[s]||'badge-gray'}">${_esc(s)}</span>`;
  };

  document.getElementById('detailCampaignName').textContent = c.name;
  document.getElementById('detailCampaignStatus').innerHTML = statusBadge(c.status);
  document.getElementById('detailCampaignSub').textContent = `${c.client} · ${c.season||''}`;

  // Info grid — budget only visible to admin
  const fmtMXN = (n) => n > 0 ? `$${Number(n).toLocaleString('es-MX',{maximumFractionDigits:0})} MXN` : '—';
  const budgetField = canSeeCosts() ? (() => {
    const bc = c.budgetClient || 0;
    const bm = c.budgetMargin || 0;
    const ops = bc > 0 ? bc - (bc * bm / 100) : 0;
    const ganancia = bc - ops;
    // fallback for old single-budget campaigns
    if(!bc && c.budget) return `<div class="info-field"><div class="info-label">Presupuesto</div><div class="info-value">${_esc(c.budget)}</div></div>`;
    return `
      <div class="info-field">
        <div class="info-label">Presupuesto cliente</div>
        <div class="info-value">${fmtMXN(bc)}</div>
      </div>
      <div class="info-field">
        <div class="info-label">% de ganancia</div>
        <div class="info-value">${bm > 0 ? bm+'%' : '—'}</div>
      </div>
      <div class="info-field" style="background:var(--mint-pale);border-radius:10px;padding:10px 14px;">
        <div class="info-label" style="color:#3a7a5e;">Presupuesto operaciones</div>
        <div class="info-value" style="color:#3a7a5e;font-weight:700;">${fmtMXN(ops)}${ganancia>0?` <span style="font-size:11px;color:var(--text-muted);font-weight:400;">(ganancia ${fmtMXN(ganancia)})</span>`:''}</div>
      </div>`;
  })()
  : `<div class="info-field"><div class="info-label">Presupuesto</div><div class="info-value" style="color:var(--text-muted);font-style:italic;">🔒 Restringido</div></div>`;

  document.getElementById('campaignInfoGrid').innerHTML = `
    <div class="info-field"><div class="info-label">Cliente</div><div class="info-value">${_esc(c.client)}</div></div>
    <div class="info-field"><div class="info-label">Temporada</div><div class="info-value">${_esc(c.season||'—')}</div></div>
    <div class="info-field"><div class="info-label">Objetivo</div><div class="info-value">${_esc(c.objective||'—')}</div></div>
    <div class="info-field"><div class="info-label">Core Message</div><div class="info-value">${_esc(c.coreMessage||'—')}</div></div>
    ${budgetField}
    ${(()=>{
      const r = c.responsables || {};
      // Administración faltaba: era responsable de un área que el detalle no
      // dibujaba, así que su nombre no aparecía en ningún lado de la campaña.
      const areaLabel = {operaciones:'Operaciones', cuentas:'Cuentas', creativo:'Creativo', data:'Data', administracion:'Administración'};
      const areaColor = {operaciones:'badge-area-Operaciones', cuentas:'badge-area-Cuentas', creativo:'badge-area-Creativo', data:'badge-area-Data', administracion:'badge-area-Administración'};
      return Object.entries(areaLabel).map(([key, label]) => {
        const uids = getAreaUids(r, key);
        const content = uids.length ? uids.map(uid => userChip(uid)).join(' ') : `<span style="color:var(--text-muted);font-size:13px;">Sin asignar</span>`;
        return `<div class="info-field"><div class="info-label"><span class="badge ${areaColor[key]}" style="font-size:10px;">${label}</span></div><div class="info-value" style="display:flex;flex-wrap:wrap;gap:4px;">${content}</div></div>`;
      }).join('');
    })()}
    <div class="info-field"><div class="info-label">Duración</div><div class="info-value">${c.startDate?formatDate(c.startDate):'—'}${c.endDate?' → '+formatDate(c.endDate):''}</div></div>
    <div class="info-field"><div class="info-label">Status</div><div class="info-value">${statusBadge(c.status)}</div></div>
    <div class="info-field" style="grid-column:1/-1;">
      <div class="info-label" style="display:flex;justify-content:space-between;align-items:center;">
        <span>Seguimiento</span>
        <button class="btn btn-ghost btn-sm" onclick="toggleCampaignSubscription('${c.id}')" style="font-size:11px;">${isSubscribed(c.id)?`<span class="icn-inline">${ICN_bellOff}</span>Dejar de seguir`:`<span class="icn-inline">${ICN_bell}</span>Seguir`}</button>
      </div>
      <div class="info-value" style="font-size:13px;color:var(--text-muted);margin-top:6px;">
        ${isSubscribed(c.id)
          ? 'La sigues: aparece en tu tablero y te llegan avisos cuando cambia.'
          : 'Síguela para tenerla en tu tablero y enterarte de los cambios.'}
      </div>
    </div>
  `;
}

function openCampaignDetail(cid) {
  currentCampaignId = cid;
  try { localStorage.setItem('cmos:lastCampaignId', cid); } catch(e){}
  // Entrar a una campaña es un paso de navegación: tiene que quedar en el
  // historial para que Atrás regrese al listado y no salga de la app.
  try { escribirRuta(); } catch(e){}
  const campaigns = getData('campaigns');
  const c = campaigns.find(x=>x.id===cid);
  if(!c) return;
  if(!canSeeCampaign(c)) {
    showToast('No estás en esta campaña. Pide que te agreguen como participante.','error');
    showCampaignList();
    return;
  }

  document.getElementById('campaignList').style.display='none';
  document.getElementById('campaignDetailView').classList.add('active');
  // Marca de entrada ANTES de pintar: las tarjetas del detalle sólo hacen su
  // entrada escalonada si nacen con `.is-fresh` puesto en la página.
  try { marcarFresco(document.getElementById('page-campannas')); } catch(e){}

  renderCampaignInfoGrid(c);
  try { renderCampaignSources(c); } catch(e){ console.warn('sources render', e); }

  renderCampaignInfluencers(c);
  renderCampaignTasks(c);
  try { renderCampaignEventos(c); } catch(e){ console.warn('eventos render', e); }
  renderCampaignDocs(c);
  renderCampaignFlow(c);
  try { renderCampaignApproval(c); } catch(e){ console.warn('approval render', e); }
  renderCampaignTracker(c);
  renderCampaignMetricsSection(c);
  try { renderCampaignClients(c); } catch(e){ console.warn('clients render', e); }
  try { renderCampaignProgress(c); } catch(e){ console.warn('progress render', e); }
  try { renderCampaignCoherence(c); } catch(e){ console.warn('coherence render', e); }

  // Reset tabs
  document.querySelectorAll('.detail-tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t=>t.classList.remove('active'));
  document.querySelector('[data-tab="resumen"]').classList.add('active');
  document.getElementById('tab-resumen').classList.add('active');
}

// ============================================================
// CAMPAIGN COHERENCE — pull stats from Tracker + Escenario + Metrics
// so Resumen shows the same numbers everywhere and any drift is
// surfaced in a "Necesita atención" panel.
// ============================================================
function _campaignCoherenceData(c) {
  const norm = s => String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[_\s@]+/g,' ').trim();

  // Tracker counts
  const trackerRows = c.trackerRows || [];
  let trackerPublicado = 0, trackerTotal = 0;
  const trackerByCreator = new Map();
  const trackerPubByCreator = new Map();
  const trackerPubsList = []; // {creator, fecha, hasLink, raw}
  trackerRows.forEach(row => {
    const nm = (typeof _trackerGet==='function' ? _trackerGet(row, TRACKER_NAME_KEYS) : (row['NOMBRE']||row['Nombre']||row['TALENTO']||'')).trim();
    const ec = String((typeof _trackerStatusOf==='function'
      ? _trackerStatusOf(row)
      : (row['ESTATUS CONTENIDO']||row['Estatus Contenido']||''))).trim();
    const link = String((typeof _trackerGet==='function' ? _trackerGet(row,['LINK TO POST','Link to Post','Link','URL']) : (row['LINK TO POST']||row['Link to Post']||''))).trim();
    const fecha = String((typeof _trackerGet==='function' ? _trackerGet(row,['FECHA DE POST','Fecha de Post','Fecha']) : (row['FECHA DE POST']||row['Fecha de Post']||''))).trim();
    if(nm || ec) trackerTotal++;
    if(_isPublishedStatus(ec)) {
      trackerPublicado++;
      trackerPubsList.push({ creator:nm, fecha, hasLink: !!(link && /http|link/i.test(link)), raw: row });
      if(nm) trackerPubByCreator.set(norm(nm), (trackerPubByCreator.get(norm(nm))||0) + 1);
    }
    if(nm) trackerByCreator.set(norm(nm), nm);
  });

  // Escenario parsed. Memoizado con las mismas marcas que usa la tarjeta de
  // campaña: desde que el Resumen llama a esto por cada campaña propia, parsear
  // miles de filas en cada repintado se nota.
  let escenario = null;
  if(c.escenarioRows && c.escenarioRows.length && typeof parseEscenarioRows === 'function') {
    try {
      if(c._memoEscenario && c._memoEscenarioStamp === c.escenarioRows.length) {
        escenario = c._memoEscenario;
      } else {
        escenario = parseEscenarioRows(c.escenarioRows);
        c._memoEscenario = escenario;
        c._memoEscenarioStamp = c.escenarioRows.length;
      }
    } catch(e){}
  }
  const escenarioCreators = escenario ? escenario.creators : [];
  const escenarioCreatorNames = new Map(escenarioCreators.map(cr => [norm(cr.nombre), cr]));
  // Campaign-form goal takes priority (source of truth for CPV/CPE),
  // falls back to BIG NUMBERS sheet row, then sum of creators.
  const cGoal = c.goal || {};
  const escenarioContTotal = cGoal.contenidos
    || (escenario && escenario.goal && escenario.goal.totalContenidos)
    || escenarioCreators.reduce((a,cr)=>a+cr.contenidosTotal, 0);
  const escenarioViewsEst = cGoal.views
    || (escenario && escenario.goal && escenario.goal.viewsEstTotal)
    || escenarioCreators.reduce((a,cr)=>a+cr.viewsEstTotal, 0);
  const escenarioEngEst = cGoal.engagement
    || (escenario && escenario.goal && escenario.goal.engagementEst)
    || escenarioCreators.reduce((a,cr)=>a+cr.engagementEstTotal, 0);

  // UGC parsed results (separate sheet, agency-reported)
  const ugcResults = (typeof _parseUgcResults === 'function') ? _parseUgcResults(c.ugcRows) : null;
  const ugcCommitted = (escenario && escenario.ugc) ? (escenario.ugc.cantidadContenidos || 0) : 0;
  const ugcPublicado = ugcResults ? ugcResults.contenidosPublicados : 0;

  // Metrics counts (rows registered in the metrics / ROI sheet)
  const metricsRows = c.cachedMetrics || [];
  const metricsByCreator = new Map();
  metricsRows.forEach(r => {
    const name = String(r['Influencer Name']||r['Influencer']||r['Creator']||r['Creador']||r['Cuenta']||r['NOMBRE']||r['Nombre']||r['Handle']||r['Perfil']||'').trim();
    if(!name) return;
    metricsByCreator.set(norm(name), (metricsByCreator.get(norm(name))||0) + 1);
  });
  const metricsRowsCount = metricsRows.length;

  // Detect issues
  const issues = [];

  // 1. Tracker Publicado vs Metrics row count
  if(trackerPublicado > 0 && metricsRowsCount > 0 && trackerPublicado !== metricsRowsCount) {
    issues.push({
      severity: trackerPublicado > metricsRowsCount ? 'error' : 'warn',
      title: `Tracker reporta ${trackerPublicado} publicaciones, métricas solo tiene ${metricsRowsCount} filas`,
      detail: trackerPublicado > metricsRowsCount
        ? `Faltan ${trackerPublicado - metricsRowsCount} publicaciones en el sheet de métricas / ROI.`
        : `Hay ${metricsRowsCount - trackerPublicado} filas en métricas sin reflejarse como Publicado en el tracker.`,
      action: { label:'Abrir tracker', tab:'tracker' }
    });
  }

  // 2. Publicados en tracker sin métricas registradas (por creador)
  const trackerPubsSinMetricas = [];
  trackerPubByCreator.forEach((count, k) => {
    const m = metricsByCreator.get(k) || 0;
    if(metricsRowsCount > 0 && m < count) {
      trackerPubsSinMetricas.push({ creator: trackerByCreator.get(k), pubs: count, metricas: m });
    }
  });
  if(trackerPubsSinMetricas.length) {
    issues.push({
      severity: 'warn',
      title: `${trackerPubsSinMetricas.length} creador(es) con publicaciones sin métricas`,
      detail: trackerPubsSinMetricas.slice(0,5).map(x => `${x.creator} (${x.metricas}/${x.pubs})`).join(', ') + (trackerPubsSinMetricas.length > 5 ? '…' : ''),
      action: { label:'Ver métricas', tab:'metricas' }
    });
  }

  // 3. Creadores del escenario que no aparecen en el tracker (no se les ha posteado)
  if(escenarioCreators.length && trackerRows.length) {
    const noAparecen = escenarioCreators.filter(cr => !trackerByCreator.has(norm(cr.nombre)));
    if(noAparecen.length) {
      issues.push({
        severity: 'info',
        title: `${noAparecen.length} creador(es) del escenario sin actividad en el tracker`,
        detail: noAparecen.slice(0,5).map(c=>c.nombre).join(', ') + (noAparecen.length > 5 ? '…' : ''),
        action: { label:'Abrir tracker', tab:'tracker' }
      });
    }
  }

  // 4. Tracker con creadores que no están en el escenario
  if(escenarioCreators.length) {
    const extra = [];
    trackerByCreator.forEach((nm, k) => {
      if(!escenarioCreatorNames.has(k)) extra.push(nm);
    });
    if(extra.length) {
      issues.push({
        severity: 'info',
        title: `${extra.length} creador(es) en tracker no están en el escenario`,
        detail: extra.slice(0,5).join(', ') + (extra.length > 5 ? '…' : ''),
        action: { label:'Abrir influencers', tab:'influencers' }
      });
    }
  }

  // 5. Publicados sin FECHA DE POST o sin LINK
  const sinFecha = trackerPubsList.filter(p => !p.fecha).length;
  const sinLink  = trackerPubsList.filter(p => !p.hasLink).length;
  if(sinFecha) issues.push({ severity:'warn', title:`${sinFecha} publicación(es) sin fecha`, detail:'Falta FECHA DE POST en el master tracker.', action:{label:'Abrir tracker',tab:'tracker'} });
  if(sinLink)  issues.push({ severity:'warn', title:`${sinLink} publicación(es) sin LINK TO POST`, detail:'Sin link no se puede verificar en plataforma.', action:{label:'Abrir tracker',tab:'tracker'} });

  // 6. Excede compromiso (publicaron más de lo cerrado por creador)
  const excedido = [];
  escenarioCreators.forEach(cr => {
    const pubs = trackerPubByCreator.get(norm(cr.nombre)) || 0;
    if(cr.contenidosTotal > 0 && pubs > cr.contenidosTotal) excedido.push({ creator:cr.nombre, pubs, cerrado:cr.contenidosTotal });
  });
  if(excedido.length) {
    issues.push({
      severity:'info',
      title:`${excedido.length} creador(es) superaron el contenido cerrado`,
      detail: excedido.slice(0,5).map(x=>`${x.creator} (${x.pubs}/${x.cerrado})`).join(', '),
      action:{label:'Abrir influencers',tab:'influencers'}
    });
  }

  // When the escenario sheet provides a goal/totals row (BIG NUMBERS /
  // TOTAL) we treat that number as the definitive cerrado total — it
  // already encompasses both AON and UGC commitments and adding the UGC
  // row again would double-count. Only when no goal row exists do we
  // fall back to summing AON creators + UGC commitments.
  const goalProvided = escenario && escenario.goal && (escenario.goal.totalContenidos > 0);
  const totalCerrado = goalProvided
    ? escenarioContTotal
    : (escenarioContTotal + ugcCommitted);

  return {
    trackerPublicado, trackerTotal,
    escenarioContTotal, escenarioViewsEst, escenarioEngEst,
    metricsRowsCount,
    issues,
    escenario,
    ugcCommitted, ugcPublicado, ugcResults,
    totalPublicado: trackerPublicado + ugcPublicado,
    totalCerrado,
    goalProvided,
  };
}

// Las pestañas del detalle son seis: resumen, influencers, tracker, pendientes,
// documentos y flujo. Métricas NO es una de ellas —vive dentro de Resumen— y
// varios botones pedían 'metricas': el resultado era que se apagaban las seis
// pestañas y el detalle se quedaba en blanco hasta hacer clic en otra. Un
// destino que no existe cae en Resumen, y si era la sección de métricas se
// hace scroll hasta ella en vez de dejar al usuario buscándola.
/* Qué pestaña del detalle está abierta ahora mismo. */
function campaignTabActiva() {
  const el = document.querySelector('#campaignDetailView .tab-content.active');
  return el ? el.id.replace(/^tab-/, '') : 'resumen';
}

/* Repinta SOLO la pestaña abierta (y el resumen, que es la portada del
   detalle). rerenderCurrent() entra por aquí en cada snapshot: antes repintaba
   las seis pestañas, incluida la tabla del tracker, estuvieran o no a la vista.

   `forzar` = se acaba de cambiar de pestaña, así que hay que pintar aunque sea
   la misma que ya estaba. */
function renderCampaignTab(c, tab, completo) {
  if(!c) return;
  const t = tab || campaignTabActiva();
  try { renderCampaignInfoGrid(c); } catch(e){ console.warn('info grid render', e); }
  // El panel de fuentes SÍ se refresca en cada repintado: sus seis casillas son
  // justamente el estado de carga, que cambia solo cuando llega un tracker o un
  // escenario. No lleva ningún campo dentro que se pueda estar escribiendo.
  try { renderCampaignSources(c); } catch(e){ console.warn('sources render', e); }
  if(t === 'resumen') {
    /* Los demás bloques del Resumen sólo se rehacen al ABRIR la pestaña, no en cada
       snapshot. Varios tienen un campo dentro (la URL del sheet de métricas,
       la nota de aprobación): repintarlos mientras alguien escribe le borra lo
       tecleado. Y ninguno cambia por su cuenta — cambian cuando cambia la
       campaña, y eso ya trae su propio paso por aquí. */
    if(completo) {
      try { renderCampaignApproval(c); } catch(e){ console.warn('approval render', e); }
      try { renderCampaignMetricsSection(c); } catch(e){ console.warn('metrics render', e); }
      try { renderCampaignClients(c); } catch(e){ console.warn('clients render', e); }
      try { renderCampaignProgress(c); } catch(e){ console.warn('progress render', e); }
      try { renderCampaignCoherence(c); } catch(e){ console.warn('coherence render', e); }
    }
  }
  else if(t === 'influencers') renderCampaignInfluencers(c);
  else if(t === 'pendientes')  { renderCampaignTasks(c); try { renderCampaignEventos(c); } catch(e){} }
  else if(t === 'documentos')  renderCampaignDocs(c);
  else if(t === 'flujo')       renderCampaignFlow(c);
  else if(t === 'tracker')     renderCampaignTracker(c);
}

function _switchCampaignTab(tabName) {
  const destino = document.getElementById('tab-'+tabName) ? tabName : 'resumen';
  document.querySelectorAll('.detail-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === destino));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.toggle('active', t.id === 'tab-'+destino));
  // La pestaña que se abre puede llevar varios snapshots sin repintarse (ver
  // renderCampaignTab): se pone al día justo al mostrarla.
  try {
    const c = (_cache.campaigns||[]).find(x => x.id === currentCampaignId);
    if(c) renderCampaignTab(c, destino, true);
  } catch(e){ console.warn('switch tab render', e); }
  try { localStorage.setItem('cmos:lastCampaignTab', destino); } catch(e){}
  if(destino !== tabName) {
    const secciones = { metricas:'campaignMetricsSection' };
    const el = document.getElementById(secciones[tabName] || '');
    if(el) { try { el.scrollIntoView({ behavior:'smooth', block:'start' }); } catch(e) { el.scrollIntoView(); } }
  }
}

// ============================================================
// CAMPAIGN CLIENT CONTACTS
// ============================================================
function renderCampaignClients(c) {
  const el = document.getElementById('campaignClientsSection');
  if(!el) return;
  const contacts = Array.isArray(c.clientContacts) ? c.clientContacts : [];
  const canEdit = typeof puedeEditarCampana === 'function' ? puedeEditarCampana(c) : ((typeof isAdmin === 'function' && isAdmin()) || c.createdBy === currentUser?.uid);
  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
      <h4 style="font-size:13px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.8px;margin:0;"><span class="icn-inline">${ICN_users}</span>Clientes · Puntos de contacto</h4>
      ${canEdit ? `<button class="btn btn-ghost btn-sm" onclick="openClientContactModal('${c.id}')" style="font-size:11px;">+ Agregar contacto</button>` : ''}
    </div>
    ${contacts.length === 0
      ? `<div class="empty-state" style="padding:14px;"><p style="font-size:12px;">Sin contactos. Agrega al primer punto de contacto del cliente para esta campaña.</p></div>`
      : `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px;">
          ${contacts.map((ct, idx) => `
            <div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:12px 14px;position:relative;">
              ${canEdit ? `
                <div style="position:absolute;top:8px;right:8px;display:flex;gap:4px;">
                  <button onclick="openClientContactModal('${c.id}', ${idx})" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:12px;padding:2px 4px;" title="Editar">✎</button>
                  <button onclick="deleteClientContact('${c.id}', ${idx})" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:12px;padding:2px 4px;" title="Eliminar">✕</button>
                </div>` : ''}
              <div style="font-size:14px;font-weight:700;color:var(--text);">${_esc(ct.name)||'Sin nombre'}</div>
              ${ct.cargo ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${_esc(ct.cargo)}</div>` : ''}
              ${ct.email ? `<a href="mailto:${_esc(ct.email)}" style="font-size:12px;color:var(--pink);display:block;margin-top:6px;text-decoration:none;">${_esc(ct.email)}</a>` : ''}
              ${ct.linkedin ? `<a href="${_esc(_safeUrl(ct.linkedin))}" target="_blank" rel="noopener" style="font-size:12px;color:#0a66c2;display:inline-flex;align-items:center;gap:4px;margin-top:4px;text-decoration:none;font-weight:600;"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M19 0H5a5 5 0 0 0-5 5v14a5 5 0 0 0 5 5h14a5 5 0 0 0 5-5V5a5 5 0 0 0-5-5zM8 19H5V8h3v11zM6.5 6.7a1.8 1.8 0 1 1 0-3.6 1.8 1.8 0 0 1 0 3.6zM20 19h-3v-5.6c0-3.4-4-3.1-4 0V19h-3V8h3v1.8c1.4-2.6 7-2.8 7 2.5V19z"/></svg> LinkedIn</a>` : ''}
              ${_clientPrefsHtml(ct)}
              ${ct.notes ? `<div style="font-size:11px;color:var(--text-muted);margin-top:8px;background:var(--bg);padding:6px 8px;border-radius:8px;line-height:1.4;white-space:pre-wrap;">${_esc(ct.notes)}</div>` : ''}
            </div>`).join('')}
        </div>`}`;
}

/* Lo que sabemos de cómo quiere el seguimiento se lee del contacto y, si ahí no
   está, de su ficha en Clientes: es la misma persona y la respuesta no cambia
   por campaña. Sin respuesta no se pinta nada — una fila que dice "Sin definir"
   ocupa lugar sin decir nada. */
function _clientPrefsHtml(ct) {
  if(typeof prefClienteLabel !== 'function') return '';
  const prefs = (typeof clientePrefs === 'function') ? clientePrefs(ct) : {};
  const filas = [
    ['canalSeguimiento', 'Seguimiento'],
    ['canalContacto',    'Contacto'],
  ].map(([campo, titulo]) => {
    const valor = (ct[campo] && ct[campo] !== 'na') ? ct[campo] : prefs[campo];
    if(!valor || valor === 'na') return '';
    const otro = ct[campo + 'Otro'] || prefs[campo + 'Otro'] || '';
    return `<div style="display:flex;gap:6px;font-size:11px;line-height:1.4;">
      <span style="color:var(--text-muted);flex-shrink:0;">${titulo}:</span>
      <span style="color:var(--text);font-weight:600;">${_esc(prefClienteLabel(campo, valor, otro))}</span>
    </div>`;
  }).filter(Boolean).join('');
  return filas ? `<div style="margin-top:8px;display:flex;flex-direction:column;gap:3px;">${filas}</div>` : '';
}

let _editingClientContact = { campaignId:null, idx:null };
function openClientContactModal(cid, idx) {
  const campaigns = getData('campaigns');
  const c = campaigns.find(x => x.id === cid);
  if(!c) return;
  _editingClientContact = { campaignId:cid, idx: typeof idx==='number'?idx:null };
  const ct = (typeof idx==='number' && c.clientContacts && c.clientContacts[idx]) || {name:'',email:'',cargo:'',linkedin:'',notes:''};
  // Cómo quiere el seguimiento es un dato de la PERSONA, no de la campaña: si ya
  // lo contestaron en la pestaña Clientes, el formulario abre con eso en vez de
  // pedir el mismo dato otra vez.
  const prefs = (typeof clientePrefs === 'function') ? clientePrefs(ct) : {};
  const pref = (campo) => (ct[campo] && ct[campo] !== 'na') ? ct[campo] : (prefs[campo] || 'na');
  const prefOtro = (campo) => ct[campo + 'Otro'] || prefs[campo + 'Otro'] || '';
  // Ensure modal exists; create on demand
  if(!document.getElementById('clientContactModal')) {
    const html = `
      <div class="modal-overlay" id="clientContactModal">
        <div class="modal" style="max-width:480px;">
          <div class="modal-header">
            <div class="modal-title" id="clientContactTitle">Contacto cliente</div>
            <button class="modal-close" onclick="closeModal('clientContactModal')"><span class="icn-close"></span></button>
          </div>
          <div class="form-group"><label class="form-label">Nombre</label><input type="text" id="fClientName" class="form-input" placeholder="Nombre completo"></div>
          <div class="form-group"><label class="form-label">Cargo</label><input type="text" id="fClientCargo" class="form-input" placeholder="Brand Manager, Director, ..."></div>
          <div class="form-group"><label class="form-label">Correo</label><input type="email" id="fClientEmail" class="form-input" placeholder="nombre@cliente.com"></div>
          <div class="form-group"><label class="form-label">LinkedIn</label><input type="url" id="fClientLinkedin" class="form-input" placeholder="https://www.linkedin.com/in/..."></div>
          <div class="form-group"><label class="form-label" for="fClientPoc">Tipo de contacto</label>
            <select id="fClientPoc" class="form-input">
              <option value="principal">POC principal</option>
              <option value="secundario">POC secundario</option>
              <option value="na">Sin definir</option>
            </select>
          </div>
          <fieldset class="form-group cli-pref-set">
            <legend class="form-label">Cómo le gusta el seguimiento</legend>
            <p class="cli-pref-ayuda">Son dos conversaciones distintas: dónde se revisa el contenido y por dónde se le escribe para todo lo demás.</p>
            <label class="form-label" for="fClientSeguimiento">Seguimiento de contenidos</label>
            <select id="fClientSeguimiento" class="form-input" onchange="toggleClientPrefOtro('Seguimiento')">${prefOpcionesHtml('canalSeguimiento','na')}</select>
            <input type="text" id="fClientSeguimientoOtro" class="form-input" style="margin-top:8px;" hidden
              aria-label="¿Cómo prefiere revisar el contenido?" placeholder="¿Cómo prefiere revisar el contenido?">
            <label class="form-label" for="fClientContacto" style="margin-top:12px;">Método de contacto preferido</label>
            <select id="fClientContacto" class="form-input" onchange="toggleClientPrefOtro('Contacto')">${prefOpcionesHtml('canalContacto','na')}</select>
            <input type="text" id="fClientContactoOtro" class="form-input" style="margin-top:8px;" hidden
              aria-label="¿Por dónde prefiere que le escribamos?" placeholder="¿Por dónde prefiere que le escribamos?">
          </fieldset>
          <div class="form-group"><label class="form-label">Notas</label><textarea id="fClientNotes" class="form-input" rows="3" placeholder="Preferencias, horarios, contexto..."></textarea></div>
          <div class="modal-footer">
            <button class="btn btn-ghost" onclick="closeModal('clientContactModal')">Cancelar</button>
            <button class="btn btn-pink" onclick="saveClientContact()">Guardar</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    // Attach overlay-click-to-close: this modal is lazy-mounted after the
    // boot listener pass at line 7249 already ran.
    const ov = document.getElementById('clientContactModal');
    if(ov) ov.addEventListener('click', e => { if(e.target === ov) closeModal(ov.id); });
  }
  document.getElementById('clientContactTitle').textContent = typeof idx==='number' ? 'Editar contacto' : 'Nuevo contacto cliente';
  document.getElementById('fClientName').value     = ct.name || '';
  document.getElementById('fClientCargo').value    = ct.cargo || '';
  document.getElementById('fClientEmail').value    = ct.email || '';
  document.getElementById('fClientLinkedin').value = ct.linkedin || '';
  document.getElementById('fClientNotes').value    = ct.notes || '';
  document.getElementById('fClientPoc').value      = ct.pocTipo || 'na';
  document.getElementById('fClientSeguimiento').value     = pref('canalSeguimiento');
  document.getElementById('fClientSeguimientoOtro').value = prefOtro('canalSeguimiento');
  document.getElementById('fClientContacto').value        = pref('canalContacto');
  document.getElementById('fClientContactoOtro').value    = prefOtro('canalContacto');
  toggleClientPrefOtro('Seguimiento');
  toggleClientPrefOtro('Contacto');
  openModal('clientContactModal');
}

/* El campo de texto libre sólo existe cuando se eligió "otro": pedir la
   explicación siempre visible es ruido para las cuatro opciones que ya la
   traen. */
function toggleClientPrefOtro(cual) {
  const sel = document.getElementById('fClient' + cual);
  const inp = document.getElementById('fClient' + cual + 'Otro');
  if(!sel || !inp) return;
  inp.hidden = sel.value !== 'otro';
}

function saveClientContact() {
  const {campaignId, idx} = _editingClientContact;
  if(!campaignId) return;
  const name  = document.getElementById('fClientName').value.trim();
  if(!name) { showToast('Nombre requerido','error'); return; }
  const cargo = document.getElementById('fClientCargo').value.trim();
  const email = document.getElementById('fClientEmail').value.trim();
  let linkedin = document.getElementById('fClientLinkedin').value.trim();
  if(linkedin && !/^https?:\/\//i.test(linkedin)) linkedin = 'https://' + linkedin;
  const notes = document.getElementById('fClientNotes').value.trim();
  const pocTipo = document.getElementById('fClientPoc').value || 'na';
  const canalSeguimiento = document.getElementById('fClientSeguimiento').value || 'na';
  const canalContacto    = document.getElementById('fClientContacto').value || 'na';
  // El texto de "otro" sólo se guarda si "otro" sigue elegido: si no, quedaría
  // una explicación colgada de una opción que ya no es.
  const canalSeguimientoOtro = canalSeguimiento === 'otro' ? document.getElementById('fClientSeguimientoOtro').value.trim() : '';
  const canalContactoOtro    = canalContacto    === 'otro' ? document.getElementById('fClientContactoOtro').value.trim()    : '';
  const campaigns = getData('campaigns');
  const c = campaigns.find(x => x.id === campaignId);
  if(!c) return;
  if(!Array.isArray(c.clientContacts)) c.clientContacts = [];
  const obj = { name, cargo, email, linkedin, notes, pocTipo, canalSeguimiento, canalSeguimientoOtro, canalContacto, canalContactoOtro };
  if(typeof idx === 'number') c.clientContacts[idx] = obj;
  else c.clientContacts.push(obj);
  guardarCampana(c);
  closeModal('clientContactModal');
  showToast('Contacto guardado','success'); try { showSuccessCheck(); } catch(e){}
  // La persona también entra a la base de clientes, con su periodo abierto en
  // esta campaña. Si falla, el contacto de la campaña ya quedó guardado: la
  // base se pone al día la próxima vez que se toque.
  try { clienteUpsertDesdeCampana(obj, c); } catch(e){ console.warn('sync cliente', e); }
  if(currentCampaignId === campaignId) renderCampaignClients(c);
}

async function deleteClientContact(cid, idx) {
  if(!await confirmar({
    title: '¿Eliminar este contacto?',
    body: 'Se quita de esta campaña. Su ficha y su historial se conservan en Clientes.',
    confirmLabel: 'Eliminar contacto',
    cancelLabel: 'Conservar',
    danger: true,
  })) return;
  const campaigns = getData('campaigns');
  const c = campaigns.find(x => x.id === cid);
  if(!c || !Array.isArray(c.clientContacts)) return;
  const quitado = c.clientContacts[idx];
  c.clientContacts.splice(idx, 1);
  guardarCampana(c);
  // En la base de clientes NO se borra: se cierra su periodo en esta campaña.
  // Que alguien salga de una cuenta es justamente cuando más importa poder
  // consultar qué sabíamos de esa persona.
  try { clienteCerrarEnCampana(quitado, c); } catch(e){ console.warn('cerrar cliente', e); }
  if(currentCampaignId === cid) renderCampaignClients(c);
}

function renderCampaignProgress(c) {
  const el = document.getElementById('campaignProgressSection');
  if(!el) return;
  const d = _campaignCoherenceData(c);
  const total = d.totalCerrado || 0;
  const pubs = d.totalPublicado || 0;
  const pct = total > 0 ? Math.round((pubs/total) * 100) : 0;
  const splitLine = d.ugcResults ? `AON ${d.trackerPublicado}/${d.escenarioContTotal||'—'} · UGC ${d.ugcPublicado}/${d.ugcCommitted||'—'}` : '';
  // CPV / CPE from campaign-registered goal (the totals "vendidos")
  const budget = c.budgetClient || c.budget || 0;
  const fmtMXN = n => n>0 ? '$'+Number(n).toLocaleString('es-MX',{maximumFractionDigits:2}) : '—';
  const cpv = (budget>0 && d.escenarioViewsEst>0) ? fmtMXN(budget/d.escenarioViewsEst) : '—';
  const cpe = (budget>0 && d.escenarioEngEst>0)   ? fmtMXN(budget/d.escenarioEngEst)   : '—';
  const s = (typeof _semaforo === 'function') ? _semaforo(pct) : { color:'#0a0a0c', bg:'#e8e6ec' };
  const pctLabel = total > 0 ? `${pct}%` : '—';

  el.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:14px;align-items:stretch;">
      <button onclick="_switchCampaignTab('tracker')" style="flex:1;min-width:240px;background:var(--white);border:1.5px solid var(--border);border-radius:14px;padding:16px 18px;cursor:pointer;text-align:left;transition:all var(--dur-quick);font-family:inherit;color:var(--text);" onmouseover="this.style.borderColor='var(--pink)'" onmouseout="this.style.borderColor='var(--border)'">
        <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.8px;">Publicaciones</div>
        <div style="display:flex;align-items:baseline;gap:8px;margin-top:6px;">
          <div style="font-size:32px;font-weight:800;line-height:1;">${pubs}</div>
          <div style="font-size:14px;color:var(--text-muted);">/ ${total||'—'} cerradas</div>
        </div>
        <div style="margin-top:10px;height:8px;background:var(--bg);border-radius:6px;overflow:hidden;">
          <div style="height:100%;width:${Math.min(100,pct)}%;background:${s.bg};border-right:2px solid ${s.color};transition:width var(--dur-fast);"></div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;">
          <span style="font-size:11px;color:var(--text-muted);">% Completitud</span>
          <span style="font-size:13px;font-weight:800;color:${s.color};">${pctLabel}</span>
        </div>
        ${splitLine?`<div style="font-size:10px;color:var(--text-muted);margin-top:4px;">${splitLine}</div>`:''}
        <div style="font-size:10px;color:var(--text-muted);margin-top:6px;">Click para ver el tracker →</div>
      </button>
      <button onclick="_switchCampaignTab('influencers')" style="flex:1;min-width:200px;background:var(--white);border:1.5px solid var(--border);border-radius:14px;padding:16px 18px;cursor:pointer;text-align:left;transition:all var(--dur-quick);font-family:inherit;color:var(--text);" onmouseover="this.style.borderColor='var(--pink)'" onmouseout="this.style.borderColor='var(--border)'">
        <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.8px;">Escenario · Goal</div>
        <div style="font-size:24px;font-weight:800;line-height:1;margin-top:6px;">${total || '—'} <span style="font-size:12px;color:var(--text-muted);font-weight:600;">contenidos</span></div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:6px;">${d.escenarioViewsEst ? formatNum(d.escenarioViewsEst)+' views est.' : 'Sin escenario vinculado'}</div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:6px;">Click para ver escenario →</div>
      </button>
      <button onclick="_switchCampaignTab('metricas')" style="flex:1;min-width:200px;background:var(--white);border:1.5px solid var(--border);border-radius:14px;padding:16px 18px;cursor:pointer;text-align:left;transition:all var(--dur-quick);font-family:inherit;color:var(--text);" onmouseover="this.style.borderColor='var(--pink)'" onmouseout="this.style.borderColor='var(--border)'">
        <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.8px;">Métricas / ROI</div>
        <div style="font-size:24px;font-weight:800;line-height:1;margin-top:6px;">${d.metricsRowsCount} <span style="font-size:12px;color:var(--text-muted);font-weight:600;">filas registradas</span></div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:6px;">${d.metricsRowsCount === d.trackerPublicado && d.trackerPublicado > 0 ? '✅ Coincide con tracker' : (d.metricsRowsCount===0 ? 'Sin métricas cargadas' : '⚠ Difiere del tracker')}</div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:6px;">Click para ver métricas →</div>
      </button>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:14px;margin-top:14px;">
      <div style="flex:1;min-width:160px;background:var(--white);border:1.5px solid var(--border);border-radius:14px;padding:14px 16px;">
        <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.8px;">CPV (vendido)</div>
        <div style="font-size:22px;font-weight:800;line-height:1;margin-top:6px;">${cpv}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Budget / ${d.escenarioViewsEst?formatNum(d.escenarioViewsEst)+' views est.':'—'}</div>
      </div>
      <div style="flex:1;min-width:160px;background:var(--white);border:1.5px solid var(--border);border-radius:14px;padding:14px 16px;">
        <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.8px;">CPE (vendido)</div>
        <div style="font-size:22px;font-weight:800;line-height:1;margin-top:6px;">${cpe}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Budget / ${d.escenarioEngEst?formatNum(d.escenarioEngEst)+' eng. est.':'—'}</div>
      </div>
      <div style="flex:1;min-width:160px;background:var(--white);border:1.5px solid var(--border);border-radius:14px;padding:14px 16px;">
        <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.8px;">Budget cliente</div>
        <div style="font-size:22px;font-weight:800;line-height:1;margin-top:6px;">${fmtMXN(budget)}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">${budget?'Source of truth para CPV/CPE':'Sin presupuesto registrado'}</div>
      </div>
    </div>`;
}

function renderCampaignCoherence(c) {
  const el = document.getElementById('campaignCoherenceSection');
  if(!el) return;
  const d = _campaignCoherenceData(c);
  if(!d.issues.length) {
    el.innerHTML = `
      <div style="background:rgba(85,196,98,.08);border:1px solid rgba(85,196,98,.25);border-radius:12px;padding:12px 14px;display:flex;align-items:center;gap:10px;font-size:13px;color:#166534;">
        <span style="font-size:18px;">✅</span>
        <span>Tracker · Escenario · Métricas en coherencia.</span>
      </div>`;
    return;
  }
  const sevColor = { error:'#991b1b', warn:'#854d0e', info:'#1d4ed8' };
  const sevBg    = { error:'rgba(220,38,38,.08)', warn:'rgba(234,179,8,.1)', info:'rgba(59,130,246,.08)' };
  const sevBorder= { error:'rgba(220,38,38,.3)', warn:'rgba(234,179,8,.35)', info:'rgba(59,130,246,.3)' };
  const sevIcon  = { error:'🚨', warn:'⚠️', info:'ℹ️' };
  el.innerHTML = `
    <div style="background:var(--white);border:1.5px solid var(--border);border-radius:14px;padding:16px 18px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
        <span style="font-size:16px;">🔍</span>
        <h4 style="font-size:14px;font-weight:700;margin:0;">Necesita atención</h4>
        <span style="font-size:11px;color:var(--text-muted);">${d.issues.length} pendiente${d.issues.length>1?'s':''}</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${d.issues.map(i => `
          <div style="background:${sevBg[i.severity]};border:1px solid ${sevBorder[i.severity]};border-radius:10px;padding:10px 12px;display:flex;align-items:flex-start;gap:10px;">
            <span style="font-size:14px;flex-shrink:0;">${sevIcon[i.severity]}</span>
            <div style="flex:1;min-width:0;">
              <div style="font-size:13px;font-weight:700;color:${sevColor[i.severity]};">${_esc(i.title)}</div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${_esc(i.detail)}</div>
            </div>
            ${i.action ? `<button class="btn btn-ghost btn-sm" onclick="_switchCampaignTab('${i.action.tab}')" style="font-size:11px;flex-shrink:0;">${i.action.label} →</button>` : ''}
          </div>`).join('')}
      </div>
    </div>`;
}

function renderCampaignMetricsSection(c) {
  const el = document.getElementById('campaignMetricsSection');
  if(!el) return;
  if(c.metricsSheetUrl) {
    el.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3a6b28" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
          <span style="font-size:13px;font-weight:600;color:#3a6b28;">Métricas vinculadas</span>
          <span style="font-size:11px;color:var(--text-muted);max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${c.metricsSheetUrl.replace(/^https?:\/\/(docs\.google\.com\/)?/,'').substring(0,50)}…</span>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-ghost btn-sm" onclick="showCampaignMetricsInput('${c.id}')">Cambiar sheet</button>
          <button class="btn btn-pink btn-sm" onclick="navigateToMetrics('${c.id}')">Ver métricas →</button>
        </div>
      </div>
      <div id="campaignMetricsInputRow" style="display:none;margin-top:12px;">
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
          <input type="text" id="campaignMetricsSheetInput" class="form-input" style="flex:1;min-width:260px;font-size:13px;" placeholder="Nueva URL de Google Sheets de métricas..." value="${c.metricsSheetUrl}">
          <button class="btn btn-primary btn-sm" onclick="saveCampaignMetricsSheet('${c.id}')">Guardar</button>
          <button class="btn btn-ghost btn-sm" onclick="document.getElementById('campaignMetricsInputRow').style.display='none'">Cancelar</button>
        </div>
      </div>`;
  } else {
    el.innerHTML = `
      <div style="font-size:13px;font-weight:600;color:var(--text-muted);margin-bottom:10px;"><span class="icn-inline">${ICN_chart}</span>Métricas</div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
        <input type="text" id="campaignMetricsSheetInput" class="form-input" style="flex:1;min-width:260px;font-size:13px;" placeholder="Link de Google Sheets con las métricas...">
        <button class="btn btn-pink btn-sm" onclick="saveCampaignMetricsSheet('${c.id}')">Vincular métricas</button>
      </div>
      <p style="font-size:11px;color:var(--text-muted);margin-top:8px;">Pega la URL del Google Sheets. El sheet debe ser público o accesible con el enlace.</p>`;
  }
}

function showCampaignMetricsInput(cid) {
  const row = document.getElementById('campaignMetricsInputRow');
  if(row) { row.style.display=''; document.getElementById('campaignMetricsSheetInput').focus(); }
}

function saveCampaignMetricsSheet(cid) {
  const inp = document.getElementById('campaignMetricsSheetInput');
  if(!inp) return;
  const url = inp.value.trim();
  if(!url) { showToast('Ingresa la URL del Google Sheets','error'); return; }
  const campaigns = getData('campaigns');
  const idx = campaigns.findIndex(x=>x.id===cid);
  if(idx===-1) return;
  campaigns[idx].metricsSheetUrl = url;
  guardarCampana(campaigns[idx]);
  _cache.campaigns = campaigns;
  showToast('Sheet de métricas vinculado','success');
  renderCampaignMetricsSection(campaigns[idx]);
}

function navigateToMetrics(cid) {
  navigate('metricas');
  setTimeout(()=>openMetricsCampaign(cid), 80);
}

// ============================================================
// FUENTES DE DATOS Y CARGA DE LA CAMPAÑA
// ============================================================
// Los cuatro links de Sheets vivían en cuatro pantallas distintas: el del
// escenario en el modal de creación Y en la pestaña Escenario, el del tracker
// sólo dentro de la pestaña Tracker —pero las PESTAÑAS AON/Nano de ese mismo
// tracker se piden en el modal, donde todavía no hay tracker que las tenga—,
// el de métricas en el Resumen o en otra página, y el de UGC en ningún lado
// visible. Nadie podía contestar "¿ya está cargada esta campaña?" sin visitar
// cuatro lugares.
//
// Esto es ese lugar: las cuatro fuentes juntas, cada una con su estado real
// (sin vincular / vinculada sin datos / cuántas filas / última sync / error).

const CAMPAIGN_SOURCES = [
  { key:'escenario', label:'Escenario',    rol:'Lo que se cerró',      urlKey:'escenarioSheetUrl', rowsKey:'escenarioRows', syncKey:'escenarioLastSync', tab:'influencers' },
  { key:'tracker',   label:'Master tracker',rol:'Lo que va pasando',   urlKey:'trackerSheetUrl',   rowsKey:'trackerRows',   syncKey:'trackerLastSync',   tab:'tracker' },
  { key:'metricas',  label:'Métricas / ROI',rol:'Lo que resultó',      urlKey:'metricsSheetUrl',   rowsKey:'cachedMetrics', syncKey:'',                  tab:'resumen' },
  { key:'ugc',       label:'Resultados UGC',rol:'Lo que reporta la agencia', urlKey:'ugcSheetUrl', rowsKey:'ugcRows',      syncKey:'ugcLastSync',       tab:'influencers', opcional:true },
];

function _fuenteEstado(c, def) {
  // El escenario armado en la plataforma no tiene link y está igual de cargado
  // que uno vinculado: contarlo como "sin vincular" sería mentir.
  const enApp = def.key === 'escenario' && c.escenarioSource === 'app';
  const url = String(c[def.urlKey] || '').trim();
  const filas = Array.isArray(c[def.rowsKey]) ? c[def.rowsKey].length : 0;
  const error = (c._syncErrors || {})[def.key] || '';
  const sync = def.syncKey ? c[def.syncKey] : 0;
  if(error)            return { estado:'error', filas, url, sync, detalle: error };
  if(enApp)            return { estado:'ok',    filas, url:'', sync, detalle:'Armado en la plataforma' };
  if(!url)             return { estado:'vacio', filas:0, url:'', sync:0, detalle:'Sin vincular' };
  if(!filas)           return { estado:'espera',filas:0, url, sync, detalle:'Vinculado, sin datos todavía' };
  return { estado:'ok', filas, url, sync, detalle: filas + (filas===1?' fila':' filas') };
}

// Las seis casillas de carga, en el mismo orden en que se cargan de verdad.
// `pendiente` (no `falta`) para lo que todavía no toca: pedirle métricas a una
// campaña que apenas está en Brief es ruido, no una alerta.
function campaignLoadState(c) {
  if(!c) return [];
  const resp = c.responsables || {};
  const gente = Object.keys(resp).some(k => (typeof getAreaUids==='function' ? getAreaUids(resp,k) : []).length);
  const goal = c.goal || {};
  const base = !!(c.name && c.client && c.startDate && (goal.contenidos || goal.views || goal.engagement || goal.reach));
  const esc = _fuenteEstado(c, CAMPAIGN_SOURCES[0]);
  const trk = _fuenteEstado(c, CAMPAIGN_SOURCES[1]);
  const met = _fuenteEstado(c, CAMPAIGN_SOURCES[2]);
  const tareas = (c.tasks || []).some(t => t.assigneeUid);
  // ¿Ya toca pedir métricas? Cuando el flujo llegó a Publicación o más allá.
  const pasos = Array.isArray(c.flowSteps) ? c.flowSteps : [];
  const iPub = pasos.findIndex(f => f.step === 'Publicación');
  const yaPublica = iPub === -1
    ? trk.filas > 0
    : pasos.slice(0, iPub + 1).some(f => f.status === 'Completado' || f.status === 'Aprobado');

  return [
    { key:'base',      label:'Datos base',  ok: base,               pista:'Cliente, fechas y al menos una meta' },
    { key:'gente',     label:'Gente',       ok: gente,              pista:'Un responsable de área, mínimo' },
    { key:'escenario', label:'Escenario',   ok: esc.estado==='ok',  pista:'Sheet vinculado o armado a mano' },
    { key:'tracker',   label:'Tracker',     ok: trk.estado==='ok',  pista:'Vinculado y sincronizando sin error' },
    // La pista de métricas cambia con el momento de la campaña: pedirla antes
    // de que haya publicaciones es ruido, y decir "toca vincularlo" cuando ya
    // está vinculado es una instrucción para algo que ya se hizo.
    { key:'metricas',  label:'Métricas',    ok: met.estado==='ok',
      pista: met.estado === 'ok' ? 'Vinculadas y con datos'
           : yaPublica ? 'Ya hay publicaciones: toca vincularlas'
           : 'Se piden cuando empiecen a publicar',
      pendiente: !yaPublica },
    { key:'tareas',    label:'Tareas',      ok: tareas,             pista:'Al menos una tarea con dueño' },
  ];
}

// Tira compacta para la tarjeta de campaña: seis puntos y un contador. Sin
// esto la única forma de saber que a una campaña le falta el tracker era
// entrar y encontrarse la tabla vacía.
function campaignLoadDotsHtml(c) {
  const slots = campaignLoadState(c);
  if(!slots.length) return '';
  const listos = slots.filter(s => s.ok).length;
  const faltan = slots.filter(s => !s.ok && !s.pendiente).map(s => s.label);
  const titulo = faltan.length ? 'Falta: ' + faltan.join(', ') : 'Campaña cargada completa';
  const puntos = slots.map(s =>
    `<i class="camp-load-dot${s.ok ? ' is-ok' : (s.pendiente ? ' is-wait' : '')}" aria-hidden="true"></i>`).join('');
  return `<div class="camp-load" title="${_esc(titulo)}">
    <span class="camp-load-dots">${puntos}</span>
    <span class="camp-load-count">${listos}/${slots.length}</span>
    <span class="sr-only">Carga de la campaña: ${listos} de ${slots.length}. ${_esc(titulo)}.</span>
  </div>`;
}

function _fuenteFechaCorta(ms) {
  if(!ms) return '';
  try { return new Date(ms).toLocaleString('es-MX',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}); }
  catch(e) { return ''; }
}

function renderCampaignSources(c) {
  const el = document.getElementById('campaignSourcesSection');
  if(!el || !c) return;
  const slots = campaignLoadState(c);
  const listos = slots.filter(s => s.ok).length;
  const abierto = _sourcesOpen(c.id);

  const casillas = slots.map(s => `
    <div class="src-slot${s.ok ? ' is-ok' : (s.pendiente ? ' is-wait' : ' is-off')}">
      <span class="src-slot-mark" aria-hidden="true">${s.ok ? '✓' : (s.pendiente ? '·' : '')}</span>
      <span class="src-slot-body">
        <span class="src-slot-label">${_esc(s.label)}</span>
        <span class="src-slot-hint">${_esc(s.pista)}</span>
      </span>
    </div>`).join('');

  // El renglón de UGC sólo aparece donde hay UGC. Una campaña sin nano no
  // tiene por qué cargar con una fuente que nunca va a vincular.
  const aplica = def => def.key !== 'ugc' || !!(c.hasNano || c.ugcSheetUrl || (c.ugcRows||[]).length);
  const filas = CAMPAIGN_SOURCES.filter(aplica).map(def => {
    const st = _fuenteEstado(c, def);
    const clase = { ok:'is-ok', espera:'is-wait', error:'is-error', vacio:'is-off' }[st.estado];
    const sync = _fuenteFechaCorta(st.sync);
    return `
      <div class="src-row ${clase}">
        <div class="src-row-head">
          <span class="src-row-name">${_esc(def.label)}${def.opcional ? '<span class="src-opt">opcional</span>' : ''}</span>
          <span class="src-row-rol">${_esc(def.rol)}</span>
        </div>
        <div class="src-row-state">
          <span class="src-pill">${_esc(st.detalle)}</span>
          ${sync ? `<span class="src-sync">Última sync: ${_esc(sync)}</span>` : ''}
        </div>
        <div class="src-row-actions">
          ${st.url ? `<a class="btn btn-ghost btn-sm" href="${_esc(_safeUrl(st.url))}" target="_blank" rel="noopener noreferrer">Abrir Sheet</a>` : ''}
          <button class="btn ${st.estado==='vacio' ? 'btn-pink' : 'btn-ghost'} btn-sm" onclick="irAFuente('${c.id}','${def.key}')">
            ${st.estado==='vacio' ? 'Vincular' : 'Ir y sincronizar'}
          </button>
        </div>
      </div>`;
  }).join('');

  el.innerHTML = `
    <div class="src-panel${abierto ? ' is-open' : ''}">
      <button type="button" class="src-head" aria-expanded="${abierto}" onclick="toggleCampaignSources('${c.id}')">
        <span class="src-head-title">Carga de la campaña</span>
        <span class="src-head-count">${listos}/${slots.length}</span>
        <span class="src-head-chev" aria-hidden="true">▾</span>
      </button>
      <div class="src-slots">${casillas}</div>
      <div class="src-body">
        <p class="src-intro">Las tres fuentes contestan preguntas distintas sobre los mismos creadores: el <b>escenario</b> es lo que se cerró, el <b>tracker</b> lo que va pasando y las <b>métricas</b> lo que resultó.</p>
        ${filas}
      </div>
    </div>`;
}

// El panel se abre solo mientras falte algo, y recuerda lo que el usuario
// decida por campaña: una campaña completa no tiene por qué estar gritando.
function _sourcesOpen(cid) {
  try {
    const guardado = localStorage.getItem('cmos:srcOpen:' + cid);
    if(guardado !== null) return guardado === '1';
  } catch(e){}
  const c = (_cache.campaigns||[]).find(x => x.id === cid);
  return campaignLoadState(c).some(s => !s.ok && !s.pendiente);
}

function toggleCampaignSources(cid) {
  const abierto = _sourcesOpen(cid);
  try { localStorage.setItem('cmos:srcOpen:' + cid, abierto ? '0' : '1'); } catch(e){}
  const c = (_cache.campaigns||[]).find(x => x.id === cid);
  if(c) renderCampaignSources(c);
}

// Llevar a donde se vincula cada fuente, y sincronizar de una vez si ya hay
// link: el botón promete "ir y sincronizar", así que hace las dos cosas.
function irAFuente(cid, key) {
  const c = (_cache.campaigns||[]).find(x => x.id === cid);
  const def = CAMPAIGN_SOURCES.find(d => d.key === key);
  if(!c || !def) return;
  const st = _fuenteEstado(c, def);
  if(key === 'metricas') {
    if(st.url) { navigateToMetrics(cid); return; }
    _switchCampaignTab('resumen');
    setTimeout(() => {
      try { showCampaignMetricsInput(cid); } catch(e){}
      document.getElementById('campaignMetricsSection')?.scrollIntoView({ behavior:'smooth', block:'center' });
    }, 60);
    return;
  }
  _switchCampaignTab(def.tab);
  setTimeout(() => {
    const inputId = { escenario:'escenarioSheetsUrl', tracker:'trackerSheetsUrl', ugc:'ugcSheetsUrl' }[key];
    const inp = document.getElementById(inputId);
    if(inp) {
      inp.scrollIntoView({ behavior:'smooth', block:'center' });
      if(!st.url) { inp.focus(); return; }
    } else if(key === 'ugc') {
      // El bloque de UGC sólo se pinta cuando el escenario declara nano/micro.
      showToast('El bloque de UGC aparece cuando el escenario declara nano o micro. Sincroniza el escenario primero.','error');
      return;
    }
    // Con link ya puesto, el clic sincroniza en vez de dejar al usuario
    // buscando el botón de refrescar.
    if(st.url) {
      try {
        if(key === 'escenario') syncEscenario();
        else if(key === 'tracker') syncTracker();
        else if(key === 'ugc') syncUgcResults();
      } catch(e){ console.warn('sync desde fuentes', e); }
    }
  }, 80);
}

// Las fuentes fallan en silencio: el error se pintaba dentro de la pestaña de
// turno y desaparecía al cambiar de vista. Se guarda en memoria (nunca viaja a
// Firestore) para que el panel pueda decir cuál está rota y por qué.
function marcarErrorFuente(campaign, key, mensaje) {
  if(!campaign) return;
  campaign._syncErrors = { ...(campaign._syncErrors || {}) };
  if(mensaje) campaign._syncErrors[key] = String(mensaje).slice(0, 140);
  else delete campaign._syncErrors[key];
  const cached = (_cache.campaigns||[]).find(x => x.id === campaign.id);
  if(cached && cached !== campaign) cached._syncErrors = campaign._syncErrors;
  if(currentCampaignId === campaign.id) { try { renderCampaignSources(campaign); } catch(e){} }
}

function renderCampaignInfluencers(c) {
  const sheetsInput = document.getElementById('campaignSheetsUrl');
  if(sheetsInput) sheetsInput.value = c.sheetsUrl || '';
  // Render escenario block (estimated vs real per creator)
  try { renderEscenarioBlock(c); } catch(e){ console.warn('escenario render error', e); }
  const infStatusBadge = (s) => {
    const map={Publicado:'badge-green',Aprobado:'badge-blue','En producción':'badge-purple',Pendiente:'badge-gray'};
    return `<span class="badge ${map[s]||'badge-gray'}">${_esc(s)}</span>`;
  };
  const visibleInfs = (c.influencers||[]).filter(inf => (typeof _isRealCreatorName==='function') ? _isRealCreatorName(inf.name) : true);

  // Platforms per creator from the parsed escenario sheet (creators can be on
  // several platforms — e.g. TikTok + FB REEL) so the table mirrors the top block.
  const escPlatByName = {};
  try {
    if(c.escenarioRows && c.escenarioRows.length && typeof parseEscenarioRows==='function') {
      const parsed = parseEscenarioRows(c.escenarioRows);
      (parsed.creators||[]).forEach(cr => {
        escPlatByName[(cr.nombre||cr.name||'').toLowerCase()] = (cr.platforms||[]).map(x=>x.platform||x.contenido).filter(Boolean);
      });
    }
  } catch(e){}

  // Group rows by creator name so duplicate per-platform rows collapse into one
  // line that shows every platform.
  const groups = {};
  visibleInfs.forEach(inf => {
    const key = (inf.name||'').toLowerCase();
    if(!groups[key]) groups[key] = { ref:inf, platforms:new Set(), contenidos:0, boosted:0, reach:0, interactions:0 };
    const g = groups[key];
    if(inf.platform) { const n=_normalizePlatform(inf.platform)||inf.platform; if(n) g.platforms.add(n); }
    g.contenidos += Number(inf.contenidos)||0;
    g.boosted    += Number(inf.boosted)||0;
    g.reach      += Number(inf.reach)||0;
    g.interactions += Number(inf.interactions)||0;
    if(!g.ref.publishDate && inf.publishDate) g.ref.publishDate = inf.publishDate;
  });
  // Merge platforms detected in the escenario sheet
  Object.values(groups).forEach(g => {
    (escPlatByName[(g.ref.name||'').toLowerCase()]||[]).forEach(pl => { const n=_normalizePlatform(pl)||pl; if(n) g.platforms.add(n); });
  });

  const rows = Object.values(groups);
  document.getElementById('campaignInfluencerTable').innerHTML = rows.length===0
    ? `<tr><td colspan="10"><div class="empty-state"><p>Sin creadores en esta campaña. Agrega el primero para seguir sus entregas y métricas.</p></div></td></tr>`
    : rows.map(g=>{
      const inf = g.ref;
      const platsHtml = g.platforms.size ? platformBadges([...g.platforms]) : (inf.platform?platformBadge(inf.platform):'—');
      return `
    <tr>
      <td><div style="display:flex;align-items:center;gap:8px"><div class="inf-avatar" style="width:28px;height:28px;font-size:11px">${(inf.name||'?')[0]}</div><div><div style="font-weight:600;font-size:13px">${_esc(inf.name)}</div><div style="font-size:11px;color:var(--text-muted)">${_esc(inf.handle||'')}</div></div></div></td>
      <td>${_esc(inf.format||'—')}</td>
      <td>${formatDateShort(inf.publishDate)||'—'}</td>
      <td><div style="display:flex;flex-wrap:wrap;gap:4px;">${platsHtml}</div></td>
      <td>${infStatusBadge(inf.status)}</td>
      <td><span style="font-weight:600;color:var(--blue);">${g.contenidos||0}</span></td>
      <td><span style="font-weight:600;color:var(--pink-deep);">${g.boosted||0}</span></td>
      <td>${g.reach?g.reach.toLocaleString():'—'}</td>
      <td>${g.interactions?g.interactions.toLocaleString():'—'}</td>
      <td>${inf.er||'—'}</td>
    </tr>`;}).join('');
}

/* Dónde vive de verdad esta tarea. Una suelta que sólo lleva `campaignId` se
   muestra en la campaña, pero se marca y se edita contra globalTasks: pasarle
   el id de la campaña haría que toggleTask la buscara donde no está. */
function _cidDeTarea(t, c) {
  return (Array.isArray(c.tasks) && c.tasks.some(x => x.id === t.id)) ? c.id : '';
}

function _taskItemHtml(t, cid) {
  const st = TASK_STATUS_BY_ID[taskStatus(t)];
  return `
  <div class="task-item">
    <div class="task-check ${t.done?'done':''}" onclick="toggleTask('${t.id}','${cid}')"></div>
    <div class="priority-dot priority-${t.priority}"></div>
    <div class="task-info" onclick="openTaskDetail('${t.id}','${cid}')" style="cursor:pointer;">
      <div class="task-title ${t.done?'done-text':''}">${_esc(t.title)}</div>
      <div class="task-meta" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
        <span class="tb-pill tb-pill-static" style="background:${st.color};color:${_tbInk(st.color)};">${st.label}</span>
        ${_tbPeopleStack(t, 18)}
        ${t.dueDate?`<span>${formatDate(t.dueDate)}</span>`:''}
      </div>
    </div>
    <button class="task-edit-btn" onclick="openEditTaskModal('${t.id}','${cid}')" title="Editar" aria-label="Editar tarea"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg></button>
    <button onclick="deleteTask('${t.id}','${cid}')" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:12px;padding:4px;"><span class="icn-close"></span></button>
  </div>
  <div style="padding:0 8px 2px 38px;display:flex;align-items:center;gap:4px;">
    ${_reactionHtml(t,cid)}
    <button onclick="showReactions('${t.id}','${cid}',event)" style="font-size:11px;background:none;border:none;cursor:pointer;color:var(--text-muted);padding:2px 4px;" title="Reaccionar">😊+</button>
  </div>`;
}

/* Todo lo que cuenta como pendiente DE esta campaña.

   No basta con `c.tasks`: una tarea suelta puede llevar la campaña marcada
   (`campaignId`), y ésas salían en Pendientes-de-todo pero no en la pestaña de
   Pendientes de la campaña — el pendiente existía, pero no donde se le busca.
   Se suman las dos fuentes, sin duplicar por id. */
function tareasDeCampana(c) {
  const propias = Array.isArray(c.tasks) ? c.tasks : [];
  const vistos = new Set(propias.map(t => t.id));
  const sueltas = (getData('globalTasks')||[])
    .filter(t => t && t.campaignId === c.id && !vistos.has(t.id));
  return propias.concat(sueltas);
}

function renderCampaignTasks(c) {
  const el = document.getElementById('campaignTasksList');
  if(!el) return;
  const tareas = tareasDeCampana(c);
  if(tareas.length===0) {
    el.innerHTML=`<div class="empty-state"><div class="empty-icon">${ICN_check}</div><p>Sin tareas. ¡Todo al día!</p></div>`;
    return;
  }
  const AREA_ORDER = ['Cuentas','Operaciones','Creativo','Data'];
  const AREA_COLOR = {Cuentas:'var(--blue)',Operaciones:'var(--pink)',Creativo:'var(--lavender)',Data:'#3a7a5e'};

  // Group tasks by assignee's area
  const groups = {};
  tareas.forEach(t => {
    const u = allUsers.find(x=>x.uid===t.assigneeUid);
    const area = u?.area || 'Sin área';
    if(!groups[area]) groups[area] = [];
    groups[area].push(t);
  });

  const areas = [...AREA_ORDER.filter(a=>groups[a]), ...Object.keys(groups).filter(a=>!AREA_ORDER.includes(a))];

  // If only one area group, render flat (no grouping chrome needed)
  if(areas.length <= 1) {
    el.innerHTML = tareas.map(t=>_taskItemHtml(t, _cidDeTarea(t, c))).join('');
    return;
  }

  el.innerHTML = areas.map(area => {
    const tasks = groups[area];
    const pending = tasks.filter(t=>!t.done).length;
    const isMine = tasks.some(t=>t.assigneeUid===currentUser?.uid);
    const color = AREA_COLOR[area]||'var(--text-muted)';
    return `
    <details class="task-area-group" ${isMine?'open':''}>
      <summary>
        <span class="task-area-name" style="color:${color};">${area}</span>
        <span class="task-area-count">${pending} pendiente${pending!==1?'s':''} · ${tasks.length} total</span>
        <span class="task-area-chevron">▶</span>
      </summary>
      <div class="task-area-body">${tasks.map(t=>_taskItemHtml(t, _cidDeTarea(t, c))).join('')}</div>
    </details>`;
  }).join('');
}

// ============================================================
// THEMES
// ============================================================
const THEMES = ['default','ocean','forest','royal','sunset','rose'];
// 'custom' no está en THEMES a propósito: no tiene paleta escrita en el CSS,
// sus tonos se calculan aquí a partir del color que la persona eligió.
const THEME_SWATCHES = THEMES.concat(['custom']);
const ACCENT_DEFAULT = '#ff2d87';

// Los mismos colores de los temas, en canales sueltos. Van al <html> y no al
// <body> porque hay reglas que definen variables sobre html.dark: una custom
// property puesta en el body no sube, y esas reglas se quedaban en rosa.
const THEME_RGB = {
  default:'255,45,135', ocean:'37,99,235', forest:'22,163,74',
  royal:'124,58,237', sunset:'234,88,12', rose:'225,29,72',
};
function _setAccentRGB(rgb) {
  document.documentElement.style.setProperty('--accent-rgb', rgb || THEME_RGB.default);
}

// #rgb / #rrggbb → {r,g,b}. Devuelve null si no es un color válido, para no
// pintar la app de negro cuando llega basura.
function _hexRGB(hex) {
  let h = String(hex||'').trim().replace('#','');
  if(h.length === 3) h = h.split('').map(c => c+c).join('');
  if(!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return { r:parseInt(h.slice(0,2),16), g:parseInt(h.slice(2,4),16), b:parseInt(h.slice(4,6),16) };
}

function _rgbHSL({r,g,b}) {
  r/=255; g/=255; b/=255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b), d = max-min;
  let h = 0;
  if(d) {
    if(max === r)      h = ((g-b)/d) % 6;
    else if(max === g) h = (b-r)/d + 2;
    else               h = (r-g)/d + 4;
    h *= 60; if(h < 0) h += 360;
  }
  const l = (max+min)/2;
  const s = d ? d / (1 - Math.abs(2*l - 1)) : 0;
  return { h:Math.round(h), s:Math.round(s*100), l:Math.round(l*100) };
}

// De un solo color salen los cuatro que usa la app: el acento, su versión
// oscura (hover y texto sobre pálido), la clara (bordes) y la pálida (fondos
// de chip). Se calculan en HSL para que un azul y un amarillo se comporten
// igual aunque tengan luminosidad muy distinta de origen.
function _accentVars(hex) {
  const rgb = _hexRGB(hex); if(!rgb) return null;
  const {h,s,l} = _rgbHSL(rgb);
  const cl = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  return {
    acc:   '#' + [rgb.r,rgb.g,rgb.b].map(v=>v.toString(16).padStart(2,'0')).join(''),
    deep:  `hsl(${h} ${cl(s,20,100)}% ${cl(l-12, 14, 60)}%)`,
    light: `hsl(${h} ${cl(s,20,95)}% ${cl(l+26, 55, 88)}%)`,
    pale:  `hsl(${h} ${cl(s,25,95)}% ${cl(l+40, 90, 96)}%)`,
    rgb:   `${rgb.r},${rgb.g},${rgb.b}`,
  };
}

function _paintAccent(hex) {
  const v = _accentVars(hex);
  const st = document.body.style;
  if(!v) { ['--acc','--acc-deep','--acc-light','--acc-pale','--acc-rgb'].forEach(k=>st.removeProperty(k)); return false; }
  _setAccentRGB(v.rgb);
  st.setProperty('--acc', v.acc);
  st.setProperty('--acc-deep', v.deep);
  st.setProperty('--acc-light', v.light);
  st.setProperty('--acc-pale', v.pale);
  st.setProperty('--acc-rgb', v.rgb);
  // Los dos selectores (Ajustes y la ficha) muestran el color elegido en vez
  // del arcoíris genérico, para que se vea cuál está puesto.
  ['stTheme-custom','theme-custom'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.classList.add('has-color');
  });
  ['customAccentInput','customAccentInput2'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.value = v.acc;
  });
  return true;
}

function applyTheme(name, accent) {
  THEME_SWATCHES.forEach(t => document.body.classList.remove('theme-'+t));
  const esCustom = name === 'custom';
  const hex = esCustom ? (accent || currentUserProfile?.themeAccent || ACCENT_DEFAULT) : null;
  if(esCustom && !_paintAccent(hex)) { name = 'default'; }
  else if(!esCustom) {
    ['--acc','--acc-deep','--acc-light','--acc-pale','--acc-rgb'].forEach(k => document.body.style.removeProperty(k));
    ['stTheme-custom','theme-custom'].forEach(id => document.getElementById(id)?.classList.remove('has-color'));
  }
  if(name && name !== 'default') document.body.classList.add('theme-'+name);
  _setAccentRGB(esCustom ? (_accentVars(hex)||{}).rgb : THEME_RGB[name || 'default']);
  // Update swatch selection UI (profile modal + settings page)
  THEME_SWATCHES.forEach(t => {
    const sw  = document.getElementById('theme-'+t);
    const sw2 = document.getElementById('stTheme-'+t);
    if(sw)  sw.classList.toggle('selected',  t === (name||'default'));
    if(sw2) sw2.classList.toggle('selected', t === (name||'default'));
  });
  // Persist
  if(currentUserProfile) {
    currentUserProfile.theme = name || 'default';
    const patch = { theme: name || 'default' };
    if(name === 'custom') { patch.themeAccent = hex; currentUserProfile.themeAccent = hex; }
    // El try/catch no atrapa el rechazo de una promesa: si Firestore decía que
    // no (sesión caducada, sin permisos), salía un "Uncaught (in promise)" en
    // la consola y el tema volvía al viejo en la siguiente recarga sin que
    // nadie lo supiera. Ahora falla en voz baja pero avisa.
    Promise.all([
      db.collection('users').doc(currentUser.uid).set(patch, {merge:true}),
      db.collection('workspaces').doc(WORKSPACE).collection('members').doc(currentUser.uid).set(patch,{merge:true}),
    ]).catch(e => {
      console.warn('guardar tema', e);
      try { showToast('El tema se ve aquí, pero no se pudo guardar en tu perfil.', 'error'); } catch(_){}
    });
  }
}

// El input de color dispara un evento por cada pixel que mueves en la rueda:
// se pinta al instante pero la escritura a Firestore espera a que sueltes.
let _accentTimer = null;
function applyCustomAccent(hex) {
  if(!_paintAccent(hex)) return;
  THEME_SWATCHES.forEach(t => document.body.classList.remove('theme-'+t));
  document.body.classList.add('theme-custom');
  THEME_SWATCHES.forEach(t => {
    document.getElementById('theme-'+t)?.classList.toggle('selected', t === 'custom');
    document.getElementById('stTheme-'+t)?.classList.toggle('selected', t === 'custom');
  });
  if(currentUserProfile) { currentUserProfile.theme = 'custom'; currentUserProfile.themeAccent = hex; }
  clearTimeout(_accentTimer);
  _accentTimer = setTimeout(() => applyTheme('custom', hex), 400);
}

function loadTheme(profile) {
  if(profile?.theme) applyTheme(profile.theme, profile.themeAccent);
}
