/* Campaign OS — Directorio de influencers, master creators DB, armador de escenario
   Extraído de index.html. Script CLÁSICO a propósito (NO type="module"):
   el HTML llama estas funciones desde atributos onclick/onchange, que solo
   resuelven contra el scope global. El orden de carga en index.html replica
   el orden original de ejecución y no debe alterarse. */

// ============================================================
// INFLUENCER DIRECTORY
// ============================================================

function infKey(inf) {
  return (inf.handle || inf.name || 'unknown').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-@_]/g, '');
}

// Reject names that look like fees / IDs / placeholders rather than creators.
// Rules: must exist, must not contain any digit, must be ≥2 chars, not in a
// banned-word list, not a single emoji.
function _isRealCreatorName(raw) {
  const v = String(raw || '').trim();
  if(!v) return false;
  if(v.length < 2) return false;
  if(/\d/.test(v)) return false;                  // any digit disqualifies
  if(/^(fee|ugc|tbd|na|n\/a|—|-)$/i.test(v)) return false;
  if(/^[\p{Emoji}\s]+$/u.test(v)) return false;   // only emoji
  return true;
}

// ============================================================
// MASTER CREATORS DB — base de datos de talento (colección `creators`)
// Fuente: import del Excel "Master Escenarios" + escenarios guardados en la app.
// ============================================================
function _creatorByKey(key) {
  return (_cache.creators||[]).find(c => c.key === key) || null;
}

const _MASTER_TIER_MAP = { CELEB:'VIP', VIP:'VIP', MEGA:'MEGA', MACRO:'MACRO', MID:'MID', MICRO:'MICRO', NANO:'NANO', NICHO:'NICHO' };
function _masterTier(raw) {
  const v = String(raw||'').trim().toUpperCase();
  return _MASTER_TIER_MAP[v] || '';
}
function _masterNum(v) {
  if(v == null || v === '' || v === '-') return 0;
  if(typeof v === 'number') return isFinite(v) ? v : 0;
  const n = Number(String(v).replace(/[$,\s%]/g,''));
  return isFinite(n) ? n : 0;
}
function _masterMes(v) {
  if(v instanceof Date && !isNaN(v)) return v.toISOString().slice(0,7);
  if(typeof v === 'number' && v > 20000) { // Excel serial date
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    if(!isNaN(d)) return d.toISOString().slice(0,7);
  }
  const s = String(v||'').trim();
  const m = s.match(/^(\d{4})-(\d{2})/);
  return m ? m[1]+'-'+m[2] : s;
}
function _masterKeywords(raw) {
  return String(raw||'').split(/[,;\n]/).map(s=>s.trim().toLowerCase()).filter(s=>s.length>1);
}

// Map header text (normalized) → field name. `includes` match, order matters.
const _MASTER_COLS = [
  ['marca','marca'], ['pais audiencia','audPaises'],
  ['costo total campana (usd)','_skip2'], ['costo total campana','costoTotal'],
  ['campana','campana'], ['mes','mes'],
  ['agencia','agencia'], ['subcategoria','keywords'], ['categoria','categoria'],
  ['nombre','nombre'], ['plataforma','plataforma'], ['link','link'],
  ['total de seguidores','_skip1'], ['seguidores','seguidores'], ['tier','tier'],
  ['ciudades','audCiudades'], ['edades','audEdades'], ['genero','audGenero'],
  ['cantidad de contenido','cantidad'],
  ['interacciones promedio','interacciones'],
  ['contenido','contenido'],
  ['views x posteo','viewsXPost'],
  ['engagement rate','er'], ['view rate','viewRate'],
  ['costo unitario','costoUnitario'],
  ['costo uso de imagen','costoPautaImagen'],
  ['uso de imagen','usoImagen'],
  ['pauta','pauta'],
  ['pais','pais'],
];
function _masterHeaderField(h) {
  const n = String(h||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim();
  if(!n) return null;
  for(const [needle, field] of _MASTER_COLS) { if(n.includes(needle)) return field; }
  return null;
}

// El master es una base curada: aceptamos nombres con dígitos ("Pollo 24"),
// solo rechazamos placeholders obvios.
function _isMasterCreatorName(raw) {
  const v = String(raw||'').trim();
  if(v.length < 2) return false;
  if(/^(fee|ugc|tbd|na|n\/a|—|-|total|subtotal)$/i.test(v)) return false;
  return true;
}

// Import del Excel Master: el botón de UI se retiró tras la carga inicial
// (2026-06). La base vive en Firestore `creators` y se alimenta de los
// escenarios guardados. Para re-importar: cargar SheetJS y llamar
// _handleMasterFile con un input file desde la consola.
function importMasterExcel() {
  const input = document.getElementById('masterImportFile');
  if(input) input.click();
}

async function _handleMasterFile(input) {
  const file = input.files && input.files[0];
  input.value = '';
  if(!file) return;
  if(typeof XLSX === 'undefined') { showToast('Librería de Excel no cargó — revisa tu conexión','error'); return; }
  showToast('Leyendo Excel...','success');
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { cellDates:true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header:1, defval:'' });
    if(!rows.length) throw new Error('Hoja vacía');
    const fields = rows[0].map(_masterHeaderField);
    const parsed = [];
    for(let i=1;i<rows.length;i++) {
      const r = {};
      rows[i].forEach((v,ci) => { const f = fields[ci]; if(f && !f.startsWith('_skip')) r[f] = v; });
      const nombre = String(r.nombre||'').trim();
      if(!nombre || !_isMasterCreatorName(nombre)) continue;
      // Skip the instructions row ("PONER FECHA...", no real data)
      if(!r.plataforma && !r.seguidores && !r.link) continue;
      parsed.push(r);
    }
    if(!parsed.length) throw new Error('No encontré filas de creadores. ¿Es el formato del Master?');
    const docs = _buildCreatorDocs(parsed);
    await _upsertCreators(docs);
    showToast(`Master importado: ${docs.length} creadores (${parsed.length} filas)`,'success');
    if(currentPage==='influencers') renderInfluencers();
  } catch(e) {
    console.error('master import', e);
    showToast('Error importando: '+e.message,'error');
  }
}

function _buildCreatorDocs(rows) {
  const map = new Map();
  rows.forEach(r => {
    const name = String(r.nombre).trim();
    const key = infKey({ name });
    if(!map.has(key)) map.set(key, {
      key, name,
      categoria:'', keywords:[], tier:'',
      platforms:{}, audiencia:{},
      historyMaster: [],
      source:'master',
    });
    const d = map.get(key);
    const plat = _normalizePlatform(r.plataforma) || String(r.plataforma||'').trim();
    // Perfil por plataforma (link + seguidores; nos quedamos con lo último visto)
    if(plat) {
      if(!d.platforms[plat]) d.platforms[plat] = {};
      if(r.link) d.platforms[plat].link = String(r.link).trim();
      const seg = _masterNum(r.seguidores);
      if(seg) d.platforms[plat].seguidores = seg;
    }
    if(r.categoria) d.categoria = String(r.categoria).trim().toUpperCase();
    _masterKeywords(r.keywords).forEach(k => { if(!d.keywords.includes(k)) d.keywords.push(k); });
    const tier = _masterTier(r.tier); if(tier) d.tier = tier;
    if(r.audPaises) d.audiencia.paises = String(r.audPaises).trim();
    if(r.audCiudades) d.audiencia.ciudades = String(r.audCiudades).trim();
    if(r.audEdades) d.audiencia.edades = String(r.audEdades).trim();
    if(r.audGenero) d.audiencia.genero = String(r.audGenero).trim();
    d.historyMaster.push({
      marca: String(r.marca||'').trim(),
      pais: String(r.pais||'').trim(),
      campana: String(r.campana||'').trim(),
      mes: _masterMes(r.mes),
      agencia: String(r.agencia||'').trim(),
      plataforma: plat,
      contenido: String(r.contenido||'').trim(),
      cantidad: _masterNum(r.cantidad),
      viewsXPost: _masterNum(r.viewsXPost),
      interacciones: _masterNum(r.interacciones),
      er: _masterNum(r.er),
      viewRate: _masterNum(r.viewRate),
      costoUnitario: _masterNum(r.costoUnitario),
      costoPautaImagen: _masterNum(r.costoPautaImagen),
      costoTotal: _masterNum(r.costoTotal),
      pauta: r.pauta === true || /^(true|si|sí|x|1)$/i.test(String(r.pauta||'').trim()),
      usoImagen: r.usoImagen === true || /^(true|si|sí|x|1)$/i.test(String(r.usoImagen||'').trim()),
    });
  });
  return Array.from(map.values());
}

async function _upsertCreators(docs) {
  const col = db.collection('workspaces').doc(WORKSPACE).collection('creators');
  const CHUNK = 400;
  for(let i=0;i<docs.length;i+=CHUNK) {
    const batch = db.batch();
    docs.slice(i,i+CHUNK).forEach(d => {
      batch.set(col.doc(d.key), { ...d, updatedAt: Date.now() }, { merge:true });
    });
    await batch.commit();
    if(docs.length > CHUNK) showToast(`Guardando ${Math.min(i+CHUNK,docs.length)}/${docs.length}...`,'success');
  }
}

// Historial completo del creador: master + escenarios guardados en la app, más reciente primero.
function _creatorAllHistory(cr) {
  const out = [];
  (cr.historyMaster||[]).forEach(h => out.push({...h, source:'master'}));
  Object.values(cr.historyApp||{}).forEach(entry => {
    (entry.lines||[]).forEach(l => out.push({
      marca: entry.client||'', campana: entry.campana||'', mes: entry.mes||'',
      plataforma: l.platform||'', contenido: l.contenido||'', cantidad: l.cantidad||0,
      viewsXPost: l.viewsXPost||0, interacciones: l.interacciones||0,
      costoUnitario: l.costoUnitario||0, costoTotal: l.costoTotal||0,
      pauta: !!(l.costoPauta), usoImagen:false, agencia:'', source:'app',
    }));
  });
  return out.sort((a,b) => String(b.mes||'').localeCompare(String(a.mes||'')));
}

// Última tarifa conocida del creador para una plataforma (y tipo de contenido si se da).
function creatorLatestRate(cr, platform, contenido) {
  const plat = _normalizePlatform(platform) || platform;
  const hist = _creatorAllHistory(cr).filter(h =>
    (_normalizePlatform(h.plataforma)||h.plataforma) === plat && (h.costoUnitario>0 || h.viewsXPost>0));
  if(!hist.length) return null;
  if(contenido) {
    const ct = String(contenido).toLowerCase().trim();
    const match = hist.find(h => String(h.contenido||'').toLowerCase().trim() === ct);
    if(match) return match;
  }
  return hist[0];
}

