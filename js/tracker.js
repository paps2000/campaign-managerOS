/* Campaign OS — Master tracker
   ==============
   Bajar el sheet, normalizar sus columnas (cada equipo lo arma a su manera),
   parsear las fechas en los seis formatos que aparecen en la vida real, y
   pintar la tabla con sus filtros.

   Es la fuente que más vistas alimenta —Resumen, Calendario, Coherencia— así
   que sus parsers son lo que más se rompe en silencio: hay pruebas en
   test/parsers.test.js y conviene ampliarlas antes que tocar las heurísticas.
   Script CLÁSICO a propósito (NO type="module"): el HTML llama estas funciones
   desde atributos onclick/onchange, que sólo resuelven contra el scope global,
   y todos los archivos de js/ comparten ese mismo scope. El orden de <script>
   en index.html es el orden real de ejecución. */

function trackerStatusBadge(s) {
  if(!s) return '<span style="color:var(--text-muted);">—</span>';
  const sl = s.toLowerCase().replace(/[()]/g,'').trim();
  const map = [
    [['publicado'],                          '#166534','#fff'],
    [['por publicar'],                       '#fca5a5','#991b1b'],
    [['aprobado'],                           '#bbf7d0','#166534'],
    [['revisión int','revision int','rev int','revisión (int','revision (int'], '#fef08a','#854d0e'],
    [['revisión ext','revision ext','rev ext','revisión (ext','revision (ext'], '#fde047','#713f12'],
    [['pendiente'],                          '#991b1b','#fff'],
    [['en grabación','en grabacion','grabación','grabacion'], '#ede9fe','#5b21b6'],
    [['corrigiendo'],                        '#78350f','#fff'],
    [['trabajando guión','trabajando guion','trab. guión'], '#f3e8ff','#7c3aed'],
  ];
  for(const [keys,bg,col] of map) {
    if(keys.some(k => sl.includes(k) || k.includes(sl))) {
      return `<span style="font-size:11px;padding:2px 8px;border-radius:10px;background:${bg};color:${col};font-weight:600;white-space:nowrap;display:inline-block;">${_esc(s)}</span>`;
    }
  }
  return `<span style="font-size:11px;padding:2px 8px;border-radius:10px;background:rgba(0,0,0,.07);color:var(--text);font-weight:600;white-space:nowrap;display:inline-block;">${_esc(s)}</span>`;
}

function setTrackerBatchFilter(batch, btn) {
  _trackerBatchFilter = batch;
  document.querySelectorAll('#trackerBatchPills .metrics-tab-pill').forEach(b=>b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  _renderTrackerSummaryAndTable();
}

function filterTrackerByStatus(field, value) {
  _trackerStatusFilter = {field, value};
  _renderTrackerSummaryAndTable();
}

function clearTrackerFilter() {
  _trackerStatusFilter = null;
  _renderTrackerSummaryAndTable();
}

function saveTrackerConfig() {
  if(!currentCampaignId) return;
  const campaigns = getData('campaigns');
  const c = campaigns.find(x=>x.id===currentCampaignId);
  if(!c) return;
  const aonTab = document.getElementById('trackerAonTab')?.value?.trim()||'';
  const nanoTab = document.getElementById('trackerNanoTab')?.value?.trim()||'';
  c.trackerAonTab = aonTab;
  c.trackerNanoTab = nanoTab;
  guardarCampana(c);
}

function _startTrackerAutoRefresh(campaign) {
  if(_trackerAutoRefreshTimer) clearInterval(_trackerAutoRefreshTimer);
  _trackerAutoRefreshTimer = setInterval(() => {
    if(currentCampaignId === campaign.id && document.getElementById('tab-tracker')?.classList.contains('active')) {
      _autoFetchTracker(campaign.trackerSheetUrl, campaign, {silent:true});
    }
  }, 2 * 60 * 60 * 1000); // 2 hours
}

// Column-key aliases: covers Rexona Men Calendar 2026 + older master trackers
// + trackers tipo Podcastverse (TALENTO / PUBLICADO ✅ / CAMPAÑA como línea).
const TRACKER_NAME_KEYS = ['NOMBRE','Nombre','TALENTO','Talento','CREADOR','Creador','INFLUENCER','Influencer','PERFIL','Perfil','CUENTA','Cuenta','PODCAST','Podcast'];
// Orden importa: estatus explícito de contenido primero; PUBLICADO (col de
// checks ✅/⚠️) al final como fallback.
const TRACKER_STATUS_KEYS = ['ESTATUS CONTENIDO','Estatus Contenido','ESTATUS','Estatus','STATUS','Status','ESTADO','Estado','ESTATUS POST','Estatus Post','STATUS POST','PUBLICADO','Publicado'];
const TRACKER_CREATIVA_KEYS = ['PLATAFORMA CREATIVA','Plataforma Creativa','LINEA','LÍNEA','CREATIVIDAD','CAMPAÑA','Campaña'];
// Lee el estatus de la fila saltando celdas que son prosa/notas (algunos
// trackers tienen una col STATUS con bullets de seguimiento — eso no es el
// estatus del contenido; el real vive en otra col, p.ej. PUBLICADO).
function _trackerStatusOf(row){
  const idx = _trackerRowIdx(row);
  for(const k of TRACKER_STATUS_KEYS){
    const rks = idx.get(_trackerNorm(k));
    if(!rks) continue;
    for(const rk of rks){
      if(row[rk]!=null && row[rk]!==''){
        const v = String(row[rk]).trim();
        if(v.length > 35 || v.includes('\n') || (v.split(',').length-1) > 1) continue;
        return v;
      }
    }
  }
  return '';
}
const TRACKER_COL_DEFS = [
  {label:'Nombre',             keys:TRACKER_NAME_KEYS},
  {label:'Cohorts',            keys:['COHORTS','COHORT','Cohorts','Cohort','COMUNIDAD']},
  {label:'Plataforma Creativa',keys:['PLATAFORMA CREATIVA','Plataforma Creativa','PLATAFORMA_CREATIVA','LINEA','LÍNEA','Linea de comunicación','Línea de comunicación','CREATIVIDAD','CAMPAÑA','Campaña']},
  {label:'Tipo de contenido',  keys:['TIPO DE CONTENIDO','Tipo de Contenido','Tipo']},
  {label:'Platform',           keys:['PLATFORM','PLATAFORMA','Platform','Plataforma'], platform:true},
  {label:'GW',                 keys:['GW','GOODWILL','Goodwill']},
  {label:'Réplica',            keys:['RÉPLICA','REPLICA','Replica','Réplica']},
  {label:'Brief',              keys:['BRIEF','Brief'], link:true},
  {label:'Guión',              keys:['GUIÓN','GUION','Guion','Guión'], link:true},
  {label:'Estatus Guión',      keys:['ESTATUS GUIÓN','ESTATUS GUION','Estatus Guión','Estatus Guion'], status:true},
  {label:'Asset',              keys:['ASSET','Asset'], link:true},
  {label:'Copy',               keys:['COPY / TUIT','COPY/TUIT','COPY','Copy / Tuit','Copy']},
  {label:'Fecha de Post',      keys:['FECHA DE POST','Fecha de Post','Fecha publicación','Fecha de publicación','Fecha Pub','Fecha'], date:true},
  {label:'Estatus Contenido',  keys:TRACKER_STATUS_KEYS, status:true},
  {label:'Link to Post',       keys:['LINK TO POST','Link to Post','Link'], link:true},
  {label:'Testigo',            keys:['TESTIGO','Testigo'], link:true},
  {label:'Boost',              keys:['BOOST','Boost']},
  {label:'Código de Boost',    keys:['CÓDIGO DE BOOST','CODIGO DE BOOST','Codigo de Boost']},
  {label:'SS Día Boost',       keys:['SS DÍA BOOST','SS DIA BOOST','SS Día Boost'], link:true},
  {label:'Métricas',           keys:['METRICAS','Métricas','Metricas']},
  {label:'Tracking',           keys:['TRACKING','Tracking']},
  {label:'Sentiment',          keys:['SENTIMENT','Sentiment']},
];

/* Normalizar un rótulo de columna es la operación más repetida de la app: cada
   lectura de una celda la corre sobre la clave buscada Y sobre cada clave de la
   fila. Un tracker de 300 renglones son cientos de miles de `normalize('NFD')`
   por repintado, siempre sobre el mismo puñado de rótulos. Se memoriza: las
   cadenas se repiten, el resultado no cambia nunca. */
const _trackerNormMemo = new Map();
function _trackerNorm(s){
  const raw = String(s||'');
  const hit = _trackerNormMemo.get(raw);
  if(hit !== undefined) return hit;
  const val = raw.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[_\s\/]+/g,' ').trim();
  // Tope por si algún sheet trae rótulos basura distintos en cada fila.
  if(_trackerNormMemo.size < 5000) _trackerNormMemo.set(raw, val);
  return val;
}

