/* Campaign OS — Modo cliente: publicación del snapshot y vista pública de solo lectura
   Extraído de index.html. Script CLÁSICO a propósito (NO type="module"):
   el HTML llama estas funciones desde atributos onclick/onchange, que solo
   resuelven contra el scope global. El orden de carga en index.html replica
   el orden original de ejecución y no debe alterarse. */

(function(){
'use strict';

// ---------- helpers ----------
function _genShareToken(){
  const chars='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const buf=new Uint8Array(24); crypto.getRandomValues(buf);
  return Array.from(buf).map(b=>chars[b%chars.length]).join('');
}
function _clientShareUrl(c){
  return location.origin + location.pathname + '?client=' + encodeURIComponent(c.clientShare.token);
}
function _currentCampaign(){
  const cs = getData('campaigns');
  return cs.find(x=>x.id===currentCampaignId) || null;
}

// ¿El cliente puede ver este documento? Fuente de verdad: doc.clientVisible
// (toggle al cargar el documento). Docs legacy sin el campo conservan el
// comportamiento anterior: visibles salvo que estén en clientShare.hiddenDocs.
function _docVisibleToClient(c, d){
  if(d.clientVisible !== undefined) return d.clientVisible === true;
  const hidden = (c.clientShare && c.clientShare.hiddenDocs) || [];
  return !hidden.includes(d.id);
}
window._docVisibleToClient = _docVisibleToClient;

// ---------- snapshot builder (SANITIZADO: sin costos) ----------
function _fetchMetricsRowsFor(c){
  if(Array.isArray(c.cachedMetrics) && c.cachedMetrics.length) return Promise.resolve(c.cachedMetrics);
  if(!c.metricsSheetUrl) return Promise.resolve([]);
  const sheetId = (typeof _extractSheetId==='function') ? _extractSheetId(c.metricsSheetUrl) : null;
  const multi = sheetId
    ? _fetchSheetTabs(sheetId).then(tabs => tabs.length
        ? Promise.all(tabs.map(t=>_fetchTabRows(sheetId,t.gid))).then(all=>all.flat())
        : [])
    : Promise.resolve([]);
  return multi.catch(()=>[]).then(rows => {
    if(rows && rows.length){ _cacheMetricsOnCampaign(c, rows); return rows; }
    const csvUrl = normalizeCsvUrl(c.metricsSheetUrl);
    if(!csvUrl) return [];
    return fetch(csvUrl).then(r=>r.text()).then(text=>{
      if(text.trim().startsWith('<!')) return [];
      const parsed = parseCSV(text);
      if(parsed.length) _cacheMetricsOnCampaign(c, parsed);
      return parsed || [];
    }).catch(()=>[]);
  });
}

function _buildClientSnapshot(c){
  let d = {};
  try { d = _campaignCoherenceData(c) || {}; } catch(e){}

  // --- tracker: conteos por estatus + calendario ---
  const rows = Array.isArray(c.trackerRows) ? c.trackerRows : [];
  let publicado=0, aprobado=0, revision=0, porPublicar=0;
  const statusCounts=[]; const scMap={};
  const cal=[];
  rows.forEach(r=>{
    const nm = String(_trackerGet(r, TRACKER_NAME_KEYS)||'').trim();
    const ecRaw = String(_trackerStatusOf(r)||'').trim();
    if(!nm && !ecRaw) return;
    const ec = ecRaw.toLowerCase();
    if(ecRaw && ecRaw.length<=35 && !/[,;\n]/.test(ecRaw)){
      scMap[ecRaw]=(scMap[ecRaw]||0)+1;
    }
    if(_isPublishedStatus(ec)) publicado++;
    else if(ec.includes('aprobad')) aprobado++;
    else if(ec.includes('revisi')) revision++;
    else if(ec.includes('por publicar')||ec.includes('pendiente')||ec.includes('programad')||ec.includes('⚠')) porPublicar++;
    const iso = _trackerRowDate(r);
    if(iso && cal.length<500){
      cal.push({
        d: iso,
        n: nm.slice(0,60),
        p: String(_trackerGet(r,['PLATAFORMA','Plataforma','RED SOCIAL','Red Social','RED','CANAL','Canal','TIPO DE CONTENIDO','Tipo de Contenido'])||'').slice(0,20),
        f: String(_trackerGet(r,['FORMATO','Formato','TIPO','Tipo'])||'').slice(0,25),
        s: ecRaw.slice(0,30)
      });
    }
  });
  Object.entries(scMap).forEach(([k,v])=>statusCounts.push({k,v}));

  // --- big numbers desde métricas ---
  const mrows = Array.isArray(c.cachedMetrics) ? c.cachedMetrics : [];
  let views=0, reach=0, likes=0, eng=0;
  const profMap = {};
  mrows.forEach(r=>{
    const v=_mViews(r), rc=_mReach(r), lk=_mLikes(r), en=_mEng(r);
    views+=v; reach+=rc; likes+=lk; eng+=en;
    const name = String(r['Influencer Name']||r['Influencer']||r['Creator']||r['Creador']||r['Cuenta']||r['NOMBRE']||r['Nombre']||r['Handle']||r['Perfil']||'').trim();
    if(!name) return;
    const plat = _mPlatformLabel(r);
    const key = name.toLowerCase()+'|'+plat;
    if(!profMap[key]) profMap[key]={name:name.slice(0,60), plat:String(plat).slice(0,20), posts:0, views:0, reach:0, likes:0, eng:0};
    const p=profMap[key]; p.posts++; p.views+=v; p.reach+=rc; p.likes+=lk; p.eng+=en;
  });
  const profiles = Object.values(profMap).sort((a,b)=>b.views-a.views).slice(0,80);

  // --- aprobación de contenidos (si se usa el flujo interno) ---
  const approval=[];
  if(Array.isArray(c.approvalItems) && c.approvalItems.length){
    const am={};
    c.approvalItems.forEach(it=>{ const s=String(it.status||'Borrador'); am[s]=(am[s]||0)+1; });
    Object.entries(am).forEach(([k,v])=>approval.push({k,v}));
  }

  // --- documentos (solo los marcados visibles para cliente) ---
  const docs = (Array.isArray(c.documents)?c.documents:[])
    .filter(dd=>_docVisibleToClient(c, dd))
    .map(dd=>{
      // Sanea al escribir con el mismo criterio que el resto de la app
      // (_safeUrl solo deja http/https); la vista cliente vuelve a validar
      // al renderizar, así que el saneamiento queda en ambos extremos.
      const safe = (typeof _safeUrl==='function') ? _safeUrl(dd.url) : String(dd.url||'');
      return {
        name: String(dd.name||'').slice(0,120),
        type: String(dd.type||'Otro').slice(0,20),
        url: safe === '#' ? '' : safe,
        date: String(dd.date||'')
      };
    });

  return {
    v:1,
    campaign:{
      name:String(c.name||''), client:String(c.client||''), season:String(c.season||''),
      status:String(c.status||''), objective:String(c.objective||''), coreMessage:String(c.coreMessage||''),
      startDate:String(c.startDate||''), endDate:String(c.endDate||'')
    },
    progress:{
      publicado: d.totalPublicado||publicado,
      totalCerrado: d.totalCerrado||0,
      aprobado, revision, porPublicar,
      trackerTotal: d.trackerTotal||rows.length
    },
    statusCounts, cal,
    big:{
      views, reach, likes, eng, posts: mrows.length,
      estViews: d.escenarioViewsEst||0, estEng: d.escenarioEngEst||0, estCont: d.totalCerrado||0
    },
    profiles, approval, docs,
    flow: (Array.isArray(c.flowSteps)?c.flowSteps:[]).map(s=>({step:String(s.step||''), status:String(s.status||'')})),
    updatedAt: Date.now()
  };
}

async function publishClientShare(c){
  if(!c || !c.clientShare || !c.clientShare.enabled || !c.clientShare.token) return;
  // Refresca fuentes si faltan en memoria (tracker / métricas / escenario)
  try { if((!c.trackerRows||!c.trackerRows.length) && c.trackerSheetUrl) await _autoFetchTracker(c.trackerSheetUrl, c, {silent:true}); } catch(e){}
  try { if((!c.escenarioRows||!c.escenarioRows.length) && typeof loadEscenarioFromStore==='function') await loadEscenarioFromStore(c); } catch(e){}
  try { await _fetchMetricsRowsFor(c); } catch(e){}
  const snap = _buildClientSnapshot(c);
  await db.collection('clientShares').doc(c.clientShare.token).set({
    workspace: WORKSPACE,
    campaignId: c.id,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    data: snap
  });
}
window.publishClientShare = publishClientShare;

// Debounce: republica snapshots tras cada guardado de campañas
const _csTimers = {};
window._scheduleClientShareRepublish = function(campaigns){
  (campaigns||[]).forEach(c=>{
    if(!c.clientShare || !c.clientShare.enabled) return;
    clearTimeout(_csTimers[c.id]);
    _csTimers[c.id] = setTimeout(()=>{ publishClientShare(c).catch(e=>console.warn('clientShare republish', e)); }, 6000);
  });
};

// ---------- UI equipo: modal ----------
window.openClientShareModal = function(){
  const c = _currentCampaign();
  if(!c){ showToast('Abre una campaña primero','error'); return; }
  _renderClientShareBody(c);
  openModal('clientShareModal');
};

function _renderClientShareBody(c){
  const el = document.getElementById('clientShareBody');
  if(!el) return;
  const share = c.clientShare;
  if(!share || !share.enabled){
    el.innerHTML = `
      <p style="font-size:13px;color:var(--text-muted);line-height:1.5;">
        Genera un link de <b>solo lectura</b> para que el cliente vea el avance de
        <b>${_esc(c.name)}</b> sin entrar al sistema: publicaciones (publicadas, aprobadas,
        en revisión interna, por publicar), calendario, big numbers, desempeño de perfiles
        y documentos vinculados.
      </p>
      <div style="background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:10px 14px;font-size:12px;color:var(--text-muted);margin:12px 0;">
        🔒 <b>Nunca se comparte:</b> presupuestos, costos, CPV/CPE, márgenes, ni ninguna otra campaña.
        El link es un token aleatorio: solo quien lo tenga puede ver esta vista.
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal('clientShareModal')">Cancelar</button>
        <button class="btn btn-primary" onclick="enableClientShare()">Activar modo cliente</button>
      </div>`;
    return;
  }
  const url = _clientShareUrl(c);
  const docsList = (c.documents||[]).length
    ? c.documents.map(d=>`
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;padding:5px 2px;cursor:pointer;">
          <input type="checkbox" ${_docVisibleToClient(c,d)?'checked':''} onchange="toggleClientShareDoc('${d.id}', this.checked)">
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_esc(d.name)} <span style="color:var(--text-muted);font-size:11px;">· ${_esc(d.type||'')}</span></span>
        </label>`).join('')
    : `<div style="font-size:12px;color:var(--text-muted);">Sin documentos en esta campaña.</div>`;
  const upd = share.updatedAt ? new Date(share.updatedAt).toLocaleString('es-MX',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '—';
  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
      <span class="badge badge-green">Activo</span>
      <span style="font-size:12px;color:var(--text-muted);">Última publicación de datos: ${upd}</span>
    </div>
    <div class="form-group">
      <label class="form-label">Link para el cliente</label>
      <div style="display:flex;gap:8px;">
        <input type="text" class="form-input" id="clientShareUrlInput" readonly value="${_esc(url)}" style="flex:1;font-size:12px;" onclick="this.select()">
        <button class="btn btn-primary btn-sm" onclick="copyClientShareLink()">Copiar</button>
        <a class="btn btn-ghost btn-sm" href="${_esc(url)}" target="_blank" rel="noopener" style="text-decoration:none;">Abrir ↗</a>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Documentos visibles para el cliente</label>
      <div style="max-height:160px;overflow-y:auto;border:1px solid var(--border);border-radius:10px;padding:8px 10px;">${docsList}</div>
    </div>
    <div style="background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:10px 14px;font-size:12px;color:var(--text-muted);margin-bottom:6px;">
      🔒 El cliente <b>no</b> ve presupuestos, costos, CPV/CPE ni otras campañas.
      Los datos se actualizan automáticamente al guardar cambios; también puedes forzarlo aquí.
    </div>
    <div class="modal-footer" style="justify-content:space-between;">
      <button class="btn btn-ghost btn-sm" onclick="disableClientShare()" style="color:var(--red);">Desactivar link</button>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-ghost" onclick="closeModal('clientShareModal')">Cerrar</button>
        <button class="btn btn-primary" onclick="refreshClientShareNow()">Actualizar datos ahora</button>
      </div>
    </div>`;
}

window.enableClientShare = async function(){
  const campaigns = getData('campaigns');
  const c = campaigns.find(x=>x.id===currentCampaignId);
  if(!c) return;
  c.clientShare = { token: (c.clientShare && c.clientShare.token) || _genShareToken(), enabled:true, hiddenDocs:(c.clientShare && c.clientShare.hiddenDocs)||[], updatedAt: Date.now() };
  setData('campaigns', campaigns);
  _renderClientShareBody(c);
  try {
    await publishClientShare(c);
    c.clientShare.updatedAt = Date.now();
    _renderClientShareBody(c);
    showToast('Modo cliente activado — link listo','success');
  } catch(e){
    console.error('publishClientShare', e);
    showToast('Link creado, pero falló publicar datos: '+e.message,'error');
  }
};

window.disableClientShare = async function(){
  const campaigns = getData('campaigns');
  const c = campaigns.find(x=>x.id===currentCampaignId);
  if(!c || !c.clientShare) return;
  const token = c.clientShare.token;
  c.clientShare.enabled = false;
  setData('campaigns', campaigns);
  try { await db.collection('clientShares').doc(token).delete(); } catch(e){ console.warn('delete share', e); }
  _renderClientShareBody(c);
  showToast('Link de cliente desactivado','success');
};

window.toggleClientShareDoc = function(docId, visible){
  const campaigns = getData('campaigns');
  const c = campaigns.find(x=>x.id===currentCampaignId);
  if(!c) return;
  const d = (c.documents||[]).find(x=>x.id===docId);
  if(d) d.clientVisible = !!visible; // fuente de verdad en el doc
  // limpia el mecanismo legacy para que no contradiga al flag
  if(c.clientShare && Array.isArray(c.clientShare.hiddenDocs)){
    c.clientShare.hiddenDocs = c.clientShare.hiddenDocs.filter(x=>x!==docId);
  }
  setData('campaigns', campaigns); // el hook debounced republica el snapshot
  if(currentCampaignId === c.id) { try { renderCampaignDocs(c); } catch(e){} }
};

window.copyClientShareLink = function(){
  const inp = document.getElementById('clientShareUrlInput');
  if(!inp) return;
  navigator.clipboard.writeText(inp.value).then(()=>showToast('Link copiado','success')).catch(()=>{ inp.select(); document.execCommand('copy'); showToast('Link copiado','success'); });
};

window.refreshClientShareNow = async function(){
  const c = _currentCampaign();
  if(!c || !c.clientShare || !c.clientShare.enabled) return;
  showToast('Actualizando datos del link...','success');
  try {
    await publishClientShare(c);
    c.clientShare.updatedAt = Date.now();
    const campaigns = getData('campaigns');
    setData('campaigns', campaigns);
    _renderClientShareBody(c);
    showToast('Datos del cliente actualizados','success');
  } catch(e){
    console.error('refreshClientShare', e);
    showToast('Error publicando datos: '+e.message,'error');
  }
};

// ============================================================
// VISTA CLIENTE (pública, solo lectura)
// ============================================================
const CLIENT_TOKEN = new URLSearchParams(location.search).get('client');
let _cvData = null;
let _cvMonth = null; // Date del mes visible en calendario

function _cvSafeUrl(u){
  try { const p = new URL(u); return (p.protocol==='https:'||p.protocol==='http:') ? p.href : ''; } catch(e){ return ''; }
}
function _cvStatusColor(s){
  const v = String(s||'').toLowerCase();
  if(_isPublishedStatus(v)) return {bg:'#d3f5db', col:'#166534'};
  if(v.includes('aprobad')) return {bg:'#dbeafe', col:'#1d4ed8'};
  if(v.includes('revisi')) return {bg:'#fef08a', col:'#854d0e'};
  if(v.includes('por publicar')||v.includes('pendiente')||v.includes('programad')||v.includes('⚠')) return {bg:'#fde4f0', col:'#be185d'};
  return {bg:'#eee9f0', col:'#57545e'};
}
function _cvChip(s){
  const c=_cvStatusColor(s);
  return `<span class="cv-status-chip" style="background:${c.bg};color:${c.col};">${_esc(s||'—')}</span>`;
}

async function _initClientMode(){
  document.body.classList.add('client-mode');
  try { document.getElementById('loginScreen').classList.add('hidden'); } catch(e){}
  const root = document.getElementById('clientView');
  root.style.display='block';
  root.innerHTML = `<div class="cv-wrap" style="text-align:center;padding-top:120px;color:#8a8794;font-size:14px;">Cargando estado de la campaña...</div>`;
  try {
    const doc = await db.collection('clientShares').doc(CLIENT_TOKEN).get();
    if(!doc.exists) throw new Error('not-found');
    const payload = doc.data();
    _cvData = payload.data;
    _renderClientView(root, payload);
  } catch(e){
    console.error('client mode', e);
    const msg = e.message==='not-found'
      ? 'Este link ya no está disponible. Pide al equipo un link actualizado.'
      : 'No se pudo cargar la información. Intenta de nuevo más tarde.';
    root.innerHTML = `
      <div class="cv-wrap" style="text-align:center;padding-top:100px;">
        <img src="assets/y-pink-filled-64.png" alt="" style="width:48px;height:48px;opacity:.8;">
        <div style="font-size:17px;font-weight:800;margin-top:16px;">Link no disponible</div>
        <div style="font-size:13px;color:#8a8794;margin-top:8px;">${_esc(msg)}</div>
      </div>`;
  }
}

function _renderClientView(root, payload){
  const s = _cvData;
  const cam = s.campaign||{};
  const pr = s.progress||{};
  const big = s.big||{};
  const fmt = n => formatNum(Math.round(n||0));
  const pctOf = (r,e)=> e>0 ? Math.min(100, Math.round(r/e*100)) : 0;
  const upd = s.updatedAt ? new Date(s.updatedAt).toLocaleString('es-MX',{day:'2-digit',month:'long',hour:'2-digit',minute:'2-digit'}) : '—';
  const totalPct = pr.totalCerrado>0 ? Math.round(pr.publicado/pr.totalCerrado*100) : null;

  // arranque de calendario: mes actual si tiene eventos, si no el del primer evento
  const cal = Array.isArray(s.cal)?s.cal:[];
  const now = new Date();
  const curKey = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  const hasCurrent = cal.some(ev=>String(ev.d||'').startsWith(curKey));
  if(!_cvMonth){
    if(hasCurrent || !cal.length) _cvMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    else { const first = cal.map(e=>e.d).sort()[0]; _cvMonth = new Date(parseInt(first.slice(0,4)), parseInt(first.slice(5,7))-1, 1); }
  }

  const metaBar = (label, real, est) => est>0 ? `
    <div class="cv-card">
      <div class="cv-kpi-label">${label}</div>
      <div class="cv-kpi-num" style="font-size:20px;">${fmt(real)} <span style="font-size:11px;color:#8a8794;font-weight:600;">/ ${fmt(est)} est.</span></div>
      <div class="cv-bar"><div style="width:${pctOf(real,est)}%;"></div></div>
      <div class="cv-kpi-sub">${pctOf(real,est)}% del estimado</div>
    </div>` : '';

  const profiles = Array.isArray(s.profiles)?s.profiles:[];
  const hasReach = profiles.some(p=>p.reach>0);
  const profRows = profiles.map(p=>`
    <tr>
      <td style="font-weight:700;">${_esc(p.name)}</td>
      <td>${_esc(p.plat||'—')}</td>
      <td class="r">${fmt(p.posts)}</td>
      <td class="r">${fmt(p.views)}</td>
      ${hasReach?`<td class="r">${fmt(p.reach)}</td>`:''}
      <td class="r">${fmt(p.eng)}</td>
    </tr>`).join('');

  const docs = Array.isArray(s.docs)?s.docs:[];
  const docIcon = {PDF:'📄', Sheets:'📊', Doc:'📝', 'Presentación':'📽', Drive:'📁'};
  const docsHtml = docs.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px;">` +
    docs.map(d=>{
      const u=_cvSafeUrl(d.url);
      return `<a class="cv-doc" ${u?`href="${_esc(u)}" target="_blank" rel="noopener"`:''}>
        <span style="font-size:20px;">${docIcon[d.type]||'📎'}</span>
        <span style="min-width:0;">
          <span style="display:block;font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_esc(d.name)}</span>
          <span style="display:block;font-size:11px;color:#8a8794;">${_esc(d.type||'')}${d.date?' · '+_esc(formatDateShort(d.date)):''}</span>
        </span>
      </a>`;
    }).join('') + `</div>` : `<div class="cv-empty">Sin documentos compartidos.</div>`;

  const flow = Array.isArray(s.flow)?s.flow:[];
  const flowHtml = flow.length ? `<div style="display:flex;flex-wrap:wrap;gap:8px;">` +
    flow.map((st,i)=>{
      const done = st.status==='Completado'||st.status==='Aprobado';
      return `<span style="display:inline-flex;align-items:center;gap:7px;background:#fff;border:1.5px solid ${done?'#bfe8c8':'#eee7ef'};border-radius:100px;padding:6px 14px 6px 8px;font-size:12px;font-weight:700;">
        <span style="width:20px;height:20px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:10px;background:${done?'#d3f5db':'#f1ecf3'};color:${done?'#166534':'#8a8794'};">${done?'✓':(i+1)}</span>
        ${_esc(st.step)} ${_cvChip(st.status)}
      </span>`;
    }).join('') + `</div>` : '';

  root.innerHTML = `
  <div class="cv-wrap">
    <div class="cv-topbar">
      <div class="cv-brand"><img src="assets/y-pink-filled-64.png" alt="Think Y"> Think Y · Reporte de campaña</div>
      <div class="cv-updated">Actualizado: ${_esc(upd)}</div>
    </div>

    <div class="cv-hero">
      <h1>${_esc(cam.name||'Campaña')} ${cam.status?`<span class="cv-badge">${_esc(cam.status)}</span>`:''}</h1>
      <div class="cv-sub">${_esc(cam.client||'')}${cam.season?' · '+_esc(cam.season):''}${cam.startDate?' · '+_esc(formatDateShort(cam.startDate))+(cam.endDate?' → '+_esc(formatDateShort(cam.endDate)):''):''}</div>
      ${cam.objective?`<div class="cv-sub" style="margin-top:10px;"><b>Objetivo:</b> ${_esc(cam.objective)}</div>`:''}
    </div>

    ${flowHtml?`<div class="cv-section" style="margin-top:0;"><h2>🚦 Fase del proyecto</h2>${flowHtml}</div>`:''}

    <div class="cv-section">
      <h2>📣 Publicaciones</h2>
      <div class="cv-grid">
        <div class="cv-card" style="grid-column:span 2;min-width:220px;">
          <div class="cv-kpi-label">Publicadas</div>
          <div class="cv-kpi-num">${fmt(pr.publicado)}${pr.totalCerrado?` <span style="font-size:13px;color:#8a8794;font-weight:600;">/ ${fmt(pr.totalCerrado)} totales</span>`:''}</div>
          ${totalPct!==null?`<div class="cv-bar"><div style="width:${Math.min(100,totalPct)}%;"></div></div><div class="cv-kpi-sub">${totalPct}% de avance</div>`:''}
        </div>
        <div class="cv-card"><div class="cv-kpi-label">Aprobadas</div><div class="cv-kpi-num" style="color:#1d4ed8;">${fmt(pr.aprobado)}</div><div class="cv-kpi-sub">listas para salir</div></div>
        <div class="cv-card"><div class="cv-kpi-label">Revisión interna</div><div class="cv-kpi-num" style="color:#854d0e;">${fmt(pr.revision)}</div><div class="cv-kpi-sub">en control de calidad</div></div>
        <div class="cv-card"><div class="cv-kpi-label">Por publicar</div><div class="cv-kpi-num" style="color:#be185d;">${fmt(pr.porPublicar)}</div><div class="cv-kpi-sub">programadas / pendientes</div></div>
      </div>
    </div>

    <div class="cv-section">
      <h2>🗓 Calendario de publicaciones</h2>
      <div class="cv-card" style="padding:16px;">
        <div class="cv-cal-head">
          <button onclick="_cvCalNav(-1)">←</button>
          <div id="cvCalTitle" style="font-size:14px;font-weight:800;text-transform:capitalize;"></div>
          <button onclick="_cvCalNav(1)">→</button>
        </div>
        <div id="cvCalGrid"></div>
      </div>
    </div>

    <div class="cv-section">
      <h2>📊 Big numbers</h2>
      <div class="cv-grid">
        <div class="cv-card"><div class="cv-kpi-label">Views</div><div class="cv-kpi-num">${fmt(big.views)}</div></div>
        ${big.reach?`<div class="cv-card"><div class="cv-kpi-label">Alcance</div><div class="cv-kpi-num">${fmt(big.reach)}</div></div>`:''}
        <div class="cv-card"><div class="cv-kpi-label">Interacciones</div><div class="cv-kpi-num">${fmt(big.eng)}</div></div>
        ${big.likes?`<div class="cv-card"><div class="cv-kpi-label">Likes</div><div class="cv-kpi-num">${fmt(big.likes)}</div></div>`:''}
        ${big.views>0&&big.eng>0?`<div class="cv-card"><div class="cv-kpi-label">ER</div><div class="cv-kpi-num">${(big.eng/big.views*100).toFixed(1)}%</div><div class="cv-kpi-sub">interacciones / views</div></div>`:''}
      </div>
      ${(big.estViews||big.estEng)?`<div class="cv-grid" style="margin-top:12px;">
        ${metaBar('Views vs estimado', big.views, big.estViews)}
        ${metaBar('Interacciones vs estimado', big.eng, big.estEng)}
        ${metaBar('Contenidos vs cerrado', pr.publicado, big.estCont)}
      </div>`:''}
      ${!big.posts?`<div class="cv-empty">Las métricas detalladas aparecerán aquí conforme se publique el contenido.</div>`:''}
    </div>

    <div class="cv-section">
      <h2>👤 Desempeño de perfiles</h2>
      ${profRows?`<div class="cv-card" style="padding:6px 10px;overflow-x:auto;">
        <table class="cv-table">
          <thead><tr><th>Perfil</th><th>Plataforma</th><th class="r">Posts</th><th class="r">Views</th>${hasReach?'<th class="r">Alcance</th>':''}<th class="r">Interacciones</th></tr></thead>
          <tbody>${profRows}</tbody>
        </table>
      </div>`:`<div class="cv-empty">Aún no hay métricas por perfil.</div>`}
    </div>

    <div class="cv-section">
      <h2>📎 Documentos</h2>
      ${docsHtml}
    </div>

    <div class="cv-footer">
      Reporte generado por <b>Think Y</b> · Vista de solo lectura<br>
      <span style="opacity:.7;">Los datos se actualizan continuamente por el equipo de la campaña.</span>
    </div>
  </div>`;

  _cvRenderCalendar();
}

window._cvCalNav = function(delta){
  if(!_cvMonth) return;
  _cvMonth = new Date(_cvMonth.getFullYear(), _cvMonth.getMonth()+delta, 1);
  _cvRenderCalendar();
};

function _cvRenderCalendar(){
  const grid = document.getElementById('cvCalGrid');
  const title = document.getElementById('cvCalTitle');
  if(!grid || !title || !_cvData) return;
  const cal = Array.isArray(_cvData.cal)?_cvData.cal:[];
  const y = _cvMonth.getFullYear(), m = _cvMonth.getMonth();
  title.textContent = _cvMonth.toLocaleDateString('es-MX',{month:'long',year:'numeric'});
  const byDay = {};
  cal.forEach(ev=>{
    const dd = String(ev.d||'');
    if(dd.slice(0,4)==String(y) && parseInt(dd.slice(5,7))===m+1){
      const day = parseInt(dd.slice(8,10));
      (byDay[day]=byDay[day]||[]).push(ev);
    }
  });
  const firstDow = (new Date(y,m,1).getDay()+6)%7; // lunes=0
  const daysInMonth = new Date(y,m+1,0).getDate();
  const todayISO = new Date().toISOString().slice(0,10);
  let cells = ['L','M','X','J','V','S','D'].map(d=>`<div class="cv-cal-dow">${d}</div>`).join('');
  for(let i=0;i<firstDow;i++) cells += `<div class="cv-cal-cell cv-out"></div>`;
  for(let d=1;d<=daysInMonth;d++){
    const iso = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const evts = byDay[d]||[];
    const shown = evts.slice(0,3);
    cells += `<div class="cv-cal-cell ${iso===todayISO?'cv-today':''}">
      <div class="cv-cal-daynum">${d}</div>
      ${shown.map(ev=>{
        const c=_cvStatusColor(ev.s);
        return `<div class="cv-cal-evt" style="background:${c.bg};color:${c.col};" title="${_esc(ev.n)}${ev.p?' · '+_esc(ev.p):''}${ev.s?' · '+_esc(ev.s):''}">${_esc(ev.n||'Post')}</div>`;
      }).join('')}
      ${evts.length>3?`<div style="font-size:9px;color:#8a8794;margin-top:2px;">+${evts.length-3} más</div>`:''}
    </div>`;
  }
  grid.innerHTML = `<div class="cv-cal-grid">${cells}</div>`;
}

// Hook de preview para el equipo: renderiza la vista cliente con un snapshot
// arbitrario sin pasar por Firestore (solo datos locales, sin permisos extra).
window.__cvPreview = function(data){
  _cvData = data;
  document.body.classList.add('client-mode');
  try { document.getElementById('loginScreen').classList.add('hidden'); } catch(e){}
  const root = document.getElementById('clientView');
  root.style.display='block';
  _renderClientView(root, {data});
};

if(CLIENT_TOKEN){
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', _initClientMode);
  else _initClientMode();
}
})();