// Memo: getAllInfluencers recorre campañas + parsea escenarios + 700 creadores.
// Los listeners de Firestore lo invalidan; entre renders se reusa.
let _allInfMemo = null;
function _invalidateInfMemo() { _allInfMemo = null; }
function getAllInfluencers() {
  if(_allInfMemo) return _allInfMemo;
  const map = {};
  const ensure = (k, inf) => {
    if(!map[k]) map[k] = { key:k, name:inf.name, handle:inf.handle||'', platform:inf.platform||'', platforms:[], _platSet:new Set(), campaigns:[] };
    return map[k];
  };
  const addPlat = (entry, raw) => {
    const norm = _normalizePlatform(raw) || String(raw||'').trim();
    if(norm && !entry._platSet.has(norm)) { entry._platSet.add(norm); entry.platforms.push(norm); if(!entry.platform) entry.platform = norm; }
  };
  _cache.campaigns.forEach(c => {
    // 1) Imported influencer rows
    (c.influencers || []).forEach(inf => {
      if(!_isRealCreatorName(inf.name)) return;
      const k = infKey(inf);
      const e = ensure(k, inf);
      if(inf.platform) addPlat(e, inf.platform);
      if(!e.handle && inf.handle) e.handle = inf.handle;
      if(!e.campaigns.find(x => x.id === c.id)) e.campaigns.push({ id:c.id, name:c.name, client:c.client||'', status:c.status||'' });
    });
    // 2) Scenario creators (multi-platform per creator)
    (c.scenario && c.scenario.creators || []).forEach(cr => {
      if(!_isRealCreatorName(cr.name)) return;
      const k = infKey({ handle:'', name:cr.name });
      const e = ensure(k, { name:cr.name });
      (cr.platforms||[]).forEach(p => addPlat(e, p.contenidoTipo));
      if(!e.campaigns.find(x => x.id === c.id)) e.campaigns.push({ id:c.id, name:c.name, client:c.client||'', status:c.status||'' });
    });
    // 3) Parsed escenario rows (sheet) — creator platform breakdown
    try {
      if(c.escenarioRows && c.escenarioRows.length && typeof parseEscenarioRows === 'function') {
        const parsed = parseEscenarioRows(c.escenarioRows);
        (parsed.creators||[]).forEach(cr => {
          const nm = cr.nombre || cr.name;
          if(!_isRealCreatorName(nm)) return;
          const k = infKey({ handle:'', name:nm });
          const e = ensure(k, { name:nm });
          (cr.platforms||[]).forEach(p => addPlat(e, p.platform||p.contenido));
          if(!e.campaigns.find(x => x.id === c.id)) e.campaigns.push({ id:c.id, name:c.name, client:c.client||'', status:c.status||'' });
        });
      }
    } catch(err){}
  });
  // 4) Master creators DB (base de talento importada del Excel)
  (_cache.creators||[]).forEach(cr => {
    if(!cr.name || !_isMasterCreatorName(cr.name)) return;
    const e = ensure(cr.key, { name: cr.name });
    Object.keys(cr.platforms||{}).forEach(p => addPlat(e, p));
    e.master = cr;
    if(cr.categoria) e.categoria = cr.categoria;
    if(cr.keywords && cr.keywords.length) e.keywords = cr.keywords;
    if(cr.tier) e.tier = cr.tier;
    e.seguidoresTotal = Object.values(cr.platforms||{}).reduce((a,p)=>a+(Number(p.seguidores)||0),0);
  });
  _allInfMemo = Object.values(map).map(e => { delete e._platSet; return e; }).sort((a, b) => a.name.localeCompare(b.name));
  return _allInfMemo;
}

function infRatingsFor(key) {
  return (_cache.influencerRatings || []).filter(r => r.influencerKey === key);
}

// ============================================================
// SCENARIO BUILDER (Arma tu escenario)
// ============================================================
const SCENARIO_TIERS = ['VIP','MEGA','MACRO','MID','MICRO','NANO','NICHO'];
const SCENARIO_PLATFORMS = ['Instagram','TikTok','YouTube','Twitter/X','Facebook','Twitch'];
let _scenarioState = null; // { campaignId, budgetSource, creators:[...] }