/* Y el índice de la fila: rótulo normalizado -> rótulos originales que caen en
   él, en el orden en que vienen. Sin esto, buscar una columna recorre TODAS las
   claves de la fila normalizándolas una por una, y eso se repite por cada
   candidato de la lista y por cada fila. Va en un WeakMap porque las filas se
   reconstruyen enteras en cada bajada del sheet: el índice viejo se recolecta
   solo. Se guardan todas las claves que colisionan (un sheet puede traer
   "ESTATUS" y "Estatus") para conservar la regla original: gana la primera que
   tenga algo escrito, no la primera a secas. */
const _trackerIdx = new WeakMap();
function _trackerRowIdx(row){
  let idx = _trackerIdx.get(row);
  if(idx) return idx;
  idx = new Map();
  for(const rk of Object.keys(row)){
    const kn = _trackerNorm(rk);
    const prev = idx.get(kn);
    if(prev) prev.push(rk); else idx.set(kn, [rk]);
  }
  _trackerIdx.set(row, idx);
  return idx;
}

function _trackerGet(row, keys){
  const idx = _trackerRowIdx(row);
  for(const k of keys){
    const rks = idx.get(_trackerNorm(k));
    if(!rks) continue;
    for(const rk of rks){
      if(row[rk]!=null && row[rk]!=='') return row[rk];
    }
  }
  return '';
}
function _trackerParseDate(val, defaultYear){
  if(val==null) return '';
  const s = String(val).trim();
  if(!s) return '';
  const dy = defaultYear || (window.currentCampaignId && (() => {
    try { const c = getData('campaigns').find(x=>x.id===window.currentCampaignId); if(c && c.startDate) return parseInt(c.startDate.slice(0,4)); } catch(e){}
    return new Date().getFullYear();
  })()) || new Date().getFullYear();
  // Excel serial date (e.g., 46050) — Excel/Sheets epoch = 1899-12-30
  if(/^\d{4,6}(\.\d+)?$/.test(s)) {
    const n = parseFloat(s);
    if(n > 20000 && n < 80000) {
      const ms = Math.round((n - 25569) * 86400 * 1000);
      const d = new Date(ms);
      if(!isNaN(d)) return fechaISOdeUTC(d);   // serial de Excel: epoch UTC
    }
  }
  // dd/mm/yyyy or dd-mm-yyyy
  let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if(m){ let [,a,b,c]=m; if(c.length===2) c='20'+c; return `${c}-${b.padStart(2,'0')}-${a.padStart(2,'0')}`; }
  // dd/mm or dd-mm (no year) — assume campaign year
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
  if(m){ const [,a,b]=m; return `${dy}-${b.padStart(2,'0')}-${a.padStart(2,'0')}`; }
  // Spanish month name: "15 de enero" / "15 enero 2026" / "15 ene"
  const MES = {enero:'01',febrero:'02',marzo:'03',abril:'04',mayo:'05',junio:'06',julio:'07',agosto:'08',septiembre:'09',octubre:'10',noviembre:'11',diciembre:'12',ene:'01',feb:'02',mar:'03',abr:'04',may:'05',jun:'06',jul:'07',ago:'08',sep:'09',oct:'10',nov:'11',dic:'12'};
  m = s.toLowerCase().match(/^(\d{1,2})\s*(?:de\s+)?([a-záéíóú]+)(?:\s+(?:de\s+)?(\d{2,4}))?/);
  if(m){ const [,a,mname,c]=m; const mm = MES[mname.normalize('NFD').replace(/[̀-ͯ]/g,'')]; if(mm){ let yy = c||dy; if(String(yy).length===2) yy='20'+yy; return `${yy}-${mm}-${a.padStart(2,'0')}`; } }
  // ISO yyyy-mm-dd
  if(/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
  const d = new Date(s);
  if(!isNaN(d)) return fechaISO(d);   // new Date(s) parseó en local
  return '';
}
// "Did this row actually get posted?" — covers Spanish + English variants
// and tolerates trailing punctuation / inflection (publicado, publicada,
// publicadas, posted, live, online, salió, salio, publishedinflated).
function _isPublishedStatus(v) {
  const s = String(v||'').toLowerCase().trim();
  if(!s) return false;
  // Checkmarks de trackers tipo checklist (col PUBLICADO con ✅/✔/☑/TRUE)
  if(/[✅✔☑✓]/.test(s)) return true;
  if(/^(true|verdadero|s[ií]|yes|done)$/.test(s)) return true;
  return /publicad/.test(s) || /\bposted\b/.test(s) || /\blive\b/.test(s) || /\bonline\b/.test(s) || /\bsali[oó]\b/.test(s) || /\bpublished\b/.test(s);
}

function _trackerRowDate(row){
  return _trackerParseDate(_trackerGet(row, ['FECHA DE POST','Fecha de Post','Fecha publicación','Fecha de publicación','Fecha Pub','Fecha']));
}

// Normaliza filas del tracker para formatos con celdas combinadas:
// - forward-fill del nombre (TALENTO/NOMBRE vacío en filas siguientes del
//   mismo creador hereda el último nombre visto)
// - elimina filas que SOLO traen nombre (separadores de bloque/marca, p.ej.
//   una fila "KNORR" sin fecha/estatus/tipo)
function _trackerNormalizeRows(rows){
  let lastName = '';
  const out = [];
  const nameKeyOf = row => {
    for(const k of TRACKER_NAME_KEYS){
      const kn = _trackerNorm(k);
      for(const rk of Object.keys(row)){ if(_trackerNorm(rk)===kn) return rk; }
    }
    return null;
  };
  // Filas de leyenda/resumen al pie del sheet: la col de nombre trae labels
  // de estatus o totales ("PUBLICADO", "EN AJUSTES", "TOTAL DE CONTENIDOS")
  const LEGEND_RE = /^(total|subtotal|gran total|publicad|por publicar|en ajustes|esperando|pendiente|cancelad|aprobad|revisi|leyenda|status|estatus)/i;
  (rows||[]).forEach(r => {
    const nk = nameKeyOf(r);
    const nm = nk ? String(r[nk]||'').trim() : '';
    if(nm && (LEGEND_RE.test(nm) || /^[✅⚠️❌🔴🟡🟢]/.test(nm))) return; // leyenda — no toca lastName
    const status = _trackerStatusOf(r);
    const fecha = _trackerRowDate(r);
    const tipo = _trackerGet(r,['TIPO DE CONTENIDO','Tipo de Contenido','PLATAFORMA','Platform','Plataforma','CONTENIDO','Contenido']);
    const hasData = !!(status || fecha || tipo);
    if(!nm && !hasData) return;                  // fila vacía
    if(nm && !hasData){ lastName = nm; return; } // separador de bloque
    if(nm) lastName = nm;
    if(!nm && hasData && lastName && nk) r = {...r, [nk]: lastName};
    out.push(r);
  });
  return out;
}

function _renderTrackerSummaryAndTable() {
  const wrap = document.getElementById('trackerTableWrap');
  if(!wrap || !_trackerAllRows.length) return;

  const gst = (r, ...keys) => _trackerGet(r, keys);

  // Apply batch filter
  let rows = _trackerAllRows;
  if(_trackerBatchFilter === 'aon') rows = _trackerAllRows.filter(r=>(r._batch||'aon')==='aon');
  else if(_trackerBatchFilter === 'nano') rows = _trackerAllRows.filter(r=>r._batch==='nano');

  // Drop rows that look like banners / section headers / totals rather than
  // real content. Works across campaigns regardless of which columns exist.
  const MONTHS_RE = /^(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)$/i;
  const BANNER_RE = /^(total|subtotal|grand total|fase|mes|semana|week|month|h1|h2|q[1-4])\b/i;
  rows = rows.filter(r => {
    const nm = _trackerGet(r,TRACKER_NAME_KEYS);
    const fp = _trackerRowDate(r);
    const pc = _trackerGet(r,TRACKER_CREATIVA_KEYS);
    const ec = _trackerStatusOf(r);
    const eg = _trackerGet(r,['ESTATUS GUIÓN','Estatus Guión']);
    // Need at least one strong signal of a real row
    const signals = [nm, fp, pc, ec, eg].filter(Boolean).length;
    if(signals === 0) return false;
    // Drop banner rows — but never drop a row whose ESTATUS is actually
    // "publicado". Better to keep a possibly mis-labelled creator than to
    // under-count published content.
    if(nm && !_isPublishedStatus(ec) && (MONTHS_RE.test(String(nm).trim()) || BANNER_RE.test(String(nm).trim()))) return false;
    // Drop rows where every populated cell shares the same value (separator)
    const populated = Object.values(r).filter(v => v && String(v).trim());
    if(populated.length > 3 && new Set(populated.map(v => String(v).trim().toLowerCase())).size === 1) return false;
    return true;
  });

  // Build status group counts
  const SKIP_VALS = new Set(['—','-','NA','N/A','na','n/a','','FALSE','TRUE','false','true']);
  // Reject values that look like leaked content from neighbouring columns:
  // commas, newlines, very long strings, or starts-with-emoji/punctuation.
  const looksLikeJunk = v => {
    const s = String(v).trim();
    if(!s) return true;
    if(s.length > 35) return true;
    if(s.includes(',') || s.includes('\n') || s.includes(';')) return true;
    if(/^[#@.]/.test(s)) return true;
    return false;
  };
  const countStatus = (colKeys, opts={}) => {
    const counts = {};
    const strict = !!opts.strict;
    rows.forEach(r => {
      const v = gst(r, ...colKeys);
      if(!v) return;
      const s = String(v).trim();
      if(SKIP_VALS.has(s)) return;
      if(strict && looksLikeJunk(s)) return;
      counts[s] = (counts[s]||0) + 1;
    });
    return counts;
  };

  const guionCounts = countStatus(['ESTATUS GUIÓN','ESTATUS GUION','Estatus Guión'], {strict:true});
  // Estatus de contenido vía _trackerStatusOf (salta cols de prosa/notas y
  // cae a PUBLICADO ✅/⚠️ cuando no hay estatus textual)
  const contenidoCounts = {};
  rows.forEach(r => {
    const s = _trackerStatusOf(r);
    if(!s || SKIP_VALS.has(s) || looksLikeJunk(s)) return;
    contenidoCounts[s] = (contenidoCounts[s]||0) + 1;
  });
  const creativaCounts = countStatus(TRACKER_CREATIVA_KEYS, {strict:true});

  // Headline totals
  const totalRows = rows.length;
  const totalPublicado = rows.filter(r=> _isPublishedStatus(_trackerStatusOf(r))).length;
  const totalRevInt = rows.filter(r=>{
    const v = String(_trackerStatusOf(r) || gst(r,'ESTATUS GUIÓN','Estatus Guión')||'').toLowerCase();
    return v.includes('revisión int') || v.includes('revision int');
  }).length;
  const totalAprobado = rows.filter(r=>{
    const v = String(_trackerStatusOf(r)||'').toLowerCase();
    return v.includes('aprobad') && !v.includes('publicad');
  }).length;
  const totalPorPublicar = rows.filter(r=>{
    const v = String(_trackerStatusOf(r)||'').toLowerCase();
    return v.includes('por publicar') || v.includes('pendiente') || v.includes('⚠');
  }).length;

  // Apply status filter to table rows
  let tableRows = rows;
  if(_trackerStatusFilter) {
    const {field, value} = _trackerStatusFilter;
    if(field==='contenido') tableRows = rows.filter(r => _trackerStatusOf(r) === value);
    else {
      const keys = field==='guion'
        ? ['ESTATUS GUIÓN','ESTATUS GUION','Estatus Guión']
        : TRACKER_CREATIVA_KEYS;
      tableRows = rows.filter(r => gst(r,...keys) === value);
    }
  }

  const COLS = TRACKER_COL_DEFS.map(d=>d.label);

  const makeSummaryCard = (status, count, field) =>
    `<button onclick="filterTrackerByStatus('${field}','${String(status).replace(/'/g,"&#39;")}')"
      style="border:1.5px solid var(--border);background:var(--white);border-radius:12px;padding:10px 14px;cursor:pointer;text-align:left;transition:border-color var(--dur-quick);${_trackerStatusFilter&&_trackerStatusFilter.value===status?'border-color:var(--pink);':''}"
      onmouseover="this.style.borderColor='var(--pink)'" onmouseout="this.style.borderColor='${_trackerStatusFilter&&_trackerStatusFilter.value===status?'var(--pink)':'var(--border)'}'">
      <div style="font-size:24px;font-weight:800;color:var(--text);line-height:1;">${count}</div>
      <div style="margin-top:6px;">${trackerStatusBadge(status)}</div>
    </button>`;

  // Creativa color palette (deterministic per name)
  const _palette = ['#ec4899','#8b5cf6','#06b6d4','#10b981','#f59e0b','#ef4444','#3b82f6','#84cc16','#a855f7','#f97316'];
  const _hash = s => { let h=0; for(let i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))|0; return Math.abs(h); };
  const creativaColor = name => _palette[_hash(String(name))%_palette.length];

  const makeCreativaCard = (name, count) =>
    `<button onclick="filterTrackerByStatus('creativa','${String(name).replace(/'/g,"&#39;")}')"
      style="border:1.5px solid var(--border);background:var(--white);border-radius:12px;padding:10px 14px;cursor:pointer;text-align:left;min-width:140px;${_trackerStatusFilter&&_trackerStatusFilter.value===name?'border-color:var(--pink);':''}">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
        <span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${creativaColor(name)};"></span>
        <span style="font-size:11px;font-weight:700;color:var(--text);white-space:nowrap;">${_esc(name)}</span>
      </div>
      <div style="font-size:22px;font-weight:800;color:var(--text);line-height:1;">${count}</div>
      <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">contenidos</div>
    </button>`;

  // Timeline: count by period × creativa. Period = week or month (toggle).
  const byMonth = (_trackerTimeView === 'month');
  const weekKey = iso => {
    if(!iso) return '';
    const d = new Date(iso+'T12:00:00');
    if(isNaN(d)) return '';
    const onejan = new Date(d.getFullYear(),0,1);
    const w = Math.ceil((((d - onejan)/86400000) + onejan.getDay()+1)/7);
    return `${d.getFullYear()}-W${String(w).padStart(2,'0')}`;
  };
  const monthKey = iso => {
    if(!iso) return '';
    const d = new Date(iso+'T12:00:00');
    if(isNaN(d)) return '';
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  };
  const weekLabel = wk => {
    if(!wk) return '';
    const [y,w] = wk.split('-W').map(Number);
    const simple = new Date(y,0,1+(w-1)*7);
    const dow = simple.getDay();
    const monday = new Date(simple); monday.setDate(simple.getDate() - ((dow+6)%7));
    return monday.toLocaleDateString('es-MX',{day:'numeric',month:'short'});
  };
  const monthLabel = mk => {
    if(!mk) return '';
    const [y,m] = mk.split('-').map(Number);
    return new Date(y,m-1,1).toLocaleDateString('es-MX',{month:'short',year:'2-digit'});
  };
  const periodKey   = byMonth ? monthKey : weekKey;
  const periodLabel = byMonth ? monthLabel : weekLabel;
  const periodTitle = byMonth ? 'mes' : 'semana';

  // Boost detection: master tracker marks boosted content with a checkbox,
  // which exports as TRUE / VERDADERO / sí / x / 1.
  const _isBoosted = v => /^(true|verdadero|s[ií]|x|1|✓|yes)$/i.test(String(v||'').trim());
  const timelineMap = {};  // period → {creativa → count}
  const boostMap = {};     // period → boosted count
  rows.forEach(r => {
    const iso = _trackerRowDate(r);
    const pk = periodKey(iso);
    if(!pk) return;
    const cv = gst(r, ...TRACKER_CREATIVA_KEYS) || 'Sin clasificar';
    if(!timelineMap[pk]) timelineMap[pk] = {};
    timelineMap[pk][cv] = (timelineMap[pk][cv]||0) + 1;
    if(_isBoosted(gst(r,'BOOST','Boost'))) boostMap[pk] = (boostMap[pk]||0) + 1;
  });
  // Cap to most recent N periods so the SVG chart doesn't render thousands
  // of pixels wide for trackers spanning multiple years.
  const allWeeks = Object.keys(timelineMap).sort();
  const weeks = allWeeks.slice(byMonth ? -18 : -26);
  const creativas = Object.keys(creativaCounts);
  let maxWeekTotal = 0;
  weeks.forEach(w => { const t = Object.values(timelineMap[w]).reduce((a,b)=>a+b,0); if(t>maxWeekTotal) maxWeekTotal=t; });

  // Week/Month toggle
  const timeToggleHtml = `
    <div style="display:flex;gap:6px;margin-bottom:10px;">
      <button class="metrics-tab-pill ${!byMonth?'active':''}" onclick="setTrackerTimeView('week')">Por semana</button>
      <button class="metrics-tab-pill ${byMonth?'active':''}" onclick="setTrackerTimeView('month')">Por mes</button>
    </div>`;

  // SVG line chart of total publications per week
  let chartHtml = '';
  if(weeks.length > 0) {
    const W = Math.max(420, weeks.length * 56);
    const H = 180, pad = {l:32, r:16, t:14, b:30};
    const totals = weeks.map(w => Object.values(timelineMap[w]).reduce((a,b)=>a+b,0));
    const yMax = Math.max(1, ...totals);
    const xStep = (W - pad.l - pad.r) / Math.max(1, weeks.length-1);
    const yScale = v => pad.t + (H - pad.t - pad.b) * (1 - v/yMax);
    const xPos = i => pad.l + i*xStep;
    const points = totals.map((t,i)=>`${xPos(i).toFixed(1)},${yScale(t).toFixed(1)}`).join(' ');
    const boostTotals = weeks.map(w => boostMap[w]||0);
    const boostPoints = boostTotals.map((t,i)=>`${xPos(i).toFixed(1)},${yScale(t).toFixed(1)}`).join(' ');
    const boostDots = boostTotals.map((t,i)=>`<circle cx="${xPos(i).toFixed(1)}" cy="${yScale(t).toFixed(1)}" r="3" fill="#2c6dff" stroke="var(--white)" stroke-width="1.5"><title>Boost ${periodLabel(weeks[i])}: ${t}</title></circle>`).join('');
    const hasBoost = boostTotals.some(t=>t>0);
    const showBoost = hasBoost && _trackerShowBoost;
    const boostToggleHtml = hasBoost ? `
      <div style="display:flex;gap:6px;margin-bottom:10px;">
        <button class="metrics-tab-pill ${!_trackerShowBoost?'active':''}" onclick="setTrackerShowBoost(false)">Solo total</button>
        <button class="metrics-tab-pill ${_trackerShowBoost?'active':''}" onclick="setTrackerShowBoost(true)">Total + boost</button>
      </div>` : '';
    const ticks = Math.min(yMax, 5);
    const yAxis = Array.from({length: ticks+1}, (_,k)=> {
      const v = Math.round((yMax/ticks)*k);
      return `<line x1="${pad.l}" x2="${W-pad.r}" y1="${yScale(v)}" y2="${yScale(v)}" stroke="var(--border)" stroke-width="1" opacity=".5"/>
              <text x="${pad.l-6}" y="${yScale(v)+3}" text-anchor="end" font-size="9" fill="var(--text-muted)">${v}</text>`;
    }).join('');
    const dots = totals.map((t,i)=>`<circle cx="${xPos(i).toFixed(1)}" cy="${yScale(t).toFixed(1)}" r="3.5" fill="var(--pink)" stroke="var(--white)" stroke-width="1.5"><title>${periodLabel(weeks[i])}: ${t}</title></circle>`).join('');
    const xLabels = weeks.map((w,i)=>`<text x="${xPos(i).toFixed(1)}" y="${H-pad.b+14}" text-anchor="middle" font-size="9" fill="var(--text-muted)">${periodLabel(w)}</text>`).join('');
    const valLabels = totals.map((t,i)=>`<text x="${xPos(i).toFixed(1)}" y="${(yScale(t)-7).toFixed(1)}" text-anchor="middle" font-size="9" font-weight="700" fill="var(--text)">${t}</text>`).join('');
    chartHtml = `
      <div style="background:var(--bg);border:1px solid var(--border);border-radius:14px;padding:14px 16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.8px;"><span class="icn-inline">${ICN_chart}</span>Publicaciones por ${periodTitle}</div>
          <button class="btn btn-ghost btn-sm" data-noexport onclick="downloadTrackerChartPng()" title="Descargar gráfico como PNG">⬇ PNG</button>
        </div>
        ${timeToggleHtml}
        ${boostToggleHtml}
        <div style="display:flex;gap:14px;font-size:11px;margin-bottom:6px;">
          <span style="display:inline-flex;align-items:center;gap:5px;"><span style="width:14px;height:3px;background:var(--pink);border-radius:2px;display:inline-block;"></span>Total</span>
          ${showBoost?`<span style="display:inline-flex;align-items:center;gap:5px;"><span style="width:14px;height:3px;background:#2c6dff;border-radius:2px;display:inline-block;"></span>Con boost</span>`:''}
        </div>
        <div style="overflow-x:auto;">
          <svg id="trackerChartSvg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" preserveAspectRatio="xMinYMid meet" style="display:block;">
            ${yAxis}
            <polyline points="${points}" fill="none" stroke="var(--pink)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
            ${showBoost?`<polyline points="${boostPoints}" fill="none" stroke="#2c6dff" stroke-width="2" stroke-dasharray="4 3" stroke-linejoin="round" stroke-linecap="round"/>`:''}
            ${dots}
            ${showBoost?boostDots:''}
            ${valLabels}
            ${xLabels}
          </svg>
        </div>
      </div>`;
  }

  // Compact weekly table
  let weeklyTableHtml = '';
  if(weeks.length > 0) {
    const totalAll = weeks.reduce((acc,w)=>acc + Object.values(timelineMap[w]).reduce((a,b)=>a+b,0), 0);
    const showBoostCol = _trackerShowBoost && Object.values(boostMap).some(v=>v>0);
    weeklyTableHtml = `
      <div id="trackerWeeklyTableCard" style="background:var(--bg);border:1px solid var(--border);border-radius:14px;padding:14px 16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.8px;"><span class="icn-inline">${ICN_clipboard}</span>Tabla por ${periodTitle}</div>
          <button class="btn btn-ghost btn-sm" data-noexport onclick="downloadTrackerTablePng()" title="Descargar tabla como PNG">⬇ PNG</button>
        </div>
        <div class="table-wrap">
          <table class="table" style="font-size:12px;">
            <thead><tr>
              <th style="text-align:left;">${byMonth?'Mes':'Semana'}</th>
              <th style="text-align:right;">Publicaciones</th>
              ${showBoostCol?'<th style="text-align:right;">Con boost</th>':''}
              <th>Top plataforma creativa</th>
            </tr></thead>
            <tbody>
              ${weeks.map(w => {
                const tot = Object.values(timelineMap[w]).reduce((a,b)=>a+b,0);
                const bst = boostMap[w]||0;
                const top = Object.entries(timelineMap[w]).sort((a,b)=>b[1]-a[1])[0];
                return `<tr>
                  <td style="white-space:nowrap;">${periodLabel(w)}</td>
                  <td style="text-align:right;font-weight:700;">${tot}</td>
                  ${showBoostCol?`<td style="text-align:right;font-weight:700;color:${bst?'#2c6dff':'var(--text-muted)'};">${bst?('🚀 '+bst):'—'}</td>`:''}
                  <td><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${creativaColor(top[0])};vertical-align:middle;margin-right:4px;"></span>${top[0]} <span style="color:var(--text-muted);">(${top[1]})</span></td>
                </tr>`;
              }).join('')}
              <tr style="border-top:2px solid var(--border);font-weight:800;">
                <td>Total</td><td style="text-align:right;">${totalAll}</td>${showBoostCol?`<td style="text-align:right;color:#2c6dff;">${Object.values(boostMap).reduce((a,b)=>a+b,0)||0}</td>`:''}<td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>`;
  }

  const filterBar = _trackerStatusFilter
    ? `<div style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text-muted);margin-bottom:10px;">
        Filtrando por: <strong style="color:var(--text);">${_trackerStatusFilter.value}</strong>
        <button onclick="clearTrackerFilter()" style="background:none;border:none;cursor:pointer;color:var(--pink);font-size:12px;font-weight:700;">✕ Limpiar</button>
        <span style="color:var(--text-muted);">${tableRows.length} resultado${tableRows.length!==1?'s':''}</span>
       </div>`
    : '';

  // Headline summary
  const headlineCard = (label, value, color) =>
    `<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:12px 14px;min-width:120px;">
      <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.8px;">${label}</div>
      <div style="font-size:28px;font-weight:800;color:${color};line-height:1.1;margin-top:4px;">${value}</div>
    </div>`;

  wrap.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:16px;">
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        ${headlineCard('Total','&Sigma; '+totalRows,'var(--text)')}
        ${headlineCard('Publicados',totalPublicado,'#166534')}
        ${headlineCard('Aprobados',totalAprobado,'#1d4ed8')}
        ${headlineCard('Por publicar',totalPorPublicar,'#b45309')}
        ${headlineCard('Revisión interna',totalRevInt,'#854d0e')}
      </div>
      <div style="background:var(--bg);border:1px solid var(--border);border-radius:14px;padding:14px 16px;">
        <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px;"><span class="icn-inline">${ICN_sparkle}</span>Desglose por Plataforma Creativa</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">
          ${Object.entries(creativaCounts).sort((a,b)=>b[1]-a[1]).map(([s,c])=>makeCreativaCard(s,c)).join('')||'<span style="font-size:12px;color:var(--text-muted);">Sin datos en columna "PLATAFORMA CREATIVA"</span>'}
        </div>
      </div>
      ${chartHtml}
      ${weeklyTableHtml}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div style="background:var(--bg);border:1px solid var(--border);border-radius:14px;padding:14px 16px;">
          <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px;"><span class="icn-inline">${ICN_doc}</span>Estatus Guión</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;">
            ${Object.entries(guionCounts).map(([s,c])=>makeSummaryCard(s,c,'guion')).join('')||'<span style="font-size:12px;color:var(--text-muted);">Sin datos</span>'}
          </div>
        </div>
        <div style="background:var(--bg);border:1px solid var(--border);border-radius:14px;padding:14px 16px;">
          <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px;"><span class="icn-inline">${ICN_play}</span>Estatus Contenido</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;">
            ${Object.entries(contenidoCounts).map(([s,c])=>makeSummaryCard(s,c,'contenido')).join('')||'<span style="font-size:12px;color:var(--text-muted);">Sin datos</span>'}
          </div>
        </div>
      </div>
      ${filterBar}
      <div class="table-wrap">
        <table class="table">
          <thead><tr>${TRACKER_COL_DEFS.map(d=>`<th style="white-space:nowrap;font-size:11px;">${d.label}</th>`).join('')}</tr></thead>
          <tbody>
            ${(()=>{
              if(tableRows.length===0) return `<tr><td colspan="${COLS.length}" style="text-align:center;color:var(--text-muted);padding:24px;">Sin resultados</td></tr>`;
              // Cap rendered rows to prevent the browser from freezing on
              // very long master trackers (1000+ rows × 22 cols = 22k cells).
              const CAP = 300;
              const visible = tableRows.slice(0, CAP);
              const footer = tableRows.length > CAP
                ? `<tr><td colspan="${COLS.length}" style="text-align:center;color:var(--text-muted);padding:14px;font-size:11px;background:var(--bg);">Mostrando ${CAP} de ${tableRows.length} filas. Usa los filtros de estatus arriba para ver el resto.</td></tr>`
                : '';
              return visible.map(r=>`<tr>
                ${TRACKER_COL_DEFS.map(def=>{
                  const val = _trackerGet(r, def.keys);
                  if(def.link) {
                    const sv = String(val||'');
                    // El sheet lo puede editar cualquiera con el enlace, así
                    // que su contenido es no confiable: URL por _safeUrl y
                    // todo lo demás escapado antes de entrar al innerHTML.
                    const href = sv.startsWith('www') ? 'https://'+sv : sv;
                    return sv && (sv.startsWith('http')||sv.startsWith('www'))
                      ? `<td><a href="${_esc(_safeUrl(href))}" target="_blank" rel="noopener" style="color:var(--blue);font-size:11px;white-space:nowrap;">Ver →</a></td>`
                      : (sv && sv.toUpperCase()==='LINK'
                          ? `<td style="font-size:11px;color:var(--text-muted);">LINK</td>`
                          : `<td style="font-size:12px;">${sv?_esc(sv):'—'}</td>`);
                  }
                  if(def.status) return `<td>${val?trackerStatusBadge(val):'—'}</td>`;
                  if(def.platform) return `<td style="white-space:nowrap;">${val?platformBadge(val):'—'}</td>`;
                  if(def.date) { const iso = _trackerParseDate(val); return `<td style="font-size:12px;white-space:nowrap;">${iso?formatDateShort(iso):'—'}</td>`; }
                  return `<td style="font-size:12px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${_esc(String(val||''))}">${val?_esc(val):'—'}</td>`;
                }).join('')}
              </tr>`).join('') + footer;
            })()}
          </tbody>
        </table>
      </div>
    </div>`;
}

function renderCampaignTracker(c) {
  _trackerBatchFilter = 'all';
  _trackerStatusFilter = null;
  // Populate config fields
  const urlInp = document.getElementById('trackerSheetsUrl');
  if(urlInp) urlInp.value = c.trackerSheetUrl || '';
  const aonInp = document.getElementById('trackerAonTab');
  if(aonInp) aonInp.value = c.trackerAonTab || '';
  const nanoInp = document.getElementById('trackerNanoTab');
  if(nanoInp) nanoInp.value = c.trackerNanoTab || '';
  // Show/hide Nano tab input and batch pills
  const nanoGrp = document.getElementById('trackerNanoTabGroup');
  const batchPills = document.getElementById('trackerBatchPills');
  if(nanoGrp) nanoGrp.style.display = c.hasNano ? 'flex' : 'none';
  if(batchPills) batchPills.style.display = c.hasNano ? 'flex' : 'none';
  // Show last sync time
  const syncEl = document.getElementById('trackerLastSync');
  if(syncEl && c.trackerLastSync) syncEl.textContent = 'Última sync: ' + new Date(c.trackerLastSync).toLocaleString('es-MX',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
  const wrap = document.getElementById('trackerTableWrap');
  if(!wrap) return;
  // Older builds shipped a CSV parser that could leak content between cells.
  // The auto-resync that detected those leaks now loops with the Firestore
  // listener merge (trackerRows live only in-memory), so it has been retired
  // — if a user ever needs to discard cached rows they can click Sincronizar.
  if(c.trackerRows && c.trackerRows.length) {
    _trackerAllRows = c.trackerRows;
    _renderTrackerSummaryAndTable();
    _startTrackerAutoRefresh(c);
  } else if(c.trackerSheetUrl) {
    // Esta rama pedía el sheet en CADA repintado de la pestaña, sin guarda de
    // ninguna clase: con el tracker caído —o simplemente vacío— entraba aquí
    // una y otra vez, una petición por snapshot de Firestore, y el mensaje de
    // "Cargando datos del tracker..." tapaba cualquier error que llegara a
    // pintarse. Las mismas dos marcas que usan el Resumen y el Calendario:
    // `_fetchTrackerEnCurso` mientras está en vuelo, `_fuenteEnEspera` cuando
    // ya se intentó y no trajo filas.
    const enVuelo = _fetchTrackerEnCurso.has(c.id);
    const enEspera = _fuenteEnEspera(c.id, 'tracker', c.trackerSheetUrl);
    if(enVuelo || !enEspera) {
      wrap.innerHTML = `<div class="empty-state"><p>Cargando datos del tracker...</p></div>`;
    } else {
      const err = (c._syncErrors && c._syncErrors.tracker) || '';
      wrap.innerHTML = err
        ? `<div class="empty-state"><p>No se pudo leer el tracker: ${_esc(err)}</p></div>`
        : `<div class="empty-state"><p>El tracker vinculado no trajo publicaciones.</p></div>`;
    }
    if(!enVuelo && !enEspera) {
      _fetchTrackerEnCurso.add(c.id);
      _autoFetchTracker(c.trackerSheetUrl, c, {silent:true}).finally(() => {
        _fetchTrackerEnCurso.delete(c.id);
        _marcarFuenteVacia(c.id, 'tracker', c.trackerSheetUrl, !(c.trackerRows && c.trackerRows.length));
        if(currentCampaignId === c.id) { try { renderCampaignTracker(c); } catch(e){} }
      });
    }
  } else {
    wrap.innerHTML = `<div class="empty-state"><p>Vincula el master tracker para ver las publicaciones</p></div>`;
  }
}

function _renderTrackerTable(rows) {
  _trackerAllRows = rows;
  _renderTrackerSummaryAndTable();
}

async function _autoFetchTracker(url, campaign, opts = {}) {
  const csvUrl = normalizeCsvUrl(url);
  // Una URL que no es de Sheets salía por aquí en silencio y sin tocar el DOM:
  // la pestaña se quedaba con "Cargando datos del tracker..." para siempre y
  // quien la mirara no tenía forma de saber que el link estaba mal. Encima
  // volvía en el acto, sin red de por medio, así que el repintado perezoso del
  // Resumen y del Calendario la volvía a llamar en bucle. Se avisa y se corta.
  if(!csvUrl) {
    try { marcarErrorFuente(campaign, 'tracker', 'La URL no es un Google Sheet'); } catch(e){}
    const wrap = document.getElementById('trackerTableWrap');
    if(wrap && currentCampaignId === campaign.id) {
      wrap.innerHTML = '<div class="empty-state"><p>La URL del tracker no es un Google Sheet.</p></div>';
    }
    if(opts.silent !== true) showToast('La URL del tracker no es un Google Sheet.','error');
    return;
  }
  try {
    const res = await fetch(csvUrl);
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if(text.trim().startsWith('<!')) throw new Error('not public');
    let rows = parseCSV(text);
    // Tag rows as AON by default
    rows = rows.map(r=>({...r, _batch:'aon'}));
    campaign.trackerRows = rows;
    // Descubrir pestañas cuesta ~500ms (se baja el htmlview entero) y solo
    // hace falta cuando la campaña declara pestañas AON/Nano. Sin filtro, el
    // gid que trae la URL ya apunta a la pestaña correcta: pedir el resto
    // sería lento y además mezclaría hojas ajenas del mismo workbook
    // (Overview, POCS, Master de otra marca…) dentro del tracker.
    const aonTabName  = (campaign.trackerAonTab||'').toLowerCase();
    const nanoTabName = (campaign.trackerNanoTab||'').toLowerCase();
    const sid = (aonTabName || nanoTabName) ? _extractSheetId(url) : null;
    if(sid) {
      try {
        const tabs = await _fetchSheetTabs(sid);
        if(tabs.length > 0) {
          const elegidas = tabs.filter(t => {
            const tname = (t.title||t.name||'').toLowerCase();
            return (aonTabName && tname.includes(aonTabName)) ||
                   (nanoTabName && (tname.includes(nanoTabName) || tname.includes('nano') || tname.includes('cgc') || tname.includes('ugc')));
          });
          // Las pestañas se piden en paralelo: antes era un await por vuelta,
          // así que N pestañas costaban N viajes en serie.
          const lotes = await Promise.all(elegidas.map(t => _fetchTabRows(sid, t.gid).catch(()=>[])));
          const allRows = [];
          elegidas.forEach((t, i) => {
            const tname = (t.title||t.name||'').toLowerCase();
            const isNano = nanoTabName && (tname.includes(nanoTabName) || tname.includes('nano') || tname.includes('cgc') || tname.includes('ugc'));
            allRows.push(...lotes[i].map(r=>({...r, _batch: isNano?'nano':'aon', _tabName:t.title||t.name})));
          });
          if(allRows.length) campaign.trackerRows = allRows;
        }
      } catch(e) { /* single tab fallback — use CSV from URL gid */ }
    }
    try { campaign.trackerRows = _trackerNormalizeRows(campaign.trackerRows); } catch(e){}
    campaign.trackerLastSync = Date.now();
    // Render only when the user is looking at this campaign. If they're on
    // another page (e.g. Calendar lazy-fetching) we just cache for later —
    // the table cap (300 rows) + chart cap (26 weeks) keep this cheap.
    if(currentCampaignId === campaign.id) {
      _renderTrackerTable(campaign.trackerRows);
      _startTrackerAutoRefresh(campaign);
    }
    const campaigns = getData('campaigns');
    const idx = campaigns.findIndex(x=>x.id===campaign.id);
    if(idx!==-1) {
      campaigns[idx].trackerSheetUrl = url;
      campaigns[idx].trackerRows = campaign.trackerRows;
      campaigns[idx].trackerLastSync = campaign.trackerLastSync;
      guardarCampana(campaigns[idx]);
    } // else: campaign was deleted while we were fetching — drop the write
    try { marcarErrorFuente(campaign, 'tracker', ''); } catch(e){}
    // Sólo la sync que pidió una persona avisa. Ver _notifyTrackerChanges.
    if(opts.silent !== true) {
      try { _notifyTrackerChanges(campaign, campaign.trackerRows); } catch(e){ console.warn('notify tracker', e); }
      showToast('Tracker sincronizado','success');
    }
  } catch(e) {
    try { marcarErrorFuente(campaign, 'tracker', e.message); } catch(_){}
    // Clear stale rows so the UI can't show data from a previous successful sync
    campaign.trackerRows = [];
    const wrap = document.getElementById('trackerTableWrap');
    if(wrap) wrap.textContent = '';
    if(wrap) {
      const div = document.createElement('div');
      div.className = 'empty-state';
      const p = document.createElement('p');
      p.textContent = 'Error cargando tracker: ' + e.message;
      div.appendChild(p);
      wrap.appendChild(div);
    }
  }
}

function saveTrackerUrl() {
  const url = document.getElementById('trackerSheetsUrl')?.value?.trim();
  if(!currentCampaignId || !url) return;
  const campaigns = getData('campaigns');
  const c = campaigns.find(x=>x.id===currentCampaignId);
  if(c) { c.trackerSheetUrl = url; guardarCampana(c); }
}

function syncTracker() {
  const url = document.getElementById('trackerSheetsUrl')?.value?.trim();
  if(!url) { showToast('Pega la URL del master tracker.','error'); return; }
  const campaigns = getData('campaigns');
  const c = campaigns.find(x=>x.id===currentCampaignId);
  if(!c) return;
  c.trackerSheetUrl = url;
  guardarCampana(c);
  const wrap = document.getElementById('trackerTableWrap');
  if(wrap) wrap.innerHTML = `<div class="empty-state"><p>Cargando...</p></div>`;
  showToast('Sincronizando tracker…','success');
  _autoFetchTracker(url, c);
}