function _scnId() { return 's'+Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
function _scnMoney(n) { n = Number(n)||0; return '$'+n.toLocaleString('es-MX',{maximumFractionDigits:0}); }

function _scenarioBudgetFor(c, source) {
  if(!c) return 0;
  if(source === 'client') return Number(c.budgetClient||c.budget||0);
  // ops = budgetOps if present, else client - margin
  if(c.budgetOps != null) return Number(c.budgetOps);
  const bc = Number(c.budgetClient||c.budget||0), bm = Number(c.budgetMargin||0);
  return bc > 0 ? bc - (bc*bm/100) : 0;
}

// ---- Step 1: pick campaign + confirm budget ----
function openScenarioStart() {
  const camps = visibleCampaigns();
  const sel = document.getElementById('scenarioCampSelect');
  if(!camps.length) { showToast('Primero crea una campaña','error'); return; }
  sel.innerHTML = camps.map(c=>`<option value="${c.id}">${_esc(c.name)}${c.client?' · '+_esc(c.client):''}</option>`).join('');
  _scenarioStartPreview();
  openModal('scenarioStartModal');
}

function _scenarioStartPreview() {
  const cid = document.getElementById('scenarioCampSelect').value;
  const c = _cache.campaigns.find(x=>x.id===cid);
  const box = document.getElementById('scenarioBudgetPreview');
  if(!c) { box.innerHTML=''; return; }
  const ops = _scenarioBudgetFor(c,'ops');
  const client = _scenarioBudgetFor(c,'client');
  const hasScenario = c.scenario && c.scenario.creators && c.scenario.creators.length;
  box.innerHTML = `
    <label class="form-label">2. Confirma el budget base del escenario</label>
    <div style="display:flex;flex-direction:column;gap:8px;margin-top:4px;">
      <label style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1.5px solid var(--pink);border-radius:12px;cursor:pointer;background:var(--pink-pale);">
        <input type="radio" name="scnBudgetSrc" value="ops" checked style="accent-color:var(--pink);">
        <div>
          <div style="font-weight:700;font-size:13px;">Budget de operaciones · ${_scnMoney(ops)}</div>
          <div style="font-size:11px;color:var(--text-muted);">Dinero asignado a operaciones (cliente − margen). Recomendado.</div>
        </div>
      </label>
      <label style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1.5px solid var(--border);border-radius:12px;cursor:pointer;">
        <input type="radio" name="scnBudgetSrc" value="client" style="accent-color:var(--pink);">
        <div>
          <div style="font-weight:700;font-size:13px;">Budget cliente total · ${_scnMoney(client)}</div>
          <div style="font-size:11px;color:var(--text-muted);">Presupuesto completo del cliente.</div>
        </div>
      </label>
    </div>
    ${hasScenario ? `<div style="margin-top:12px;padding:8px 12px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;font-size:11px;color:#92400e;">Esta campaña ya tiene un escenario guardado (${c.scenario.creators.length} creadores). Continuar lo abrirá para seguir editándolo.</div>` : ''}
  `;
}

function confirmScenarioStart() {
  const cid = document.getElementById('scenarioCampSelect').value;
  const c = _cache.campaigns.find(x=>x.id===cid);
  if(!c) { showToast('Selecciona una campaña','error'); return; }
  const source = document.querySelector('input[name="scnBudgetSrc"]:checked')?.value || 'ops';
  if(c.scenario && c.scenario.creators && c.scenario.creators.length) {
    _scenarioState = JSON.parse(JSON.stringify(c.scenario));
    _scenarioState.campaignId = cid;
    _scenarioState.budgetSource = source;
  } else {
    _scenarioState = { campaignId: cid, budgetSource: source, creators: [] };
  }
  closeModal('scenarioStartModal');
  openModal('scenarioModal');
  if(!_scenarioState.creators.length) scenarioAddCreator();
  else _renderScenario();
}

function closeScenarioEditor() { closeModal('scenarioModal'); }

// ---- Calculations (matches the agency scenario sheet) ----
function _scnLineTotals(p) {
  const qty   = Number(p.cantidad)||0;
  const seg   = Number(p.seguidores)||0;
  const vpc   = Number(p.viewsPerContent)||0;
  const impc  = Number(p.impresionesPerContent)||0;
  const ipc   = Number(p.interaccionesPerContent)||0;
  const cPauta= Number(p.costoPauta)||0;
  const cCont = Number(p.costoContenidos)||0;
  const totalSeguidores = seg * qty;
  const viewsTotal      = qty * vpc;
  const impresionesTotal= qty * impc;
  const engTotal        = qty * ipc;
  const cost            = cPauta + cCont;
  const er    = vpc>0 ? (ipc/vpc) : 0;       // engagement rate = inter/views
  const vrate = seg>0 ? (vpc/seg) : 0;       // view rate = views/seguidores
  return { qty, seg, totalSeguidores, viewsTotal, impresionesTotal, engTotal, cost, cPauta, cCont, er, vrate,
           cpv: viewsTotal>0?cost/viewsTotal:0, cpi: engTotal>0?cost/engTotal:0 };
}
function _scnCreatorTotals(cr) {
  let qty=0, seg=0, views=0, impr=0, eng=0, cost=0, cPauta=0, cCont=0, pauta=0;
  (cr.platforms||[]).forEach(p=>{ const t=_scnLineTotals(p); qty+=t.qty; seg+=t.totalSeguidores; views+=t.viewsTotal; impr+=t.impresionesTotal; eng+=t.engTotal; cost+=t.cost; cPauta+=t.cPauta; cCont+=t.cCont; pauta+=Number(p.pauta)||0; });
  return { qty, seg, views, impr, eng, cost, cPauta, cCont, pauta, cpv: views>0?cost/views:0, cpi: eng>0?cost/eng:0 };
}
function _scnGrand(creatorsArg) {
  let qty=0, seg=0, views=0, impr=0, eng=0, cost=0, cPauta=0, cCont=0, pauta=0, creators=0;
  ((creatorsArg || (_scenarioState&&_scenarioState.creators) || [])).forEach(cr=>{ const t=_scnCreatorTotals(cr); qty+=t.qty; seg+=t.seg; views+=t.views; impr+=t.impr; eng+=t.eng; cost+=t.cost; cPauta+=t.cPauta; cCont+=t.cCont; pauta+=t.pauta; creators++; });
  return { qty, seg, views, impr, eng, cost, cPauta, cCont, pauta, creators, cpv: views>0?cost/views:0, cpi: eng>0?cost/eng:0 };
}

// ---- Render ----
function _renderScenario() {
  if(!_scenarioState) return;
  const c = _cache.campaigns.find(x=>x.id===_scenarioState.campaignId);
  document.getElementById('scenarioTitle').textContent = 'Escenario · ' + (c?c.name:'');
  document.getElementById('scenarioSubtitle').textContent = (c&&c.client?c.client+' · ':'') + (_scenarioState.budgetSource==='ops'?'Budget operaciones':'Budget cliente');

  const budget = _scenarioBudgetFor(c, _scenarioState.budgetSource);
  const g = _scnGrand();
  const over = g.cost > budget && budget > 0;
  const pct = budget>0 ? Math.min(100,(g.cost/budget)*100) : 0;
  const barColor = over ? '#e5484d' : '#2fa86b';
  const remaining = budget - g.cost;

  document.getElementById('scenarioBudgetBar').innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:18px;align-items:center;">
      <div style="flex:1;min-width:220px;">
        <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:700;margin-bottom:5px;">
          <span style="color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;">Budget usado</span>
          <span style="color:${barColor};">${_scnMoney(g.cost)} / ${_scnMoney(budget)}</span>
        </div>
        <div style="height:10px;border-radius:6px;background:var(--bg);overflow:hidden;">
          <div style="height:100%;width:${pct}%;background:${barColor};transition:width var(--dur-fast),background var(--dur-fast);"></div>
        </div>
        <div style="font-size:11px;margin-top:5px;color:${over?'#e5484d':'var(--text-muted)'};font-weight:${over?'700':'500'};">
          ${over ? '⚠ Te pasaste por '+_scnMoney(Math.abs(remaining)) : 'Disponible: '+_scnMoney(remaining)}
        </div>
      </div>
      <div style="display:flex;gap:16px;flex-wrap:wrap;">
        ${_scnStat('Contenidos', g.qty)}
        ${_scnStat('Views est.', formatNum(g.views))}
        ${_scnStat('Eng. est.', formatNum(g.eng))}
        ${_scnStat('CPV', g.cpv?('$'+g.cpv.toFixed(2)):'—')}
        ${_scnStat('CPI', g.cpi?('$'+g.cpi.toFixed(2)):'—')}
      </div>
    </div>`;

  const body = document.getElementById('scenarioBody');
  if(!_scenarioState.creators.length) {
    body.innerHTML = '<div class="empty-state"><p>Agrega tu primer creador para empezar.</p></div>';
    return;
  }
  body.innerHTML = _scenarioState.creators.map((cr,ci)=>_scnCreatorCard(cr,ci)).join('') + _scnStatsSection();
}

function _scnStat(label, val) {
  return `<div style="text-align:center;"><div style="font-size:9px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;">${label}</div><div style="font-size:18px;font-weight:800;line-height:1.1;">${val}</div></div>`;
}

const _scnIn = (val, ci, pi, key, w) => `<input type="number" min="0" class="form-input" style="font-size:11px;padding:4px 6px;width:${w||80}px;" value="${val||0}" onchange="_scnSet(${ci},${pi},'${key}',this.value)">`;
const _scnPct = v => (v*100).toFixed(2).replace(/\.00$/,'')+'%';

function _scnCreatorCard(cr, ci) {
  const t = _scnCreatorTotals(cr);
  const platRows = (cr.platforms||[]).map((p,pi)=>{
    const pt = _scnLineTotals(p);
    const _plat = _scnLinePlatform(p);
    return `<tr>
      <td><select class="form-input" style="font-size:11px;padding:4px 6px;min-width:104px;" onchange="_scnSet(${ci},${pi},'platform',this.value)">
        ${SCENARIO_PLATFORMS.map(pl=>`<option ${_plat===pl?'selected':''}>${pl}</option>`).join('')}
      </select></td>
      <td><input class="form-input" style="font-size:11px;padding:4px 6px;width:104px;" value="${_esc(p.contenidoTipo||'')}" placeholder="Reel, Post, Story..." onchange="_scnSet(${ci},${pi},'contenidoTipo',this.value)"></td>
      <td>${_scnIn(p.seguidores,ci,pi,'seguidores',100)}</td>
      <td>${_scnIn(p.cantidad,ci,pi,'cantidad',54)}</td>
      <td style="font-size:11px;font-weight:700;color:var(--text-muted);white-space:nowrap;">${formatNum(pt.totalSeguidores)}</td>
      <td>${_scnIn(p.viewsPerContent,ci,pi,'viewsPerContent',90)}</td>
      <td style="font-size:11px;font-weight:700;color:var(--text-muted);white-space:nowrap;">${formatNum(pt.viewsTotal)}</td>
      <td>${_scnIn(p.interaccionesPerContent,ci,pi,'interaccionesPerContent',80)}</td>
      <td style="font-size:11px;font-weight:700;color:var(--text-muted);white-space:nowrap;">${formatNum(pt.engTotal)}</td>
      <td style="font-size:11px;white-space:nowrap;">${_scnPct(pt.er)}</td>
      <td style="font-size:11px;white-space:nowrap;">${_scnPct(pt.vrate)}</td>
      <td>${_scnIn(p.pauta,ci,pi,'pauta',46)}</td>
      <td>${_scnIn(p.costoPauta,ci,pi,'costoPauta',84)}</td>
      <td>${_scnIn(p.costoContenidos,ci,pi,'costoContenidos',90)}</td>
      <td style="font-size:11px;font-weight:700;white-space:nowrap;">${_scnMoney(pt.cost)}</td>
      <td style="font-size:11px;white-space:nowrap;">${pt.cpv?'$'+pt.cpv.toFixed(2):'—'}</td>
      <td style="font-size:11px;white-space:nowrap;">${pt.cpi?'$'+pt.cpi.toFixed(2):'—'}</td>
      <td><button onclick="_scnRemovePlat(${ci},${pi})" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:13px;">✕</button></td>
    </tr>`;
  }).join('');

  return `
  <div class="card" style="margin-bottom:14px;padding:14px 16px;">
    <div style="display:flex;flex-wrap:wrap;align-items:end;gap:10px;margin-bottom:10px;">
      <div style="flex:1;min-width:160px;">
        <label style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Creador</label>
        <input class="form-input" style="font-size:13px;font-weight:700;" value="${_esc(cr.name||'')}" placeholder="Nombre del creador" onchange="_scnSetCreator(${ci},'name',this.value)">
      </div>
      <div>
        <label style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Tier</label>
        <select class="form-input" style="font-size:12px;" onchange="_scnSetCreator(${ci},'tier',this.value)">
          <option value="">—</option>
          ${SCENARIO_TIERS.map(tr=>`<option ${cr.tier===tr?'selected':''}>${tr}</option>`).join('')}
        </select>
      </div>
      <button class="btn btn-ghost btn-sm" style="color:var(--red);" onclick="_scnRemoveCreator(${ci})">Eliminar creador</button>
    </div>
    <div class="table-wrap" style="overflow-x:auto;">
      <table class="table" style="font-size:11px;min-width:1280px;">
        <thead><tr>
          <th>Plataforma</th><th>Tipo contenido</th><th>Seguidores</th><th>Cant.</th><th>Total seg.</th>
          <th>Views x posteo</th><th>Views totales</th>
          <th>Inter. x cont.</th><th>Inter. totales</th>
          <th>ER %</th><th>View rate %</th>
          <th>Pauta</th><th>Costo pauta</th><th>Costo cont.</th><th>Costo</th>
          <th>CPV</th><th>CPI</th><th></th>
        </tr></thead>
        <tbody>${platRows||''}</tbody>
      </table>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;flex-wrap:wrap;gap:8px;">
      <button class="btn btn-ghost btn-sm" onclick="_scnAddPlat(${ci})">+ Agregar contenido</button>
      <div style="font-size:12px;color:var(--text-muted);">
        Subtotal: <b style="color:var(--text);">${t.qty} cont.</b> · ${formatNum(t.views)} views · ${formatNum(t.eng)} inter · <b style="color:var(--text);">${_scnMoney(t.cost)}</b>
        ${t.cpv?` · CPV $${t.cpv.toFixed(2)}`:''}${t.cpi?` · CPI $${t.cpi.toFixed(2)}`:''}
      </div>
    </div>
  </div>`;
}

function _scnStatsSection() {
  const platMix = {}, tierMix = {}; let boosted = 0;
  (_scenarioState.creators||[]).forEach(cr=>{
    if(cr.tier) tierMix[cr.tier] = (tierMix[cr.tier]||0)+1;
    (cr.platforms||[]).forEach(p=>{
      const q = Number(p.cantidad)||0;
      const pl = _scnLinePlatform(p);
      platMix[pl] = (platMix[pl]||0)+q;
      boosted += Number(p.pauta)||0;
    });
  });
  const g = _scnGrand();
  const bar = (entries, total, colorFn) => entries.sort((a,b)=>b[1]-a[1]).map(([k,v],i)=>{
    const pct = total>0?((v/total)*100):0;
    return `<div style="margin-bottom:6px;">
      <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px;"><span>${_esc(k)}</span><span style="color:var(--text-muted);">${v} (${pct.toFixed(0)}%)</span></div>
      <div style="height:7px;border-radius:4px;background:var(--bg);overflow:hidden;"><div style="height:100%;width:${pct}%;background:${colorFn(k,i)};"></div></div>
    </div>`;
  }).join('');

  return `
  <div class="card" style="margin-top:6px;padding:16px 18px;">
    <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:14px;">📊 Estadísticas del escenario</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;">
      <div>
        <div style="font-size:12px;font-weight:700;margin-bottom:8px;">Contenidos por plataforma</div>
        ${bar(Object.entries(platMix), g.qty, (k,i)=>_platformColor(k,i)) || '<span style="font-size:11px;color:var(--text-muted);">Sin datos</span>'}
      </div>
      <div>
        <div style="font-size:12px;font-weight:700;margin-bottom:8px;">Creadores por tier</div>
        ${bar(Object.entries(tierMix), g.creators, (k,i)=>_PLATFORM_FALLBACK[i%_PLATFORM_FALLBACK.length]) || '<span style="font-size:11px;color:var(--text-muted);">Sin datos</span>'}
      </div>
    </div>
    <div style="margin-top:14px;display:flex;flex-wrap:wrap;gap:18px;font-size:12px;border-top:1px solid var(--border);padding-top:12px;">
      <span><b>${g.creators}</b> creadores</span>
      <span><b>${g.qty}</b> contenidos</span>
      <span><b>${g.pauta}</b> con pauta</span>
      <span>Seguidores totales: <b>${formatNum(g.seg)}</b></span>
      <span>Views totales: <b>${formatNum(g.views)}</b></span>
      <span>Interacciones totales: <b>${formatNum(g.eng)}</b></span>
      <span>Costo pauta: <b>${_scnMoney(g.cPauta)}</b></span>
      <span>Costo contenidos: <b>${_scnMoney(g.cCont)}</b></span>
      <span>CPV: <b>${g.cpv?('$'+g.cpv.toFixed(2)):'—'}</b></span>
      <span>CPI: <b>${g.cpi?('$'+g.cpi.toFixed(2)):'—'}</b></span>
    </div>
  </div>`;
}

// ---- Mutations ----
const _SCN_NUM_KEYS = ['seguidores','cantidad','viewsPerContent','impresionesPerContent','interaccionesPerContent','pauta','costoPauta','costoContenidos'];
function _newScnLine(seed) {
  return Object.assign({ id:_scnId(), platform:'Instagram', contenidoTipo:'', seguidores:0, cantidad:1, viewsPerContent:0, impresionesPerContent:0, interaccionesPerContent:0, pauta:0, costoPauta:0, costoContenidos:0 }, seed||{});
}
// Back-compat: derive platform from old free-text content if missing.
function _scnLinePlatform(p) {
  return p.platform || _normalizePlatform(p.contenidoTipo) || 'Instagram';
}
function _scnSet(ci, pi, key, val) {
  const p = _scenarioState.creators[ci].platforms[pi];
  if(_SCN_NUM_KEYS.includes(key)) p[key] = Number(val)||0;
  else p[key] = val;
  _renderScenario();
}
function _scnSetCreator(ci, key, val) {
  _scenarioState.creators[ci][key] = val;
  _renderScenario();
}
function _scnAddPlat(ci) {
  _scenarioState.creators[ci].platforms.push(_newScnLine());
  _renderScenario();
}
function _scnRemovePlat(ci, pi) {
  const cr = _scenarioState.creators[ci];
  const removed = cr.platforms[pi];
  cr.platforms.splice(pi,1);
  _renderScenario();
  showToast('Contenido eliminado','', { label:'Deshacer', fn: () => {
    cr.platforms.splice(pi, 0, removed);
    _renderScenario();
  }});
}
function _scnRemoveCreator(ci) {
  const removed = _scenarioState.creators[ci];
  _scenarioState.creators.splice(ci,1);
  _renderScenario();
  showToast(`${removed.name||'Creador'} eliminado del escenario`,'', { label:'Deshacer', fn: () => {
    _scenarioState.creators.splice(ci, 0, removed);
    _renderScenario();
  }});
}
function scenarioAddCreator(seed) {
  _scenarioState.creators.push(seed || { id:_scnId(), name:'', tier:'', platforms:[_newScnLine()] });
  _renderScenario();
}

let _scnPickName = null;
function scenarioPickExisting() {
  const infs = getAllInfluencers();
  if(!infs.length) { showToast('No hay creadores anteriores registrados','error'); return; }
  _scnPickName = null;
  document.getElementById('scnPickSearch').value = '';
  document.getElementById('scnPickTipo').value = '';
  const platSel = document.getElementById('scnPickPlatform');
  platSel.innerHTML = SCENARIO_PLATFORMS.map(p=>`<option>${p}</option>`).join('');
  document.getElementById('scnPickAddBtn').disabled = true;
  // Abrir el modal primero para que tenga layout, luego pintar la lista en el
  // siguiente frame. Evita que la tabla aparezca vacía hasta interactuar.
  openModal('scnPickModal');
  requestAnimationFrame(_scnRenderPickList);
}

function _scnRenderPickList() {
  const q = (document.getElementById('scnPickSearch').value||'').toLowerCase();
  let infs = getAllInfluencers();
  if(q) infs = infs.filter(i =>
    (i.name||'').toLowerCase().includes(q) ||
    (i.handle||'').toLowerCase().includes(q) ||
    (i.categoria||'').toLowerCase().includes(q) ||
    (i.keywords||[]).some(k => k.includes(q)));
  const list = document.getElementById('scnPickList');
  if(!infs.length) { list.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:12px;">Sin resultados.</div>'; return; }
  list.innerHTML = infs.slice(0,150).map(i=>{
    const sel = _scnPickName && _scnPickName.toLowerCase()===(i.name||'').toLowerCase();
    const plats = (i.platforms&&i.platforms.length)?platformBadges(i.platforms):(i.platform?platformBadge(i.platform):'');
    const meta = [i.categoria, i.seguidoresTotal?formatNum(i.seguidoresTotal)+' seg.':''].filter(Boolean).join(' · ');
    return `<div onclick="_scnPickSelect('${(i.name||'').replace(/'/g,"\\'")}')" style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:10px;cursor:pointer;${sel?'background:var(--pink-pale);border:1px solid var(--pink);':'border:1px solid transparent;'}">
      <div class="inf-avatar" style="width:28px;height:28px;font-size:11px;flex-shrink:0;">${(i.name||'?')[0]}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;gap:6px;">${_esc(i.name)} ${_tierBadge(i.tier)}</div>
        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:2px;align-items:center;">${plats}${meta?`<span style="font-size:10px;color:var(--text-muted);">${_esc(meta)}</span>`:''}</div>
      </div>
      ${sel?'<span style="color:var(--pink);font-weight:700;">✓</span>':''}
    </div>`;
  }).join('') + (infs.length>150?`<div style="padding:10px;text-align:center;color:var(--text-muted);font-size:11px;">Mostrando 150 de ${infs.length} — afina tu búsqueda</div>`:'');
}

function _scnPickSelect(name) {
  _scnPickName = name;
  // Pre-select first known platform of this creator if available
  const inf = getAllInfluencers().find(i=>(i.name||'').toLowerCase()===name.toLowerCase());
  if(inf && inf.platforms && inf.platforms.length) {
    const platSel = document.getElementById('scnPickPlatform');
    const match = SCENARIO_PLATFORMS.indexOf(inf.platforms[0]);
    if(match>=0) platSel.value = inf.platforms[0];
  }
  document.getElementById('scnPickAddBtn').disabled = false;
  _scnRenderPickList();
}

function _scnPickConfirm() {
  if(!_scnPickName) { showToast('Selecciona un creador','error'); return; }
  const platform = document.getElementById('scnPickPlatform').value || 'Instagram';
  const tipo = (document.getElementById('scnPickTipo').value||'').trim();
  // Autofill desde la base de talento: seguidores, views, interacciones y última tarifa.
  const master = _creatorByKey(infKey({ name:_scnPickName }));
  const seed = { platform, contenidoTipo: tipo };
  let tier = '';
  if(master) {
    tier = master.tier || '';
    const pd = (master.platforms||{})[platform];
    if(pd && pd.seguidores) seed.seguidores = pd.seguidores;
    const rate = creatorLatestRate(master, platform, tipo);
    if(rate) {
      if(!seed.contenidoTipo && rate.contenido) seed.contenidoTipo = rate.contenido;
      if(rate.viewsXPost) seed.viewsPerContent = rate.viewsXPost;
      if(rate.interacciones) seed.interaccionesPerContent = rate.interacciones;
      if(rate.costoUnitario) seed.costoContenidos = rate.costoUnitario;
      if(!seed.seguidores && rate.seguidores) seed.seguidores = rate.seguidores;
    }
  }
  const line = _newScnLine(seed);
  // If creator already in scenario, append a line; else add new creator.
  const existing = (_scenarioState.creators||[]).find(c=>(c.name||'').toLowerCase()===_scnPickName.toLowerCase());
  if(existing) {
    existing.platforms.push(line);
    if(!existing.tier && tier) existing.tier = tier;
  } else {
    _scenarioState.creators.push({ id:_scnId(), name:_scnPickName, tier, platforms:[line] });
  }
  closeModal('scnPickModal');
  _renderScenario();
  showToast(master && line.costoContenidos ? 'Creador agregado con su última tarifa' : 'Creador agregado','success');
}

// ---- Sugeridor por keywords compartidas ----
let _scnSuggestions = [];
function _scnNorm(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim(); }
function _scnCreatorKeywords(inf){
  const kw = new Set();
  (inf.keywords||[]).forEach(k=>{ const n=_scnNorm(k); if(n) kw.add(n); });
  if(inf.categoria) kw.add(_scnNorm(inf.categoria));
  return kw;
}
function scenarioSuggestByKeywords(){
  if(!_scenarioState){ showToast('Abre un escenario primero','error'); return; }
  const all = getAllInfluencers();
  if(!all.length){ showToast('No hay base de creadores','error'); return; }
  const byName = new Map(all.map(i=>[_scnNorm(i.name), i]));
  const inScenario = new Set((_scenarioState.creators||[]).map(c=>_scnNorm(c.name)).filter(Boolean));
  if(!inScenario.size){ showToast('Agrega primero algún creador al escenario','error'); return; }
  // Keywords semilla: las de los creadores ya en el escenario (con frecuencia)
  const seedKw = new Map();
  inScenario.forEach(nm=>{ const inf=byName.get(nm); if(!inf) return; _scnCreatorKeywords(inf).forEach(k=>seedKw.set(k,(seedKw.get(k)||0)+1)); });
  if(!seedKw.size){ showToast('Los creadores del escenario no tienen keywords registradas','error'); return; }
  // Candidatos: creadores fuera del escenario que comparten ≥1 keyword
  const suggestions = [];
  all.forEach(inf=>{
    const nm=_scnNorm(inf.name);
    if(!nm || inScenario.has(nm)) return;
    const kws=_scnCreatorKeywords(inf);
    const shared=[...kws].filter(k=>seedKw.has(k));
    if(!shared.length) return;
    const score=shared.reduce((s,k)=>s+(seedKw.get(k)||1),0);
    suggestions.push({ inf, shared, score });
  });
  suggestions.sort((a,b)=> (b.score-a.score) || (b.shared.length-a.shared.length) || _scnNorm(a.inf.name).localeCompare(_scnNorm(b.inf.name)));
  _scnSuggestions = suggestions.slice(0,40);
  _renderScnSuggestModal(seedKw);
  openModal('scnSuggestModal');
}
function _renderScnSuggestModal(seedKw){
  const body=document.getElementById('scnSuggestBody');
  if(!body) return;
  const seedChips=[...seedKw.entries()].sort((a,b)=>b[1]-a[1]).slice(0,14)
    .map(([k,n])=>`<span style="font-size:11px;padding:2px 8px;border-radius:10px;background:var(--pink-pale);color:var(--pink);">${_esc(k)}${n>1?' ·'+n:''}</span>`).join(' ');
  const head=`<div style="margin-bottom:12px;font-size:12px;color:var(--text-muted);">Keywords de tu escenario:<div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px;">${seedChips||'<span>—</span>'}</div></div>`;
  if(!_scnSuggestions.length){
    body.innerHTML=head+`<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px;">No hay otros creadores con keywords compartidas en la base.</div>`;
    return;
  }
  body.innerHTML=head+_scnSuggestions.map(s=>{
    const i=s.inf;
    const plats=(i.platforms&&i.platforms.length)?platformBadges(i.platforms):'';
    const shared=s.shared.slice(0,6).map(k=>`<span style="font-size:10px;padding:1px 6px;border-radius:8px;background:#eafaf1;color:#3a7a5e;border:1px solid #b7e4c7;">${_esc(k)}</span>`).join(' ');
    const meta=[i.categoria,i.seguidoresTotal?formatNum(i.seguidoresTotal)+' seg.':''].filter(Boolean).join(' · ');
    return `<div style="display:flex;align-items:center;gap:10px;padding:9px 10px;border:1px solid var(--border);border-radius:12px;margin-bottom:8px;">
      <div class="inf-avatar" style="width:32px;height:32px;font-size:12px;flex-shrink:0;">${_esc((i.name||'?')[0])}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:600;display:flex;align-items:center;gap:6px;">${_esc(i.name)} ${_tierBadge(i.tier)}</div>
        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:3px;align-items:center;">${plats}${meta?`<span style="font-size:10px;color:var(--text-muted);">${_esc(meta)}</span>`:''}</div>
        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px;align-items:center;"><span style="font-size:9px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;">Comparte:</span> ${shared}</div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="_scnSuggestAdd('${(i.name||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'")}')" style="white-space:nowrap;">+ Sumar</button>
    </div>`;
  }).join('');
}
function _scnSuggestAdd(name){
  const all=getAllInfluencers();
  const inf=all.find(i=>_scnNorm(i.name)===_scnNorm(name));
  const platform=(inf&&inf.platforms&&inf.platforms[0])||'Instagram';
  const master=_creatorByKey(infKey({ name }));
  const seed={ platform };
  let tier=inf?inf.tier||'':'';
  if(master){
    tier=master.tier||tier;
    const pd=(master.platforms||{})[platform];
    if(pd&&pd.seguidores) seed.seguidores=pd.seguidores;
    const rate=creatorLatestRate(master, platform, '');
    if(rate){
      if(rate.contenido) seed.contenidoTipo=rate.contenido;
      if(rate.viewsXPost) seed.viewsPerContent=rate.viewsXPost;
      if(rate.interacciones) seed.interaccionesPerContent=rate.interacciones;
      if(rate.costoUnitario) seed.costoContenidos=rate.costoUnitario;
      if(!seed.seguidores&&rate.seguidores) seed.seguidores=rate.seguidores;
    }
  }
  const line=_newScnLine(seed);
  const existing=(_scenarioState.creators||[]).find(c=>_scnNorm(c.name)===_scnNorm(name));
  if(existing){ existing.platforms.push(line); if(!existing.tier&&tier) existing.tier=tier; }
  else { _scenarioState.creators.push({ id:_scnId(), name, tier, platforms:[line] }); }
  _renderScenario();
  showToast('Creador agregado al escenario','success');
  // Recalcular sugerencias (excluye al recién sumado, reajusta keywords)
  scenarioSuggestByKeywords();
}

// ---- Save ----
function scenarioSave() {
  const campaigns = getData('campaigns');
  const idx = campaigns.findIndex(x=>x.id===_scenarioState.campaignId);
  if(idx===-1) { showToast('Campaña no encontrada','error'); return; }
  const btn = document.getElementById('scnSaveBtn');
  if(btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }
  const stamp = Date.now();
  // Vincular el escenario armado a la campaña como escenarioRows (mismo shape
  // que el de Google Sheets) para que la pestaña Escenario y el reporte lo
  // consuman con el pipeline existente.
  const escRows = _scenarioRowsAsObjects();
  campaigns[idx] = { ...campaigns[idx],
    scenario: { budgetSource: _scenarioState.budgetSource, creators: _scenarioState.creators, updatedAt: stamp },
    escenarioRows: escRows,
    escenarioSource: 'app',
    escenarioLastSync: stamp,
  };
  setData('campaigns', campaigns);
  // Persistir las filas en el store aparte (escenarioRows se strip de Firestore)
  persistEscenario(_scenarioState.campaignId, escRows, '', stamp);
  // Reflejar en cache + invalidar memo de parseo
  const cc = _cache.campaigns.find(x=>x.id===_scenarioState.campaignId);
  if(cc) {
    cc.scenario = campaigns[idx].scenario;
    cc.escenarioRows = escRows;
    cc.escenarioSource = 'app';
    cc.escenarioLastSync = stamp;
    cc._memoEscenario = null; cc._memoEscenarioStamp = null;
  }
  _escenarioStoreChecked.add(_scenarioState.campaignId);
  // Alimentar la base de talento: cada creador del escenario guarda su entrada
  // bajo historyApp[campaignId] (re-guardar el mismo escenario solo la actualiza).
  try { _scenarioFeedCreatorsDB(campaigns[idx]); } catch(e){ console.warn('feed creators db', e); }
  showToast('Escenario guardado y vinculado a la campaña','success');
  closeScenarioEditor();
  // Refrescar la pestaña Escenario si la campaña abierta es la misma
  if(currentCampaignId === _scenarioState.campaignId) {
    const c = _cache.campaigns.find(x=>x.id===currentCampaignId);
    if(c && typeof renderEscenarioBlock==='function') renderEscenarioBlock(c);
  }
}

// Convierte el escenario armado (_scenarioFlatRows) a array de objetos keyados
// por columna, listo para parseEscenarioRows.
function _scenarioRowsAsObjects(state) {
  const { rows } = _scenarioFlatRows(state);
  const header = rows[0] || [];
  return rows.slice(1).map(r => { const o = {}; header.forEach((h,i)=>o[h]=r[i]); return o; });
}

// Si la campaña tiene un escenario armado en plataforma (c.scenario) pero aún
// no tiene escenarioRows derivadas (p.ej. guardado antes de esta feature),
// las deriva en memoria para que la pestaña Escenario y el reporte lo reflejen.
// No escribe Firestore: c.scenario ya persiste y esto se recalcula al cargar.
function _ensureEscenarioRows(c) {
  if(!c) return;
  const hasAppScenario = !!(c.scenario && c.scenario.creators && c.scenario.creators.length);
  if(!hasAppScenario) return;
  if(c.escenarioSource === 'sheets') return; // usuario habilitó Sheets explícitamente
  if(c.escenarioRows && c.escenarioRows.length) return; // ya hay filas, no clobber
  try {
    c.escenarioRows = _scenarioRowsAsObjects({ campaignId:c.id, creators:c.scenario.creators });
    c.escenarioSource = 'app';
    if(!c.escenarioLastSync) c.escenarioLastSync = c.scenario.updatedAt || Date.now();
    c._memoEscenario = null; c._memoEscenarioStamp = null;
  } catch(e){ console.warn('ensure escenario rows', e); }
}

// Reabrir la carga por Google Sheets sobre un escenario armado en plataforma.
function enableEscenarioSheets() {
  const c = _cache.campaigns.find(x=>x.id===currentCampaignId);
  if(!c) return;
  if(!confirm('¿Habilitar la carga desde Google Sheets? El escenario armado en la plataforma queda guardado, pero si sincronizas un Sheet lo sobreescribirá.')) return;
  c.escenarioSource = 'sheets';
  const campaigns = getData('campaigns');
  const idx = campaigns.findIndex(x=>x.id===c.id);
  if(idx>=0) { campaigns[idx].escenarioSource = 'sheets'; setData('campaigns', campaigns); }
  renderEscenarioBlock(c);
  showToast('Carga por Google Sheets habilitada','success');
}

// Export del escenario a Excel real (.xls SpreadsheetML 2003), misma data que el CSV.
function scenarioExportXLSX() {
  const { rows, name } = _scenarioFlatRows();
  const esc = s => String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const cell = v => {
    const s = String(v==null?'':v);
    const isNum = s!=='' && /^-?\d+(\.\d+)?$/.test(s);
    return isNum
      ? `<Cell><Data ss:Type="Number">${s}</Data></Cell>`
      : `<Cell><Data ss:Type="String">${esc(s)}</Data></Cell>`;
  };
  const body = rows.map((r,i)=>`<Row${i===0?' ss:StyleID="hdr"':''}>${r.map(cell).join('')}</Row>`).join('');
  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles><Style ss:ID="hdr"><Font ss:Bold="1"/><Interior ss:Color="#FCE7F1" ss:Pattern="Solid"/></Style></Styles>
<Worksheet ss:Name="Escenario"><Table>${body}</Table></Worksheet>
</Workbook>`;
  const blob = new Blob([xml], {type:'application/vnd.ms-excel'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `Escenario - ${name}.xls`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  showToast('Excel descargado','success');
}

async function _scenarioFeedCreatorsDB(campaign) {
  const col = db.collection('workspaces').doc(WORKSPACE).collection('creators');
  const mes = new Date().toISOString().slice(0,7);
  const batch = db.batch();
  let count = 0;
  (_scenarioState.creators||[]).forEach(cr => {
    const name = String(cr.name||'').trim();
    if(!name || !_isRealCreatorName(name)) return;
    const key = infKey({ name });
    const lines = (cr.platforms||[]).map(p => {
      const qty = Number(p.cantidad)||0;
      const cCont = Number(p.costoContenidos)||0;
      return {
        platform: _scnLinePlatform(p),
        contenido: p.contenidoTipo||'',
        cantidad: qty,
        seguidores: Number(p.seguidores)||0,
        viewsXPost: Number(p.viewsPerContent)||0,
        interacciones: Number(p.interaccionesPerContent)||0,
        costoUnitario: qty>0 ? Math.round(cCont/qty) : cCont,
        costoPauta: Number(p.costoPauta)||0,
        costoTotal: cCont + (Number(p.costoPauta)||0),
      };
    }).filter(l => l.cantidad>0 || l.costoTotal>0 || l.viewsXPost>0);
    if(!lines.length) return;
    const doc = {
      key, name,
      updatedAt: Date.now(),
      historyApp: { [campaign.id]: {
        campana: campaign.name||'', client: campaign.client||'', mes, lines,
      }},
    };
    if(cr.tier) doc.tier = cr.tier;
    batch.set(col.doc(key), doc, { merge:true });
    count++;
  });
  if(count) await batch.commit();
}

// ---- Export ----
function _scenarioFlatRows(state) {
  const st = state || _scenarioState || { campaignId:null, creators:[] };
  const c = _cache.campaigns.find(x=>x.id===st.campaignId);
  const header = ['NOMBRE','TIER','SEGUIDORES','PLATAFORMA','CONTENIDO','CANTIDAD DE CONTENIDO','TOTAL DE SEGUIDORES','VIEWS X POSTEO ESTIMADAS','INTERACCIONES PROMEDIO X CONTENIDO','ENGAGEMENT RATE PROMEDIO','VIEW RATE PROMEDIO','VIEWS ESTIMADAS TOTALES','INTERACCIONES ESTIMADAS TOTALES','PAUTA','COSTO PAUTA','COSTO CONTENIDOS','COSTO','CPV','CPI'];
  const rows = [header];
  (st.creators||[]).forEach(cr=>{
    let first = true;
    (cr.platforms||[]).forEach(p=>{
      const pt = _scnLineTotals(p);
      rows.push([
        first?(cr.name||''):'', first?(cr.tier||''):'',
        p.seguidores||0, _scnLinePlatform(p), p.contenidoTipo||'', p.cantidad||0, pt.totalSeguidores,
        p.viewsPerContent||0, p.interaccionesPerContent||0,
        (pt.er*100).toFixed(2)+'%', (pt.vrate*100).toFixed(2)+'%',
        pt.viewsTotal, pt.engTotal,
        p.pauta||0, p.costoPauta||0, p.costoContenidos||0, pt.cost,
        pt.viewsTotal>0?(pt.cost/pt.viewsTotal).toFixed(4):'', pt.engTotal>0?(pt.cost/pt.engTotal).toFixed(4):''
      ]);
      first = false;
    });
  });
  const g = _scnGrand(st.creators);
  rows.push(['TOTALES','',g.seg,'','',g.qty,g.seg,'','','','',g.views,g.eng,g.pauta,g.cPauta,g.cCont,g.cost,g.cpv?g.cpv.toFixed(4):'',g.cpi?g.cpi.toFixed(4):'']);
  return { rows, name: (c?c.name:'escenario') };
}
function scenarioExportCSV() {
  const { rows, name } = _scenarioFlatRows();
  const csv = rows.map(r=>r.map(v=>{
    const s = String(v==null?'':v);
    return /[",\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
  }).join(',')).join('\n');
  const blob = new Blob(['﻿'+csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `Escenario - ${name}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  showToast('CSV descargado','success');
}
function scenarioCopyTSV() {
  const { rows } = _scenarioFlatRows();
  const tsv = rows.map(r=>r.join('\t')).join('\n');
  navigator.clipboard.writeText(tsv).then(
    ()=>showToast('Tabla copiada — pégala en Sheets/Excel','success'),
    ()=>showToast('No se pudo copiar','error')
  );
}

function avgStars(ratings) {
  if (!ratings.length) return 0;
  return ratings.reduce((s, r) => s + r.stars, 0) / ratings.length;
}

function starsHtml(avg, size) {
  const cls = size === 'sm' ? ' star-sm' : '';
  return [1,2,3,4,5].map(i => `<span class="star${cls}" style="color:${i <= Math.round(avg) ? '#f5a623' : '#ddd'};">★</span>`).join('');
}

function _infFillFilterOptions(infs) {
  const fill = (id, values, label) => {
    const sel = document.getElementById(id);
    if(!sel) return;
    const cur = sel.value;
    sel.innerHTML = `<option value="">${label}</option>` + values.map(v=>`<option value="${_esc(v)}">${_esc(v)}</option>`).join('');
    if(values.includes(cur)) sel.value = cur;
  };
  fill('infFilterCategoria', [...new Set(infs.map(i=>i.categoria).filter(Boolean))].sort(), 'Categoría: todas');
  const tierOrder = ['VIP','MEGA','MACRO','MID','MICRO','NANO','NICHO'];
  fill('infFilterTier', [...new Set(infs.map(i=>i.tier).filter(Boolean))].sort((a,b)=>tierOrder.indexOf(a)-tierOrder.indexOf(b)), 'Tier: todos');
  fill('infFilterPlat', [...new Set(infs.flatMap(i=>i.platforms||[]))].sort(), 'Plataforma: todas');
}

const _TIER_COLORS = { VIP:'#b45309', MEGA:'#7c3aed', MACRO:'#2563eb', MID:'#0d9488', MICRO:'#65a30d', NANO:'#ea580c', NICHO:'#db2777' };
function _tierBadge(tier) {
  if(!tier) return '';
  const c = _TIER_COLORS[tier] || '#6b7280';
  return `<span style="font-size:10px;font-weight:800;padding:2px 8px;border-radius:10px;background:${c}18;color:${c};letter-spacing:.5px;">${_esc(tier)}</span>`;
}

// Debounce de búsqueda: 699 cards re-renderizan; esperar a que dejen de teclear.
let _infSearchTimer = null;
function _infSearchDebounced() {
  clearTimeout(_infSearchTimer);
  _infSearchTimer = setTimeout(() => { _infShowLimit = 60; renderInfluencers(); }, 160);
}
let _infShowLimit = 60;
function _infShowMore() { _infShowLimit += 120; renderInfluencers(); }
function _infResetAndRender() { _infShowLimit = 60; renderInfluencers(); }

function _infClearFilters() {
  const set = (id,v) => { const el=document.getElementById(id); if(el) el.value=v; };
  set('infSearch',''); set('infFilterCategoria',''); set('infFilterTier',''); set('infFilterPlat','');
  _infResetAndRender();
}

const _INF_SKELETON = `<div class="skel-card">
  <div style="display:flex;gap:10px;align-items:center;">
    <div class="skel" style="width:40px;height:40px;border-radius:50%;flex-shrink:0;"></div>
    <div style="flex:1;display:flex;flex-direction:column;gap:6px;"><div class="skel" style="height:14px;width:60%;"></div><div class="skel" style="height:10px;width:40%;"></div></div>
  </div>
  <div class="skel" style="height:10px;width:80%;"></div>
  <div class="skel" style="height:10px;width:55%;"></div>
</div>`;

// Carga diferida al hacer scroll (sustituye click manual en "Mostrar más")
let _infScrollObserver = null;
function _infSetupInfiniteScroll(hasMore) {
  const sentinel = document.getElementById('infScrollSentinel');
  if(!sentinel) return;
  if(_infScrollObserver) { _infScrollObserver.disconnect(); _infScrollObserver = null; }
  if(!hasMore) return;
  _infScrollObserver = new IntersectionObserver(entries => {
    if(entries.some(e => e.isIntersecting)) _infShowMore();
  }, { rootMargin: '600px' });
  _infScrollObserver.observe(sentinel);
}

function renderInfluencers() {
  const grid = document.getElementById('infGrid');
  if (!grid) return;
  // Skeletons mientras Firestore no ha respondido
  if(!_cache._creatorsLoaded && !_cache.creators.length && !_cache.campaigns.length) {
    grid.innerHTML = Array(8).fill(_INF_SKELETON).join('');
    return;
  }
  const all = getAllInfluencers();
  _infFillFilterOptions(all);
  const _deacc = s => String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
  const q = _deacc(document.getElementById('infSearch')?.value);
  const fCat = document.getElementById('infFilterCategoria')?.value || '';
  const fTier = document.getElementById('infFilterTier')?.value || '';
  const fPlat = document.getElementById('infFilterPlat')?.value || '';
  const sort = document.getElementById('infSort')?.value || 'nombre';
  let infs = all;
  if (q) infs = infs.filter(inf =>
    _deacc(inf.name).includes(q) ||
    _deacc(inf.handle).includes(q) ||
    _deacc(inf.categoria).includes(q) ||
    (inf.keywords||[]).some(k => _deacc(k).includes(q)));
  if (fCat) infs = infs.filter(i => i.categoria === fCat);
  if (fTier) infs = infs.filter(i => i.tier === fTier);
  if (fPlat) infs = infs.filter(i => (i.platforms||[]).includes(fPlat));
  if (sort === 'seguidores') infs = [...infs].sort((a,b)=>(b.seguidoresTotal||0)-(a.seguidoresTotal||0));
  else if (sort === 'rating') infs = [...infs].sort((a,b)=>avgStars(infRatingsFor(b.key))-avgStars(infRatingsFor(a.key)));
  else if (sort === 'campanas') infs = [...infs].sort((a,b)=>{
    const mc = i => (i.campaigns||[]).length + (((i.master||{}).manualCampaigns)||[]).length;
    return mc(b)-mc(a);
  });
  const counter = document.getElementById('infCount');
  if(counter) counter.textContent = `${infs.length} de ${all.length} creadores`;
  if (!infs.length) {
    const filtered = (q||fCat||fTier||fPlat);
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">
      <p>${filtered ? 'Sin resultados con esos filtros.' : 'Agrega influencers a tus campañas para verlos aquí.'}</p>
      ${filtered ? '<button class="btn btn-ghost btn-sm" style="margin-top:10px;" onclick="_infClearFilters()">Limpiar filtros</button>' : ''}
    </div>`;
    _infSetupInfiniteScroll(false);
    return;
  }
  const visible = infs.slice(0, _infShowLimit);
  const hasMore = infs.length > _infShowLimit;
  const moreBtn = hasMore
    ? `<div style="grid-column:1/-1;text-align:center;padding:8px 0 20px;"><button class="btn btn-ghost" onclick="_infShowMore()">Mostrar más (${infs.length - _infShowLimit} restantes)</button></div>`
    : '';
  // Primer render anima con stagger; filtros/búsqueda/paginar ya no re-animan
  if(!grid._animatedOnce) { grid._animatedOnce = true; setTimeout(()=>grid.classList.add('no-reanim'), 700); }
  grid.innerHTML = visible.map(inf => {
    const ratings = infRatingsFor(inf.key);
    const avg = avgStars(ratings);
    const campList = inf.campaigns.slice(0,3).map(c => `<span style="font-size:11px;padding:2px 7px;border-radius:12px;background:var(--bg);color:var(--text-muted);border:1px solid var(--border);">${_esc(c.name)}</span>`).join(' ')
      + (inf.campaigns.length>3 ? ` <span style="font-size:11px;color:var(--text-muted);">+${inf.campaigns.length-3}</span>` : '');
    const kw = (inf.keywords||[]).slice(0,4).map(k=>`<span style="font-size:10px;padding:1px 6px;border-radius:8px;background:var(--pink-pale);color:var(--pink);">${_esc(k)}</span>`).join(' ');
    const segTxt = inf.seguidoresTotal ? `<span style="font-size:11px;color:var(--text-muted);font-weight:700;">${formatNum(inf.seguidoresTotal)} seg.</span>` : '';
    return `<div class="campaign-card" data-tilt onclick="openInfluencerDetail('${inf.key}')" style="cursor:pointer;position:relative;">
      <input type="checkbox" class="inf-compare-check" title="Comparar" ${_infCompareSet.has(inf.key)?'checked':''} onclick="event.stopPropagation();toggleInfCompare('${inf.key}',this)">
      <div class="campaign-card-header">
        <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;">
          <div class="inf-avatar" style="width:40px;height:40px;font-size:15px;flex-shrink:0;">${(inf.name||'?')[0].toUpperCase()}</div>
          <div style="min-width:0;">
            <div class="campaign-name" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">${_esc(inf.name)} ${_tierBadge(inf.tier)}</div>
            <div class="campaign-client" style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">${inf.handle ? '<span style="color:var(--text-muted);font-size:11px;">@'+inf.handle+'</span>' : ''} ${(inf.platforms&&inf.platforms.length)?platformBadges(inf.platforms):(inf.platform?platformBadge(inf.platform):'')} ${segTxt}</div>
          </div>
        </div>
      </div>
      ${inf.categoria || kw ? `<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px;align-items:center;">
        ${inf.categoria?`<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;background:var(--bg);color:var(--text);border:1px solid var(--border);">${_esc(inf.categoria)}</span>`:''} ${kw}
      </div>`:''}
      <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px;">${campList || '<span style="font-size:11px;color:var(--text-muted);">Sin campañas aún</span>'}</div>
      <div style="margin-top:10px;display:flex;align-items:center;gap:6px;">
        <span>${starsHtml(avg, 'sm')}</span>
        ${ratings.length ? `<span style="font-size:11px;color:var(--text-muted);">${avg.toFixed(1)} (${ratings.length})</span>` : `<span style="font-size:11px;color:var(--text-muted);">Sin calificaciones</span>`}
      </div>
    </div>`;
  }).join('') + moreBtn;
  _infSetupInfiniteScroll(hasMore);
}

// ---- Comparar creadores ----
const _infCompareSet = new Set();
function toggleInfCompare(key, el) {
  if(_infCompareSet.has(key)) _infCompareSet.delete(key);
  else {
    if(_infCompareSet.size >= 3) { showToast('Máximo 3 creadores a comparar','error'); if(el) el.checked = false; return; }
    _infCompareSet.add(key);
  }
  _updateInfCompareBar();
}
function _updateInfCompareBar() {
  const bar = document.getElementById('infCompareBar');
  if(!bar) return;
  const n = _infCompareSet.size;
  document.getElementById('infCompareCount').textContent = n === 1 ? '1 creador' : `${n} creadores`;
  bar.classList.toggle('show', n >= 1);
}
function clearInfCompare() {
  _infCompareSet.clear();
  _updateInfCompareBar();
  document.querySelectorAll('.inf-compare-check').forEach(c => c.checked = false);
}
function openInfCompare() {
  if(_infCompareSet.size < 2) { showToast('Selecciona al menos 2 creadores','error'); return; }
  const infs = getAllInfluencers().filter(i => _infCompareSet.has(i.key));
  const fmtMoney = n => '$' + (Number(n)||0).toLocaleString('es-MX');
  const row = (label, cells) => `<tr><td style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;white-space:nowrap;">${label}</td>${cells.map(c=>`<td style="vertical-align:top;">${c}</td>`).join('')}</tr>`;
  const cols = infs.map(inf => {
    const m = inf.master || _creatorByKey(inf.key) || {};
    const hist = m.historyMaster ? _creatorAllHistory(m) : [];
    const ers = hist.filter(h=>h.er>0).map(h=>h.er);
    const erAvg = ers.length ? (ers.reduce((a,b)=>a+b,0)/ers.length) : 0;
    const lastRate = hist.find(h=>h.costoUnitario>0);
    const ratings = infRatingsFor(inf.key);
    return {
      inf, m,
      header: `<div style="display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;">
        <div class="inf-avatar" style="width:48px;height:48px;font-size:18px;">${(inf.name||'?')[0].toUpperCase()}</div>
        <div style="font-weight:800;font-size:14px;">${_esc(inf.name)}</div>
        <div>${_tierBadge(inf.tier)}</div>
      </div>`,
      categoria: inf.categoria ? `<span style="font-size:11px;font-weight:700;">${_esc(inf.categoria)}</span>` : '—',
      seguidores: Object.entries(m.platforms||{}).map(([p,d])=>`<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">${platformBadge(p)}<b style="font-size:12px;">${d.seguidores?formatNum(d.seguidores):'—'}</b></div>`).join('') || '—',
      er: erAvg ? (erAvg*100).toFixed(2)+'%' : '—',
      tarifa: lastRate ? `<div style="font-weight:800;">${fmtMoney(lastRate.costoUnitario)}</div><div style="font-size:10px;color:var(--text-muted);">${_esc(lastRate.contenido||lastRate.plataforma||'')} · ${_esc(lastRate.mes||'')}</div>` : '—',
      rating: ratings.length ? `${starsHtml(avgStars(ratings),'sm')} <span style="font-size:11px;color:var(--text-muted);">(${ratings.length})</span>` : '—',
      campanas: String((inf.campaigns||[]).length + ((m.manualCampaigns)||[]).length),
      keywords: (inf.keywords||[]).slice(0,6).map(k=>`<span style="font-size:10px;padding:1px 6px;border-radius:8px;background:var(--pink-pale);color:var(--pink);display:inline-block;margin:1px;">${_esc(k)}</span>`).join('') || '—',
    };
  });
  document.getElementById('infCompareContent').innerHTML = `
    <div class="table-wrap" style="overflow-x:auto;">
      <table class="table" style="font-size:12px;min-width:${220*infs.length+120}px;">
        <thead><tr><th></th>${cols.map(c=>`<th>${c.header}</th>`).join('')}</tr></thead>
        <tbody>
          ${row('Categoría', cols.map(c=>c.categoria))}
          ${row('Seguidores', cols.map(c=>c.seguidores))}
          ${row('ER promedio', cols.map(c=>c.er))}
          ${row('Última tarifa', cols.map(c=>c.tarifa))}
          ${row('Rating', cols.map(c=>c.rating))}
          ${row('Campañas', cols.map(c=>c.campanas))}
          ${row('Keywords', cols.map(c=>c.keywords))}
        </tbody>
      </table>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px;">
      ${cols.map(c=>`<button class="btn btn-ghost btn-sm" onclick="closeModal('infCompareModal');openInfluencerDetail('${c.inf.key}')">Ver ${_esc(c.inf.name.split(' ')[0])}</button>`).join('')}
    </div>`;
  openModal('infCompareModal');
}

let _infDetailKey = null;
let _infDetailStars = 0;

function openInfluencerDetail(key) {
  _infDetailKey = key;
  _infDetailStars = 0;
  const infs = getAllInfluencers();
  const inf = infs.find(x => x.key === key);
  if (!inf) return;
  document.getElementById('infDetailName').textContent = inf.name;
  document.getElementById('infDetailHandle').innerHTML = (inf.handle ? '<span style="color:var(--text-muted);margin-right:6px;">@'+inf.handle+'</span>' : '') + ((inf.platforms&&inf.platforms.length)?platformBadges(inf.platforms):(inf.platform?platformBadge(inf.platform):''));
  // Abrir el modal de inmediato (la animación corre fluida) y pintar el
  // contenido pesado al siguiente frame — la apertura ya no se traba.
  document.getElementById('infDetailContent').innerHTML =
    `<div style="display:flex;flex-direction:column;gap:12px;padding:8px 0;">
      <div class="skel" style="height:90px;border-radius:14px;"></div>
      <div class="skel" style="height:14px;width:50%;"></div>
      <div class="skel" style="height:120px;border-radius:14px;"></div>
    </div>`;
  openModal('infDetailModal');
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if(_infDetailKey !== key) return;
    renderInfluencerDetailContent(inf);
  }));
}

// In-memory cache of private creator info, keyed by infKey
const _creatorPrivateCache = new Map();
async function _loadInfluencerPrivateInfo(key) {
  if(_creatorPrivateCache.has(key)) return _creatorPrivateCache.get(key);
  try {
    const doc = await db.collection('workspaces').doc(WORKSPACE)
      .collection('creatorPrivateInfo').doc(key).get();
    const data = doc.exists ? doc.data() : null;
    _creatorPrivateCache.set(key, data);
    return data;
  } catch(e) { console.warn('private info load failed', e.message); return null; }
}
async function saveInfluencerPrivateInfo(key) {
  if(!canSeeCreatorPrivateInfo()) { showToast('Sin permisos','error'); return; }
  const telefono = (document.getElementById('infPrivPhone')?.value||'').trim();
  const agencia  = (document.getElementById('infPrivAgency')?.value||'').trim();
  const email    = (document.getElementById('infPrivEmail')?.value||'').trim();
  const notas    = (document.getElementById('infPrivNotes')?.value||'').trim();
  const data = {
    telefono, agencia, email, notas,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedBy: currentUser?.uid || ''
  };
  try {
    await db.collection('workspaces').doc(WORKSPACE)
      .collection('creatorPrivateInfo').doc(key).set(data, {merge:true});
    _creatorPrivateCache.set(key, {...data, updatedAt: new Date()});
    showToast('Datos guardados','success'); try { showSuccessCheck(); } catch(e){}
  } catch(e) {
    showToast('Error: '+e.message,'error');
  }
}
let _infDetailReqId = 0;
async function _hydrateInfluencerPrivateInfo(key) {
  const reqId = ++_infDetailReqId;
  const IDS = ['infPrivPhone','infPrivAgency','infPrivEmail','infPrivNotes'];
  // Mientras llega Firestore: inputs deshabilitados con "Cargando…"
  const pending = !_creatorPrivateCache.has(key);
  if(pending) IDS.forEach(id => { const el=document.getElementById(id); if(el){ el.disabled=true; el.dataset.ph=el.placeholder; el.placeholder='Cargando…'; } });
  const data = await _loadInfluencerPrivateInfo(key);
  // Drop response if the user already opened a different creator
  if(_infDetailKey !== key || reqId !== _infDetailReqId) return;
  IDS.forEach(id => { const el=document.getElementById(id); if(el){ el.disabled=false; if(el.dataset.ph!==undefined){ el.placeholder=el.dataset.ph; delete el.dataset.ph; } } });
  const inp = (id, v) => { const el=document.getElementById(id); if(el) el.value = v||''; };
  inp('infPrivPhone',  data?.telefono);
  inp('infPrivAgency', data?.agencia);
  inp('infPrivEmail',  data?.email);
  inp('infPrivNotes',  data?.notas);
}

function _influencerHistory(inf) {
  const norm = s => String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[_\s@.]+/g,' ').trim();
  const target = norm(inf.name);
  const acc = { reach:0, views:0, interactions:0, contenidos:0, byPlatform:{}, perCampaign:[] };
  (_cache.campaigns||[]).forEach(c => {
    let r=0, it=0, ct=0, vw=0;
    (c.influencers||[]).forEach(row => {
      if(norm(row.name) !== target) return;
      r += Number(row.reach)||0;
      it += Number(row.interactions)||0;
      ct += Number(row.contenidos)||0;
      if(row.platform) { const p=_normalizePlatform(row.platform)||row.platform; acc.byPlatform[p]=(acc.byPlatform[p]||0)+(Number(row.reach)||0); }
    });
    // Real views/engagement from the campaign's loaded metrics sheet (cachedMetrics)
    try {
      const real = _escenarioRealMetricsByCreator(c);
      for(const [k,v] of real) { if(k===target || (k.length>=4&&target.length>=4&&(k.includes(target)||target.includes(k)))) { vw += v.views||0; if(v.engagement>it) it = v.engagement; break; } }
    } catch(e){}
    if(r||it||ct||vw) acc.perCampaign.push({ name:c.name, reach:r, views:vw, interactions:it, contenidos:ct });
    acc.reach+=r; acc.views+=vw; acc.interactions+=it; acc.contenidos+=ct;
  });
  acc.campaignsCount = acc.perCampaign.length;
  acc.bestPlatform = Object.entries(acc.byPlatform).sort((a,b)=>b[1]-a[1])[0];
  return acc;
}

function renderInfluencerDetailContent(inf) {
  const ratings = infRatingsFor(inf.key);
  const avg = avgStars(ratings);
  const myRating = currentUser ? ratings.find(r => r.userId === currentUser.uid) : null;
  const hist = _influencerHistory(inf);
  const fmtH = n => (Number(n)||0).toLocaleString('es-MX');
  const histHtml = (hist.reach||hist.views||hist.interactions||hist.contenidos) ? `
    <div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px;">Histórico de rendimiento</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:10px;margin-bottom:14px;">
      <div style="background:var(--bg);border-radius:12px;padding:10px 12px;"><div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Campañas</div><div style="font-size:22px;font-weight:800;">${hist.campaignsCount}</div></div>
      <div style="background:var(--bg);border-radius:12px;padding:10px 12px;"><div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Views</div><div style="font-size:22px;font-weight:800;">${fmtH(hist.views)}</div></div>
      <div style="background:var(--bg);border-radius:12px;padding:10px 12px;"><div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Alcance</div><div style="font-size:22px;font-weight:800;">${fmtH(hist.reach)}</div></div>
      <div style="background:var(--bg);border-radius:12px;padding:10px 12px;"><div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Interacciones</div><div style="font-size:22px;font-weight:800;">${fmtH(hist.interactions)}</div></div>
      <div style="background:var(--bg);border-radius:12px;padding:10px 12px;"><div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Contenidos</div><div style="font-size:22px;font-weight:800;">${fmtH(hist.contenidos)}</div></div>
    </div>
    ${hist.bestPlatform ? `<div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">🏅 Mejor plataforma por alcance: <strong style="color:var(--text);">${_esc(hist.bestPlatform[0])}</strong> (${fmtH(hist.bestPlatform[1])})</div>`:''}
    ${hist.perCampaign.length>1 ? `<div class="table-wrap" style="margin-bottom:18px;"><table class="table" style="font-size:12px;"><thead><tr><th>Campaña</th><th style="text-align:right;">Views</th><th style="text-align:right;">Alcance</th><th style="text-align:right;">Interac.</th><th style="text-align:right;">Contenidos</th></tr></thead><tbody>${hist.perCampaign.map(p=>`<tr><td>${_esc(p.name)}</td><td style="text-align:right;">${fmtH(p.views)}</td><td style="text-align:right;">${fmtH(p.reach)}</td><td style="text-align:right;">${fmtH(p.interactions)}</td><td style="text-align:right;">${fmtH(p.contenidos)}</td></tr>`).join('')}</tbody></table></div>`:''}`
    : '';

  const campRows = inf.campaigns.map(c => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);">
      <div>
        <div style="font-size:13px;font-weight:600;">${_esc(c.name)}</div>
        <div style="font-size:11px;color:var(--text-muted);">${_esc(c.client)}</div>
      </div>
      <span class="badge ${statusBadgeClass(c.status)}">${c.status}</span>
    </div>`).join('');

  // Campañas agregadas a mano al perfil (historial fuera de la plataforma
  // o campañas donde el creador no quedó registrado en los datos)
  const m = inf.master || _creatorByKey(inf.key);
  const manualCamps = (m && m.manualCampaigns) || [];
  const manualRows = manualCamps.map(mc => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);">
      <div>
        <div style="font-size:13px;font-weight:600;">${_esc(mc.name)}</div>
        <div style="font-size:11px;color:var(--text-muted);">${_esc(mc.client||'')}${mc.mes?(mc.client?' · ':'')+_esc(mc.mes):''}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <span class="badge badge-gray" title="Agregada manualmente al perfil">📌 historial</span>
        <button onclick="removeManualCampaign('${inf.key}','${mc.id}')" title="Quitar del perfil" style="background:none;border:none;color:var(--red,#e5484d);cursor:pointer;font-size:13px;padding:2px;">✕</button>
      </div>
    </div>`).join('');

  // Form pa vincular campaña: precargadas (que aún no estén en el perfil) o manual
  const linkedIds = new Set([...inf.campaigns.map(c=>c.id), ...manualCamps.map(mc=>mc.campaignId).filter(Boolean)]);
  const linkedNames = new Set([...inf.campaigns.map(c=>c.name.toLowerCase()), ...manualCamps.map(mc=>String(mc.name||'').toLowerCase())]);
  const availCamps = (_cache.campaigns||[]).filter(c => !linkedIds.has(c.id) && !linkedNames.has(String(c.name||'').toLowerCase()));
  const addCampForm = `
    <div style="margin-top:10px;padding:12px;background:var(--bg);border-radius:12px;">
      <div style="font-size:11px;font-weight:700;color:var(--text-muted);margin-bottom:8px;">+ Agregar campaña al perfil</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
        <select id="infCampSelect" class="form-input" style="flex:1;min-width:170px;font-size:12px;" onchange="_infCampSelChange(this)">
          <option value="">Elegir campaña existente...</option>
          ${availCamps.map(c=>`<option value="${c.id}">${_esc(c.name)}${c.client?' · '+_esc(c.client):''}</option>`).join('')}
          <option value="__manual">✎ Escribir una manualmente</option>
        </select>
        <button class="btn btn-pink btn-sm" onclick="addManualCampaignToCreator('${inf.key}')">Agregar</button>
      </div>
      <div id="infCampManualFields" style="display:none;margin-top:8px;gap:8px;flex-wrap:wrap;">
        <input id="infCampManualName" class="form-input" style="flex:2;min-width:140px;font-size:12px;" placeholder="Nombre de la campaña">
        <input id="infCampManualClient" class="form-input" style="flex:1;min-width:100px;font-size:12px;" placeholder="Cliente / marca">
        <input id="infCampManualMes" type="month" class="form-input" style="flex:1;min-width:120px;font-size:12px;">
      </div>
    </div>`;

  const ratingCards = ratings.length ? ratings.map(r => `
    <div class="rating-card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="width:28px;height:28px;border-radius:50%;background:var(--pink);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">${(r.userName||'?')[0].toUpperCase()}</div>
          <span style="font-size:13px;font-weight:600;">${r.userName||'Usuario'}</span>
          ${r.campaignName ? `<span style="font-size:11px;color:var(--text-muted);">${r.campaignName}</span>` : ''}
        </div>
        <span style="font-size:12px;">${starsHtml(r.stars,'sm')}</span>
      </div>
      ${r.comment ? `<div style="font-size:12px;color:var(--text-muted);padding:6px 10px;background:var(--bg);border-radius:8px;margin-top:4px;">${r.comment}</div>` : ''}
      <div style="font-size:10px;color:var(--text-muted);margin-top:4px;">${r.date ? new Date(r.date).toLocaleDateString('es-MX') : ''}</div>
    </div>`).join('')
  : '<p style="font-size:13px;color:var(--text-muted);">Sin calificaciones aún.</p>';

  const starSelector = [1,2,3,4,5].map(i =>
    `<span class="star" id="infStar${i}" onclick="selectStar(${i})" style="font-size:28px;cursor:pointer;color:${myRating && i<=myRating.stars ? '#f5a623' : '#ddd'};">★</span>`
  ).join('');

  // Perfil del master (base de talento) — `m` ya declarado arriba
  let masterHtml = '';
  if(m) {
    const platRows = Object.entries(m.platforms||{}).map(([p,d]) => `
      <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);">
        ${platformBadge(p)}
        <span style="font-size:12px;font-weight:700;">${d.seguidores?formatNum(d.seguidores)+' seguidores':''}</span>
        <div style="flex:1;"></div>
        ${d.link?`<a href="${_esc(d.link)}" target="_blank" rel="noopener" onclick="event.stopPropagation();" style="font-size:11px;color:var(--pink);font-weight:700;">Ver perfil ↗</a>`:''}
      </div>`).join('');
    const aud = m.audiencia||{};
    const audCell = (label, raw) => raw ? `<div style="background:var(--bg);border-radius:10px;padding:8px 10px;"><div style="font-size:9px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;">${label}</div><div style="font-size:11px;white-space:pre-line;line-height:1.5;">${_esc(raw)}</div></div>` : '';
    const hist = _creatorAllHistory(m);
    const rateRows = hist.filter(h=>h.costoUnitario>0).slice(0,8).map(h=>`
      <tr>
        <td style="white-space:nowrap;color:var(--text-muted);">${_esc(h.mes||'—')}</td>
        <td style="max-width:160px;"><div style="font-weight:600;">${_esc(h.marca||'—')}</div>${h.campana?`<div style="font-size:10px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px;">${_esc(h.campana)}</div>`:''}</td>
        <td style="white-space:nowrap;">${h.plataforma?platformBadge(h.plataforma):''}${h.contenido?`<div style="font-size:10px;color:var(--text-muted);margin-top:2px;">${_esc(h.contenido)}</div>`:''}</td>
        <td style="text-align:right;font-weight:700;white-space:nowrap;">$${(h.costoUnitario||0).toLocaleString('es-MX')}</td>
        <td style="text-align:right;white-space:nowrap;color:var(--text-muted);">${h.viewsXPost?formatNum(h.viewsXPost):'—'}</td>
      </tr>`).join('');
    masterHtml = `
    <div class="inf-master-card">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
        <span style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.8px;">📇 Perfil · Base de talento</span>
        <div style="flex:1;"></div>
        ${m.categoria?`<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;background:var(--bg);border:1px solid var(--border);">${_esc(m.categoria)}</span>`:''}
        ${_tierBadge(m.tier)}
      </div>
      ${(m.keywords&&m.keywords.length)?`<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px;">${m.keywords.map(k=>`<span style="font-size:10px;padding:2px 8px;border-radius:10px;background:var(--pink-pale);color:var(--pink);">${_esc(k)}</span>`).join('')}</div>`:''}
      ${platRows}
      ${(aud.paises||aud.edades||aud.genero||aud.ciudades)?`
      <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin:12px 0 8px;">Audiencia</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;">
        ${audCell('País', aud.paises)}${audCell('Ciudades', aud.ciudades)}${audCell('Edades', aud.edades)}${audCell('Género', aud.genero)}
      </div>`:''}
      ${rateRows?`
      <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin:14px 0 8px;">💰 Historial de tarifas (más reciente primero)</div>
      <div class="inf-rates-wrap"><table class="table" style="font-size:11px;"><thead><tr><th>Mes</th><th>Marca / Campaña</th><th>Plataforma</th><th style="text-align:right;">Costo unit.</th><th style="text-align:right;">Views x post</th></tr></thead><tbody>${rateRows}</tbody></table></div>`:''}
    </div>`;
  }

  document.getElementById('infDetailContent').innerHTML = `
    ${masterHtml}
    <!-- Avg rating -->
    ${ratings.length ? `
    <div style="display:flex;align-items:center;gap:12px;padding:16px;background:var(--bg);border-radius:14px;margin-bottom:20px;">
      <div style="font-size:40px;font-weight:700;line-height:1;color:var(--text);">${avg.toFixed(1)}</div>
      <div>
        <div>${starsHtml(avg,'')}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">${ratings.length} calificación${ratings.length!==1?'es':''}</div>
      </div>
    </div>` : ''}

    ${histHtml}

    <!-- Campaigns -->
    <div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px;">Campañas</div>
    <div style="margin-bottom:20px;">
      ${(campRows + manualRows) || '<p style="font-size:13px;color:var(--text-muted);">Sin campañas registradas.</p>'}
      ${addCampForm}
    </div>

    <!-- Ratings list -->
    <div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px;">Calificaciones</div>
    <div style="margin-bottom:24px;">${ratingCards}</div>

    <!-- Leave rating -->
    <div style="background:var(--pink-pale);border-radius:14px;padding:18px;">
      <div style="font-size:13px;font-weight:700;margin-bottom:10px;">${myRating ? 'Tu calificación' : 'Dejar calificación'}</div>
      <div style="margin-bottom:12px;">${starSelector}</div>
      <textarea id="infRatingComment" class="form-input" rows="2" style="font-size:13px;margin-bottom:10px;" placeholder="Comentario (opcional)...">${myRating ? myRating.comment||'' : ''}</textarea>
      <button class="btn btn-pink btn-sm" onclick="submitInfluencerRating('${inf.key}')">${myRating ? 'Actualizar calificación' : 'Guardar calificación'}</button>
    </div>

    <!-- Datos privados (Operaciones) -->
    <div style="margin-top:24px;border:1.5px solid var(--border);border-radius:14px;padding:16px 18px;background:var(--bg);">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
        <span style="font-size:14px;">🔒</span>
        <h4 style="font-size:13px;font-weight:700;margin:0;text-transform:uppercase;letter-spacing:.5px;">Datos privados · Operaciones</h4>
      </div>
      ${canSeeCreatorPrivateInfo() ? `
        <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
          <div class="form-group" style="margin:0;">
            <label class="form-label" style="font-size:11px;">Teléfono</label>
            <input type="tel" id="infPrivPhone" class="form-input" placeholder="+52 55 1234 5678">
          </div>
          <div class="form-group" style="margin:0;">
            <label class="form-label" style="font-size:11px;">Agencia</label>
            <input type="text" id="infPrivAgency" class="form-input" placeholder="Ej: Talent Hub">
          </div>
        </div>
        <div class="form-group" style="margin-bottom:10px;">
          <label class="form-label" style="font-size:11px;">Email de contacto</label>
          <input type="email" id="infPrivEmail" class="form-input" placeholder="manager@agencia.com">
        </div>
        <div class="form-group" style="margin-bottom:12px;">
          <label class="form-label" style="font-size:11px;">Notas operativas</label>
          <textarea id="infPrivNotes" class="form-input" rows="2" placeholder="Disponibilidad, condiciones, contexto..."></textarea>
        </div>
        <button class="btn btn-pink btn-sm" onclick="saveInfluencerPrivateInfo('${inf.key}')">Guardar datos privados</button>
        <div style="font-size:10px;color:var(--text-muted);margin-top:8px;">Solo el equipo de Operaciones (y Admin) ve esta sección.</div>
      ` : `
        <div style="display:flex;align-items:center;gap:10px;padding:12px;background:var(--white);border-radius:10px;border:1px dashed var(--border);">
          <span style="font-size:20px;opacity:.5;">🔐</span>
          <div>
            <div style="font-size:13px;font-weight:600;">Restringido a Operaciones</div>
            <div style="font-size:11px;color:var(--text-muted);">Teléfono, agencia y datos de contacto solo visibles para el área de Operaciones.</div>
          </div>
        </div>
      `}
    </div>`;

  // Hydrate the inputs from Firestore after the DOM is in place
  if(canSeeCreatorPrivateInfo()) {
    try { _hydrateInfluencerPrivateInfo(inf.key); } catch(e){}
  }
}

// ---- Campañas manuales en el perfil del creador ----
function _infCampSelChange(sel) {
  const fields = document.getElementById('infCampManualFields');
  if(fields) fields.style.display = sel.value === '__manual' ? 'flex' : 'none';
}

async function _persistManualCampaigns(key, name, list) {
  await db.collection('workspaces').doc(WORKSPACE).collection('creators').doc(key)
    .set({ key, name, manualCampaigns: list, updatedAt: Date.now() }, { merge:true });
  // Refleja en cache local de inmediato (el snapshot llega después)
  let cr = _creatorByKey(key);
  if(cr) cr.manualCampaigns = list;
  else _cache.creators.push({ key, name, manualCampaigns: list, platforms:{}, historyMaster:[] });
  _invalidateInfMemo();
}

async function addManualCampaignToCreator(key) {
  const inf = getAllInfluencers().find(x => x.key === key);
  if(!inf) return;
  const sel = document.getElementById('infCampSelect');
  const val = sel?.value || '';
  if(!val) { showToast('Elige una campaña o escribe una manual','error'); return; }
  let entry;
  if(val === '__manual') {
    const name = (document.getElementById('infCampManualName')?.value||'').trim();
    if(!name) { showToast('Escribe el nombre de la campaña','error'); return; }
    entry = {
      id: id(),
      name,
      client: (document.getElementById('infCampManualClient')?.value||'').trim(),
      mes: (document.getElementById('infCampManualMes')?.value||'').trim(),
    };
  } else {
    const c = (_cache.campaigns||[]).find(x => x.id === val);
    if(!c) { showToast('Campaña no encontrada','error'); return; }
    entry = { id: id(), campaignId: c.id, name: c.name||'', client: c.client||'', mes: '' };
  }
  const list = [ ...((_creatorByKey(key)||{}).manualCampaigns||[]), entry ];
  try {
    await _persistManualCampaigns(key, inf.name, list);
    showToast('Campaña agregada al perfil','success');
    const updated = getAllInfluencers().find(x => x.key === key);
    if(updated && _infDetailKey === key) renderInfluencerDetailContent(updated);
  } catch(e) { showToast('Error: '+e.message,'error'); }
}

async function removeManualCampaign(key, entryId) {
  const cr = _creatorByKey(key);
  if(!cr) return;
  const removed = (cr.manualCampaigns||[]).find(mc => mc.id === entryId);
  const list = (cr.manualCampaigns||[]).filter(mc => mc.id !== entryId);
  const rerender = () => {
    const updated = getAllInfluencers().find(x => x.key === key);
    if(updated && _infDetailKey === key) renderInfluencerDetailContent(updated);
  };
  try {
    await _persistManualCampaigns(key, cr.name, list);
    rerender();
    showToast('Campaña quitada del perfil','success', removed ? { label:'Deshacer', fn: async () => {
      await _persistManualCampaigns(key, cr.name, [...list, removed]);
      rerender();
    }} : undefined);
  } catch(e) { showToast('Error: '+e.message,'error'); }
}

function selectStar(n) {
  _infDetailStars = n;
  for(let i=1;i<=5;i++) {
    const el = document.getElementById('infStar'+i);
    if(el) el.style.color = i<=n ? '#f5a623' : '#ddd';
  }
}

async function submitInfluencerRating(key) {
  if (!_infDetailStars) { showToast('Selecciona una calificación de 1 a 5 estrellas','error'); return; }
  if (!currentUser) { showToast('Debes iniciar sesión','error'); return; }
  const comment = (document.getElementById('infRatingComment')?.value||'').trim();
  const infs = getAllInfluencers();
  const inf = infs.find(x=>x.key===key);
  const campaignName = inf?.campaigns?.[0]?.name || '';
  const rating = {
    influencerKey: key,
    userId: currentUser.uid,
    userName: currentUserProfile?.name || currentUser.email?.split('@')[0] || 'Usuario',
    stars: _infDetailStars,
    comment,
    campaignName,
    date: new Date().toISOString()
  };
  try {
    const docId = key + '_' + currentUser.uid;
    await db.collection('workspaces').doc(WORKSPACE).collection('influencerRatings').doc(docId).set(rating);
    showToast('Calificación guardada','success');
    // Refresh detail
    _infDetailStars = 0;
    const updatedInf = getAllInfluencers().find(x=>x.key===key);
    if(updatedInf) renderInfluencerDetailContent(updatedInf);
  } catch(e) {
    showToast('Error al guardar: '+e.message,'error');
  }
}

