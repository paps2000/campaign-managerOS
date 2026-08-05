/* Campaign OS — Escenario, tracker, aprobación, reporte, pendientes, métricas (parsers de Sheets)
   Extraído de index.html. Script CLÁSICO a propósito (NO type="module"):
   el HTML llama estas funciones desde atributos onclick/onchange, que solo
   resuelven contra el scope global. El orden de carga en index.html replica
   el orden original de ejecución y no debe alterarse. */

// ============================================================
// ESCENARIO (planning sheet: estimated views/cost per creator)
// ============================================================
function saveEscenarioUrl() {
  const url = document.getElementById('escenarioSheetsUrl')?.value?.trim();
  if(!currentCampaignId || !url) return;
  const campaigns = getData('campaigns');
  const c = campaigns.find(x=>x.id===currentCampaignId);
  if(c) { c.escenarioSheetUrl = url; setData('campaigns', campaigns); }
}

function syncEscenario() {
  const url = document.getElementById('escenarioSheetsUrl')?.value?.trim();
  if(!url) { showToast('Pega el URL del escenario primero','error'); return; }
  const campaigns = getData('campaigns');
  const c = campaigns.find(x=>x.id===currentCampaignId);
  if(!c) return;
  // Primera sync de esta campaña: confirmar que el sheet es público
  if(!c.escenarioPublicOk) {
    const ok = confirm('Para que la plataforma pueda leer el escenario, el Google Sheet debe estar compartido como "Cualquier persona con el enlace" (Lector es suficiente).\n\n¿Confirmas que el sheet ya está público?');
    if(!ok) { showToast('Comparte el sheet como público y vuelve a intentar','error'); return; }
    c.escenarioPublicOk = true;
  }
  c.escenarioSheetUrl = url;
  setData('campaigns', campaigns);
  const wrap = document.getElementById('escenarioBlock');
  if(wrap) wrap.innerHTML = `<div class="empty-state"><p>Cargando escenario...</p></div>`;
  showToast('Sincronizando escenario...','success');
  _autoFetchEscenario(url, c);
}

async function _autoFetchEscenario(url, campaign) {
  const csvUrl = normalizeCsvUrl(url);
  if(!csvUrl) return;
  try {
    const res = await fetch(csvUrl);
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if(text.trim().startsWith('<!')) throw new Error('El sheet no es público — compártelo como "Cualquier persona con el enlace" (Lector) y vuelve a sincronizar');
    const rows = parseCSV(text);
    campaign.escenarioRows = rows;
    campaign.escenarioLastSync = Date.now();
    const campaigns = getData('campaigns');
    const idx = campaigns.findIndex(x=>x.id===campaign.id);
    if(idx!==-1) {
      campaigns[idx].escenarioSheetUrl = url;
      campaigns[idx].escenarioRows = rows;
      campaigns[idx].escenarioLastSync = campaign.escenarioLastSync;
      setData('campaigns', campaigns);
    }
    // Persist the parsed rows so they survive reloads (no re-sync needed).
    persistEscenario(campaign.id, rows, url, campaign.escenarioLastSync);
    renderEscenarioBlock(campaign);
    showToast('Escenario sincronizado','success');
  } catch(e) {
    const wrap = document.getElementById('escenarioBlock');
    if(wrap) wrap.innerHTML = `<div class="empty-state"><p>Error cargando escenario: ${e.message}</p></div>`;
  }
}

// --- UGC results (separate sheet/tab, parsed flexibly) ---
function saveUgcUrl() {
  const url = document.getElementById('ugcSheetsUrl')?.value?.trim();
  if(!currentCampaignId) return;
  const campaigns = getData('campaigns');
  const c = campaigns.find(x=>x.id===currentCampaignId);
  if(c) { c.ugcSheetUrl = url||''; setData('campaigns', campaigns); }
}

function syncUgcResults() {
  const url = document.getElementById('ugcSheetsUrl')?.value?.trim();
  if(!url) { showToast('Pega el URL del sheet de resultados UGC primero','error'); return; }
  const campaigns = getData('campaigns');
  const c = campaigns.find(x=>x.id===currentCampaignId);
  if(!c) return;
  c.ugcSheetUrl = url;
  setData('campaigns', campaigns);
  showToast('Sincronizando UGC...','success');
  _autoFetchUgc(url, c);
}

async function _autoFetchUgc(url, campaign) {
  const csvUrl = normalizeCsvUrl(url);
  if(!csvUrl) return;
  try {
    const res = await fetch(csvUrl);
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if(text.trim().startsWith('<!')) throw new Error('El sheet no es público — compártelo como "Cualquier persona con el enlace" (Lector) y vuelve a sincronizar');
    const rows = parseCSV(text);
    campaign.ugcRows = rows;
    campaign.ugcLastSync = Date.now();
    const campaigns = getData('campaigns');
    const idx = campaigns.findIndex(x=>x.id===campaign.id);
    if(idx!==-1) {
      campaigns[idx].ugcSheetUrl = url;
      campaigns[idx].ugcRows = rows;
      campaigns[idx].ugcLastSync = campaign.ugcLastSync;
      setData('campaigns', campaigns);
    }
    renderEscenarioBlock(campaign);
    try { renderCampaignProgress(campaign); renderCampaignCoherence(campaign); } catch(e){}
    showToast('Resultados UGC sincronizados','success');
  } catch(e) {
    showToast('Error UGC: '+e.message,'error');
  }
}

// Parse a UGC results sheet — flexible aliases for the columns the
// external nano/micro agency typically reports.
function _parseUgcResults(rows) {
  if(!rows || !rows.length) return null;
  const norm = s => String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[_\s@]+/g,' ').trim();
  const get = (r, ...keys) => { for(const k of keys){ const kn=norm(k); for(const rk of Object.keys(r)){ if(norm(rk)===kn && r[rk]!=null && r[rk]!=='') return r[rk]; } } return ''; };
  const num = parseLocaleNumber;

  const NAME_K = ['NOMBRE','Nombre','PERFIL','Perfil','USERNAME','Username','Handle','HANDLE','Creator','Creador','Influencer'];
  const PLAT_K = ['PLATAFORMA','Plataforma','PLATFORM','Platform','Red Social','Red'];
  const VIEWS_K = ['VIEWS','Views','Vistas','Reproducciones','Plays','Visualizaciones','Video Views','Impresiones','Impressions','Reach','Alcance'];
  const LIKES_K = ['LIKES','Likes','Me gusta'];
  const COMMENTS_K = ['COMMENTS','Comments','Comentarios'];
  const SHARES_K = ['SHARES','Shares','Compartidos'];
  const SAVES_K = ['SAVES','Saves','Guardados'];
  const ENG_K = ['ENGAGEMENT','Engagement','Interacciones','Interactions','Total Engagement'];
  const LINK_K = ['LINK','Link','URL','Post','Post URL','LINK TO POST'];
  const STATUS_K = ['ESTATUS','Estatus','Status','ESTATUS CONTENIDO'];

  let views = 0, engagement = 0, contenidosPublicados = 0;
  const creatorsSet = new Set();
  const byPlatform = {};

  rows.forEach(r => {
    const name = String(get(r, ...NAME_K)||'').trim();
    const link = String(get(r, ...LINK_K)||'').trim();
    const status = String(get(r, ...STATUS_K)||'').trim();
    const v = num(get(r, ...VIEWS_K));
    const e_agg = num(get(r, ...ENG_K));
    const e_bd  = num(get(r, ...LIKES_K)) + num(get(r, ...COMMENTS_K)) + num(get(r, ...SHARES_K)) + num(get(r, ...SAVES_K));
    const e = e_bd > 0 ? e_bd : e_agg;
    const plat = String(get(r, ...PLAT_K)||'').trim();

    // Treat row as a published piece if it has either a link, views, or an explicit Publicado status
    const counts = !!link || v > 0 || /publicad/i.test(status);
    if(!counts) return;

    contenidosPublicados++;
    views += v;
    engagement += e;
    if(name) creatorsSet.add(norm(name));
    if(plat) {
      if(!byPlatform[plat]) byPlatform[plat] = { posts:0, views:0, engagement:0 };
      byPlatform[plat].posts += 1;
      byPlatform[plat].views += v;
      byPlatform[plat].engagement += e;
    }
  });

  return {
    contenidosPublicados,
    views,
    engagement,
    creadoresUnicos: creatorsSet.size,
    byPlatform,
    rowCount: rows.length,
  };
}

// Heuristics that decide which rows are real creators vs banners / totals / UGC
const ESCENARIO_BANNER_RE = /^(big numbers|budget|aurora|resumen|total|subtotal|fase|fee|suma|gran total)/i;
// Rows that should be treated as the CAMPAIGN GOAL (totals).
// Covers "BIG NUMBERS X", "TOTAL", "TOTALES", "TOTAL CAMPAÑA", "SUMA",
// "GRAN TOTAL", "TOTAL GENERAL", "TOTAL ESCENARIO", etc.
const ESCENARIO_GOAL_RE   = /^(big numbers|totales?|gran total|total general|total campaña|total escenario|suma total|total final)\b/i;
function _escenarioIsCreatorName(raw) {
  const v = String(raw||'').trim();
  if(!v) return false;
  // Any digit disqualifies — creators don't have numbers in their names
  // (catches pure numbers like "1.0", "300" and alphanumeric junk like
  // "FB1", "ABC123", "TT2", etc.)
  if(/\d/.test(v)) return false;
  if(/^fee$/i.test(v)) return false;
  if(ESCENARIO_BANNER_RE.test(v)) return false;
  if(v.length < 2) return false;
  // Filas de notas/comentarios: prosa larga o patrón "Marca: nota" — no son
  // creadores ("Knorr: sigue con barrio", "Hellmanns: partner con NBA...").
  if(v.length > 40) return false;
  if(v.includes(':')) return false;
  return true;
}

// Parse escenario rows into structured creators + ugc + campaign goal
function parseEscenarioRows(rows) {
  if(!rows || !rows.length) return { creators: [], ugc: null, goal: null };
  const num = parseLocaleNumber;
  const get = (r, ...keys) => {
    const n = s => String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[_\s]+/g,' ').trim();
    for(const k of keys){ const kn=n(k); for(const rk of Object.keys(r)){ if(n(rk)===kn && r[rk]!=null && r[rk]!=='') return r[rk]; } }
    return '';
  };

  const COMUNIDAD_K = ['COMUNIDADES','Comunidades','Comunidad'];
  const COHORTS_K   = ['COHORTS','COHORT','Cohorts','Cohort'];
  // Identidad del creador: NOMBRE(S) primero; PODCAST/SHOW como fallback para
  // escenarios de podcast donde el nombre del show es la identidad de la fila.
  const NOMBRE_K    = ['NOMBRE','Nombre','Creador','Influencer','NOMBRES','Nombres','TALENTO','Talento','PERFIL','Perfil','CUENTA','Cuenta','PODCAST','Podcast','SHOW','Show'];
  const PLATFORM_K  = ['PLATAFORMA','Platform','PLATFORM','Red Social','RED','Canal de publicación'];
  const TIER_K      = ['TIER','Tier'];
  const SEG_K       = ['SEGUIDORES','Seguidores','FOLLOWERS','Followers'];
  const CONT_K      = ['CONTENIDO','Contenido','TIPO DE CONTENIDO','Tipo de Contenido','FORMATO','Formato'];
  const CANT_K      = ['CANTIDAD DE CONTENIDO','Cantidad de Contenido','CANTIDAD DE CONTENIDOS','Cantidad de Contenidos','# CONTENIDOS','No. Contenidos','Cantidad'];
  const VIEWS_EST_K = ['VIEWS ESTIMADAS TOTALES','Views Estimadas Totales','VIEWS ESTIMADOS TOTALES','VIEWS TOTALES ESTIMADAS','VIEWS ESTIMADAS','Views Estimadas','VIEWS EST TOTALES'];
  const REACH_EST_K = ['ALCANCE X POSTEO ESTIMADO','Alcance x Posteo Estimado','ALCANCE ESTIMADO','IMPRESIONES ESTIMADOS TOTALES','IMPRESIONES ESTIMADAS TOTALES'];
  const ENG_EST_K   = ['INTERACCIONES ESTIMADAS TOTALES','Interacciones Estimadas Totales','INTERACCIONES TOTALES ESTIMADAS','INTERACCIONES ESTIMADAS','ENGAGEMENT ESTIMADO TOTAL'];
  const ENG_RATE_K  = ['ENGAGEMENT RATE PROMEDIO','Engagement Rate Promedio','ENGAGEMENT RATE','ER PROMEDIO','ER'];
  const COSTO_K     = ['COSTO','Costo','COSTO CERRADO','Costo Cerrado','COSTO TOTAL CAMPAÑA','Costo Total Campaña','COSTO TOTAL','Costo Total'];
  const COSTO_PAUTA_K = ['Costo pauta','COSTO PAUTA'];
  const COSTO_CONT_K  = ['Costo contenidos','COSTO CONTENIDOS'];

  // Forward-fill creator identity across rows where NOMBRE / COMUNIDADES /
  // COHORTS are blank (merged cells). But STOP forward-fill when we hit a
  // banner / UGC / goal row — those are terminal markers, not creators that
  // continue across blank rows.
  let lastNombre = '', lastComunidad = '', lastCohorts = '';
  const filled = rows.map(r => {
    let nm = String(get(r, ...NOMBRE_K)||'').trim();
    const cm = String(get(r, ...COMUNIDAD_K)||'').trim();
    const ch = String(get(r, ...COHORTS_K)||'').trim();
    // Some summary rows put the label in COMUNIDADES / COHORTS instead of
    // NOMBRE (e.g. "BIG NUMBERS ABD", "TOTAL", "TOTALES"). Also scan the
    // first ~4 cells of the row for a totals keyword so the goal row is
    // detected no matter which column the label landed in.
    if(!nm) {
      const candidates = [cm, ch].filter(Boolean);
      // Walk first 4 raw values too (header-agnostic — for unmerged totals rows)
      const firstCells = Object.values(r).slice(0,4).map(v => String(v||'').trim()).filter(Boolean);
      candidates.push(...firstCells);
      const hit = candidates.find(v => ESCENARIO_BANNER_RE.test(v) || /^ugc$/i.test(v) || ESCENARIO_GOAL_RE.test(v));
      if(hit) nm = hit;
    }
    if(nm) {
      const isTerminal = /^ugc$/i.test(nm) || ESCENARIO_BANNER_RE.test(nm);
      if(isTerminal) { lastNombre = ''; lastComunidad = ''; lastCohorts = ''; }
      else { lastNombre = nm; }
      // Return THIS row's own NOMBRE so banners/UGC are detected on their own row
      return { _raw:r, _nombre:nm, _comunidad:cm||lastComunidad, _cohorts:ch||lastCohorts };
    }
    if(cm) lastComunidad = cm;
    if(ch) lastCohorts = ch;
    return { _raw:r, _nombre:lastNombre, _comunidad:lastComunidad, _cohorts:lastCohorts };
  });

  let goal = null, ugc = null;
  let _expectGoalValuesNextRow = false; // true after a label-only goal banner
  const byCreator = new Map(); // key: nombre → creator obj
  const skipped = [];           // diagnostic: rows that did not become creators

  filled.forEach((f, idx) => {
    const r = f._raw;
    const nm = f._nombre;
    if(!nm) {
      // If the previous row was a label-only goal banner (e.g. just
      // "BIG NUMBERS ABD" with no numbers), this row likely carries the
      // actual totals — try to read them as the goal.
      if(_expectGoalValuesNextRow) {
        _expectGoalValuesNextRow = false;
        const candidate = {
          name: 'Totales',
          totalContenidos: num(get(r, ...CANT_K)),
          totalSeguidores: num(get(r, 'TOTAL DE SEGUIDORES','Total de Seguidores')),
          viewsEstTotal:   num(get(r, ...VIEWS_EST_K)),
          engagementEst:   num(get(r, ...ENG_EST_K)),
          engagementRate:  num(get(r, ...ENG_RATE_K)),
          costoTotal:      num(get(r, ...COSTO_K)),
        };
        const score = (candidate.totalContenidos + candidate.viewsEstTotal + candidate.engagementEst + candidate.costoTotal);
        if(score > 0) { goal = candidate; return; }
      }
      // Row has no resolvable creator. Skip silently unless it carries data —
      // surface as a diagnostic so the user can spot merged-cell gaps.
      const looksLikeData = ['PLATAFORMA','PLATFORM','CONTENIDO','CANTIDAD DE CONTENIDO','VIEWS ESTIMADAS TOTALES']
        .some(k => Object.keys(r).some(rk => rk.toUpperCase().includes(k) && String(r[rk]||'').trim()));
      if(looksLikeData) skipped.push({reason:'sin nombre', idx, sample: Object.values(r).slice(0,6).join(' | ')});
      return;
    }

    // Goal row → campaign target totals. Multiple candidates can match
    // (header banner + a separate populated totals row). Per user spec,
    // we want the row with the LARGEST single existing total — never the
    // sum of multiple rows. We pick per-metric max across all matching
    // rows so the goal carries the bigger of any duplicate values found.
    if(ESCENARIO_GOAL_RE.test(nm)) {
      const candidate = {
        name: nm,
        totalContenidos: num(get(r, ...CANT_K)),
        totalSeguidores: num(get(r, 'TOTAL DE SEGUIDORES','Total de Seguidores')),
        viewsEstTotal:   num(get(r, ...VIEWS_EST_K)),
        engagementEst:   num(get(r, ...ENG_EST_K)),
        engagementRate:  num(get(r, ...ENG_RATE_K)),
        costoTotal:      num(get(r, ...COSTO_K)),
      };
      const score = g => g ? (g.totalContenidos + g.viewsEstTotal + g.engagementEst + g.costoTotal) : 0;
      if(score(candidate) > 0) {
        if(!goal) goal = candidate;
        else {
          // Take the larger value PER FIELD, not the sum. This handles
          // sheets where one banner has totals and a later row repeats
          // (or extends) them: we never double-count, we just keep the
          // bigger reference for each KPI.
          goal = {
            name: candidate.name || goal.name,
            totalContenidos: Math.max(goal.totalContenidos, candidate.totalContenidos),
            totalSeguidores: Math.max(goal.totalSeguidores, candidate.totalSeguidores),
            viewsEstTotal:   Math.max(goal.viewsEstTotal,   candidate.viewsEstTotal),
            engagementEst:   Math.max(goal.engagementEst,   candidate.engagementEst),
            engagementRate:  Math.max(goal.engagementRate,  candidate.engagementRate),
            costoTotal:      Math.max(goal.costoTotal,      candidate.costoTotal),
          };
        }
        _expectGoalValuesNextRow = false;
      } else {
        _expectGoalValuesNextRow = true; // label-only header, read next row
      }
      return;
    }

    // UGC special bucket
    if(/^ugc$/i.test(nm)) {
      const cost = num(get(r, ...COSTO_K)) || (num(get(r, ...COSTO_PAUTA_K)) + num(get(r, ...COSTO_CONT_K)));
      ugc = {
        cantidadCreadores: parseInt(String(get(r, 'PERFILES','LINK','perfiles')||'').replace(/[^0-9]/g,''))||0,
        cantidadContenidos: num(get(r, ...CANT_K)),
        tier: get(r, ...TIER_K) || 'NANO',
        costo: cost,
      };
      // If LINK column had "300 PERFILES", parse perfil count
      const linkCell = get(r, 'LINK','Link');
      const pm = String(linkCell||'').match(/(\d+)\s*perfil/i);
      if(pm) ugc.cantidadCreadores = parseInt(pm[1]);
      return;
    }

    // Drop banners (BUDGET / AURORA / RESUMEN / TOTAL etc.)
    if(!_escenarioIsCreatorName(nm)) { skipped.push({reason:'banner', nombre:nm}); return; }

    // Real creator row
    if(!byCreator.has(nm)) {
      byCreator.set(nm, {
        nombre: nm,
        comunidad: f._comunidad,
        cohorts: f._cohorts,
        tier: get(r, ...TIER_K) || '',
        seguidoresMax: num(get(r, ...SEG_K)),
        platforms: [],   // [{platform, contenido, cantidad, viewsEst, reachEst, engEst, engRate, costo}]
        viewsEstTotal: 0,
        reachEstTotal: 0,
        engagementEstTotal: 0,
        contenidosTotal: 0,
        costoTotal: 0,
      });
    }
    const cr = byCreator.get(nm);
    const plat = get(r, ...PLATFORM_K);
    const cont = get(r, ...CONT_K);
    const cantidad = num(get(r, ...CANT_K));
    const viewsEst = num(get(r, ...VIEWS_EST_K));
    const reachEst = num(get(r, ...REACH_EST_K));
    const engEst   = num(get(r, ...ENG_EST_K));
    const engRate  = num(get(r, ...ENG_RATE_K));
    const costoRow = num(get(r, ...COSTO_K)) || (num(get(r, ...COSTO_PAUTA_K)) + num(get(r, ...COSTO_CONT_K)));
    if(plat || cont || cantidad || viewsEst) {
      cr.platforms.push({
        platform: String(plat||'').trim(),
        contenido: String(cont||'').trim(),
        cantidad, viewsEst, reachEst, engEst, engRate, costo: costoRow,
      });
      cr.viewsEstTotal       += viewsEst;
      cr.reachEstTotal       += reachEst;
      cr.engagementEstTotal  += engEst;
      cr.contenidosTotal     += cantidad;
      cr.costoTotal          += costoRow;
    }
    if(!cr.seguidoresMax) cr.seguidoresMax = num(get(r, ...SEG_K));
    if(!cr.tier) cr.tier = get(r, ...TIER_K);
  });

  // Descarta "creadores" sin sustancia (filas de notas que pasaron los
  // filtros de nombre pero no traen plataforma ni contenidos ni views).
  const creators = Array.from(byCreator.values()).filter(cr =>
    cr.contenidosTotal > 0 || cr.platforms.some(p => p.platform) || cr.viewsEstTotal >= 1000
  );
  return { creators, ugc, goal, skipped, totalRows: rows.length };
}

// Extract per-creator real metrics from previously loaded cachedMetrics rows
function _escenarioRealMetricsByCreator(campaign) {
  const rows = (campaign && campaign.cachedMetrics) || [];
  // Memo: parsear métricas es O(filas×columnas) — cachear por campaña
  if(campaign && campaign._memoRealMetrics && campaign._memoRealMetricsStamp === rows.length) {
    return campaign._memoRealMetrics;
  }
  const out = new Map();
  if(campaign) { campaign._memoRealMetrics = out; campaign._memoRealMetricsStamp = rows.length; }
  if(!rows.length) return out;
  const norm = s => String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[_\s@]+/g,' ').trim();
  const get = (r, ...keys) => { for(const k of keys){ const kn=norm(k); for(const rk of Object.keys(r)){ if(norm(rk)===kn && r[rk]) return r[rk]; } } return ''; };
  const num = parseLocaleNumber;
  rows.forEach(r => {
    const name = String(get(r,'Influencer Name','Influencer','Creator','Creador','Cuenta','NOMBRE','Nombre','Handle','Perfil')||'').trim();
    if(!name) return;
    const key = norm(name);
    if(!out.has(key)) out.set(key, { views:0, engagement:0, posts:0, name });
    const o = out.get(key);
    o.views      += num(get(r,'Views','Vistas','organic views','Total Views','Impresiones','Impressions','Reproducciones','Plays','Visualizaciones','Video Views'));
    const bd = num(get(r,'Likes','Me gusta','organic likes'))
             + num(get(r,'Comments','Comentarios','organic comments'))
             + num(get(r,'Shares','Compartidos','organic shares','Retweets','Reposts'))
             + num(get(r,'Saves','Guardados','Saved','organic saves'));
    o.engagement += bd>0 ? bd : num(get(r,'Engagement','Interacciones','Interactions','Total Engagement','Engagements'));
    o.posts      += 1;
  });
  return out;
}

// Color helper: green / yellow / red by completion %
function _semaforo(pct) {
  const n = (typeof pct === 'number' && isFinite(pct)) ? pct : 0;
  if(n >= 80) return { color:'#166534', bg:'#bbf7d0', label:'≥80%' };
  if(n >= 40) return { color:'#854d0e', bg:'#fef08a', label:'40-80%' };
  return { color:'#991b1b', bg:'#fecaca', label:'<40%' };
}

let _escRankMetric = 'cpv'; // 'cpv' | 'cpi' — eficiencia ranking sort
function setEscRankMetric(cid, metric) {
  _escRankMetric = metric;
  const c = _cache.campaigns.find(x=>x.id===cid);
  if(c) renderEscenarioBlock(c);
}

function renderEscenarioBlock(c) {
  const wrap = document.getElementById('escenarioBlock');
  if(!wrap) return;
  // Restore input + sync time
  const urlInp = document.getElementById('escenarioSheetsUrl');
  if(urlInp) urlInp.value = c.escenarioSheetUrl || '';
  const syncEl = document.getElementById('escenarioLastSync');
  if(syncEl && c.escenarioLastSync) {
    syncEl.textContent = 'Última sync: ' + new Date(c.escenarioLastSync).toLocaleString('es-MX',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
  }
  // Derivar escenarioRows desde un escenario armado en plataforma si hace falta
  // (cubre escenarios guardados antes de esta feature).
  _ensureEscenarioRows(c);
  // Lock Google-Sheets input when the scenario was built in-platform
  const _sheetsBar = document.getElementById('escenarioSheetsBar');
  const _appNotice = document.getElementById('escenarioAppNotice');
  if(_sheetsBar && _appNotice) {
    const hasAppScenario = !!(c.scenario && c.scenario.creators && c.scenario.creators.length);
    const builtInApp = c.escenarioSource !== 'sheets' && (c.escenarioSource === 'app' || hasAppScenario);
    _sheetsBar.style.display = builtInApp ? 'none' : 'flex';
    _appNotice.style.display = builtInApp ? 'flex' : 'none';
  }
  if(!c.escenarioRows || !c.escenarioRows.length) {
    const checked = _escenarioStoreChecked.has(c.id);
    wrap.innerHTML = (c.escenarioSheetUrl || !checked)
      ? `<div class="empty-state"><p>Cargando escenario...</p></div>`
      : `<div class="empty-state" style="padding:14px;"><p style="font-size:12px;">Vincula el escenario para ver views estimadas, contenidos cerrados y costos por creador</p></div>`;
    // 1) First try the saved copy in Firestore (survives reloads, no re-sync).
    //    Guard with id-based Sets so repeated snapshots don't re-trigger and flash.
    if(!checked && !_escenarioLoading.has(c.id)) {
      _escenarioLoading.add(c.id);
      loadEscenarioFromStore(c).then(found => {
        _escenarioStoreChecked.add(c.id);
        _escenarioLoading.delete(c.id);
        if(found) { _rerenderEscenarioIfActive(c.id); }
        else if(c.escenarioSheetUrl && c.escenarioSource!=='app' && !_escenarioFetching.has(c.id)) { _escenarioFetching.add(c.id); _autoFetchEscenario(c.escenarioSheetUrl, c).finally(()=>{_escenarioFetching.delete(c.id);}); }
        else { _rerenderEscenarioIfActive(c.id); }
      });
      return;
    }
    // 2) No saved copy — fall back to live fetch if a URL is linked.
    if(c.escenarioSheetUrl && c.escenarioSource!=='app' && !_escenarioFetching.has(c.id)) { _escenarioFetching.add(c.id); _autoFetchEscenario(c.escenarioSheetUrl, c).finally(()=>{_escenarioFetching.delete(c.id);}); }
    return;
  }
  // Lazy auto-fetch UGC results sheet if linked but uncached
  if(c.ugcSheetUrl && (!c.ugcRows || !c.ugcRows.length) && !c._ugcFetching) {
    c._ugcFetching = true;
    _autoFetchUgc(c.ugcSheetUrl, c).finally(()=>{ c._ugcFetching = false; });
  }
  // Lazy auto-fetch metrics sheet so per-creator real views/engagement
  // show up in the Escenario tab without requiring the user to visit the
  // Métricas tab first.
  if(c.metricsSheetUrl && (!c.cachedMetrics || !c.cachedMetrics.length) && !c._metricsFetching) {
    c._metricsFetching = true;
    _autoFetchMetrics(c.metricsSheetUrl, c).finally(()=>{ c._metricsFetching = false; });
  }

  const parsed = parseEscenarioRows(c.escenarioRows);
  const { creators, ugc, goal, skipped, totalRows } = parsed;
  const ugcRes = (typeof _parseUgcResults==='function') ? _parseUgcResults(c.ugcRows) : null;
  const real = _escenarioRealMetricsByCreator(c);
  const norm = s => String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[_\s@.]+/g,' ').trim();

  // Tolerant lookup: tries exact, then drops leading articles (el/la/los),
  // then falls back to substring containment so "El Crilon" matches
  // "crilon" / "@elcrilon" / "El crilón" / "El Crilon Oficial".
  const stripArticle = s => s.replace(/^(el|la|los|las|the)\s+/, '').trim();
  const _matchCreator = (map, name) => {
    if(!map || !map.size) return null;
    const k = norm(name);
    if(map.has(k)) return map.get(k);
    const k2 = stripArticle(k);
    if(k2 && map.has(k2)) return map.get(k2);
    // First-name token (longest word)
    const tok = k2.split(' ').filter(w => w.length >= 4).sort((a,b)=>b.length-a.length)[0];
    if(tok && map.has(tok)) return map.get(tok);
    // Substring match (both ways), require >=4 chars
    for(const [mk, mv] of map) {
      if(mk.length < 4 || k.length < 4) continue;
      if(mk.includes(k2) || k2.includes(mk) || mk.includes(k) || k.includes(mk)) return mv;
    }
    return null;
  };

  // Augment creators with real metrics + published content count from tracker
  const trackerByCreator = new Map();
  (c.trackerRows||[]).forEach(row => {
    const nm = String(_trackerGet(row, TRACKER_NAME_KEYS)||'').trim();
    if(!nm) return;
    const key = norm(nm);
    if(!trackerByCreator.has(key)) trackerByCreator.set(key, { published:0, total:0 });
    const t = trackerByCreator.get(key);
    t.total += 1;
    const _ec = _trackerStatusOf(row);
    if(_isPublishedStatus(_ec)) t.published += 1;
  });

  const enriched = creators.map(cr => {
    const r = _matchCreator(real, cr.nombre) || { views:0, engagement:0, posts:0 };
    const t = _matchCreator(trackerByCreator, cr.nombre) || { published:0, total:0 };
    const viewsPct = cr.viewsEstTotal>0 ? (r.views/cr.viewsEstTotal)*100 : 0;
    const engPct = cr.engagementEstTotal>0 ? (r.engagement/cr.engagementEstTotal)*100 : 0;
    const contPct = cr.contenidosTotal>0 ? (t.published/cr.contenidosTotal)*100 : 0;
    return { ...cr, real:r, tracker:t, viewsPct, engPct, contPct };
  });

  // Aggregate totals across creators (excluding goal/ugc which are tracked separately)
  const agg = enriched.reduce((a,cr) => ({
    viewsEst: a.viewsEst + cr.viewsEstTotal,
    viewsReal: a.viewsReal + cr.real.views,
    engEst: a.engEst + cr.engagementEstTotal,
    engReal: a.engReal + cr.real.engagement,
    contEst: a.contEst + cr.contenidosTotal,
    contReal: a.contReal + cr.tracker.published,
    costo: a.costo + cr.costoTotal,
  }), { viewsEst:0,viewsReal:0,engEst:0,engReal:0,contEst:0,contReal:0,costo:0 });

  // Campaign-level totals (used for CPV/CPE) prefer campaign.goal (set when
  // the campaign was registered) over BIG NUMBERS row or per-creator sum.
  const cGoal = c.goal || {};
  const totalViewsEstForPct = cGoal.views || (goal && goal.viewsEstTotal) || agg.viewsEst;
  const totalEngEstForPct = cGoal.engagement || (goal && goal.engagementEst) || agg.engEst;
  const totalContEstForPct = cGoal.contenidos || (goal && goal.totalContenidos) || agg.contEst;
  const viewsPctAll = totalViewsEstForPct>0 ? (agg.viewsReal/totalViewsEstForPct)*100 : 0;
  const engPctAll = totalEngEstForPct>0 ? (agg.engReal/totalEngEstForPct)*100 : 0;
  const contPctAll = totalContEstForPct>0 ? (agg.contReal/totalContEstForPct)*100 : 0;

  const fmt = n => formatNum(Math.round(n));
  const fmtMoney = n => n>0 ? '$'+Math.round(n).toLocaleString('es-MX') : '—';
  const pctCell = (pct) => {
    const n = (typeof pct === 'number' && isFinite(pct)) ? pct : 0;
    const s = _semaforo(n);
    return `<span style="display:inline-block;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;background:${s.bg};color:${s.color};">${n.toFixed(0)}%</span>`;
  };

  // UGC contribution (real metrics live in ugcRes; estimate only for contenidos)
  const ugcViewsReal = ugcRes ? ugcRes.views : 0;
  const ugcEngReal   = ugcRes ? ugcRes.engagement : 0;
  const ugcContReal  = ugcRes ? ugcRes.contenidosPublicados : 0;
  const ugcContCerrados = ugc ? (ugc.cantidadContenidos||0) : 0;

  // Combined totals (campaign-wide): AON + UGC.
  // Goal/cerrado side: if the sheet has a populated TOTAL/BIG NUMBERS
  // row, that number is taken as final — it already includes UGC, so
  // we don't add ugcContCerrados (avoids the 350 → 650 double-count).
  const goalPresent = !!(goal && goal.totalContenidos > 0);
  const totalViewsReal = agg.viewsReal + ugcViewsReal;
  const totalEngReal   = agg.engReal + ugcEngReal;
  const totalContReal  = agg.contReal + ugcContReal;
  const totalContGoal  = goalPresent ? totalContEstForPct : (totalContEstForPct + ugcContCerrados);
  const totalContPct   = totalContGoal>0 ? (totalContReal/totalContGoal)*100 : 0;

  const subSplit = (aonVal, ugcVal) => ugcRes
    ? `<div style="font-size:10px;color:var(--text-muted);margin-top:4px;">AON ${fmt(aonVal)} · UGC ${fmt(ugcVal)}</div>` : '';

  const headlineHtml = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-bottom:14px;">
      <div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:12px 14px;">
        <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.8px;">Views${ugcRes?' (AON+UGC)':''}</div>
        <div style="font-size:22px;font-weight:800;line-height:1.1;margin-top:4px;"><span id="escHeadViews" data-dpop="${fmt(totalViewsReal)}">${fmt(totalViewsReal)}</span> <span style="font-size:12px;color:var(--text-muted);font-weight:600;">/ ${fmt(totalViewsEstForPct)} est.</span></div>
        <div style="margin-top:6px;">${pctCell(viewsPctAll)}</div>
        ${subSplit(agg.viewsReal, ugcViewsReal)}
      </div>
      <div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:12px 14px;">
        <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.8px;">Engagement${ugcRes?' (AON+UGC)':''}</div>
        <div style="font-size:22px;font-weight:800;line-height:1.1;margin-top:4px;"><span id="escHeadEng" data-dpop="${fmt(totalEngReal)}">${fmt(totalEngReal)}</span> <span style="font-size:12px;color:var(--text-muted);font-weight:600;">/ ${fmt(totalEngEstForPct)} est.</span></div>
        <div style="margin-top:6px;">${pctCell(engPctAll)}</div>
        ${subSplit(agg.engReal, ugcEngReal)}
      </div>
      <div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:12px 14px;">
        <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.8px;">Contenidos${ugcRes?' (AON+UGC)':''}</div>
        <div style="font-size:22px;font-weight:800;line-height:1.1;margin-top:4px;"><span id="escHeadCont" data-dpop="${totalContReal}">${totalContReal}</span> <span style="font-size:12px;color:var(--text-muted);font-weight:600;">/ ${totalContGoal}</span></div>
        <div style="margin-top:6px;">${pctCell(totalContPct)}</div>
        ${subSplit(agg.contReal, ugcContReal)}
      </div>
      <div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:12px 14px;">
        <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.8px;">Costo total</div>
        <div style="font-size:22px;font-weight:800;line-height:1.1;margin-top:4px;">${fmtMoney(agg.costo + (ugc?ugc.costo:0))}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">${enriched.length} creadores${ugc?` · UGC: ${ugc.cantidadCreadores||'—'} perfiles`:''}</div>
      </div>
    </div>`;

  const tableHtml = `
    <div class="card" style="overflow:visible;">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
        <span class="card-title">Escenario · ${creators.length} creadores</span>
        <span style="font-size:11px;color:var(--text-muted);">${totalRows} filas leídas${skipped&&skipped.length?` · ${skipped.length} omitidas`:''}</span>
      </div>
      <div class="table-wrap">
        <table class="table" style="font-size:12px;">
          <thead><tr>
            <th>Creador</th><th>Tier</th><th>Cerrado</th>
            <th>Views est.</th><th>Views real</th><th>%</th>
            <th>Eng. est.</th><th>Eng. real</th><th>%</th>
            <th>Pubs (tr.)</th><th>%</th>
            <th>Posts (mét.)</th><th>%</th>
            <th>Costo</th>
          </tr></thead>
          <tbody>
            ${enriched.sort((a,b)=>b.viewsEstTotal-a.viewsEstTotal).map(cr => {
              const breakdown = (cr.platforms||[]).map(p => {
                const badge = platformBadge(p.platform);
                const qty = p.cantidad||1;
                const detail = p.contenido ? ` <span style="color:var(--text-muted);">${_esc(p.contenido)}</span>` : '';
                return `<span style="display:inline-flex;align-items:center;gap:4px;">${badge}<span style="font-weight:700;">×${qty}</span>${detail}</span>`;
              }).join('<span style="color:var(--border);margin:0 2px;">·</span>');
              return `<tr>
                <td><div style="font-weight:600;">${_esc(cr.nombre)}</div><div style="font-size:10px;color:var(--text-muted);">${_esc(cr.comunidad)||""}</div></td>
                <td><span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:6px;background:var(--bg);">${cr.tier||'—'}</span></td>
                <td style="font-size:11px;"><div style="display:flex;flex-wrap:wrap;align-items:center;gap:4px;">${breakdown||'—'}</div></td>
                <td style="text-align:right;">${fmt(cr.viewsEstTotal)}</td>
                <td style="text-align:right;font-weight:700;">${fmt(cr.real.views)}</td>
                <td>${pctCell(cr.viewsPct)}</td>
                <td style="text-align:right;">${fmt(cr.engagementEstTotal)}</td>
                <td style="text-align:right;font-weight:700;">${fmt(cr.real.engagement)}</td>
                <td>${pctCell(cr.engPct)}</td>
                <td style="text-align:right;">${cr.tracker.published}/${cr.contenidosTotal}</td>
                <td>${pctCell(cr.contPct)}</td>
                <td style="text-align:right;font-weight:700;">${cr.real.posts||0}/${cr.contenidosTotal}</td>
                <td>${pctCell(cr.contenidosTotal>0 ? ((cr.real.posts||0)/cr.contenidosTotal)*100 : 0)}</td>
                <td style="text-align:right;">${fmtMoney(cr.costoTotal)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;

  // --- Ranking de eficiencia: CPV / CPI por creador (MXN) ---
  // CPV = costo / views reales · CPI = costo / interacciones reales. Menor = mejor.
  const fmtCPX = n => (n>0 && isFinite(n)) ? '$'+n.toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:n<1?4:2}) : '—';
  const rankCreators = enriched
    .filter(cr => cr.costoTotal>0 && (cr.real.views>0 || cr.real.engagement>0))
    .map(cr => ({
      nombre: cr.nombre,
      costo: cr.costoTotal,
      views: cr.real.views,
      eng: cr.real.engagement,
      cpv: cr.real.views>0 ? cr.costoTotal/cr.real.views : Infinity,
      cpi: cr.real.engagement>0 ? cr.costoTotal/cr.real.engagement : Infinity,
    }));
  let _rankMetric = (typeof _escRankMetric!=='undefined') ? _escRankMetric : 'cpv';
  const rankSorted = [...rankCreators].sort((a,b)=>a[_rankMetric]-b[_rankMetric]);
  const rankBestCpv = Math.min(...rankCreators.map(r=>r.cpv).filter(isFinite));
  const rankBestCpi = Math.min(...rankCreators.map(r=>r.cpi).filter(isFinite));
  const rankingHtml = rankCreators.length ? `
    <div class="card" style="margin-top:14px;">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
        <span class="card-title">🏆 Ranking de eficiencia · ${rankCreators.length} creadores (MXN)</span>
        <div style="display:flex;gap:6px;">
          <button class="metrics-tab-pill ${_rankMetric==='cpv'?'active':''}" onclick="setEscRankMetric('${c.id}','cpv')">Por CPV</button>
          <button class="metrics-tab-pill ${_rankMetric==='cpi'?'active':''}" onclick="setEscRankMetric('${c.id}','cpi')">Por CPI</button>
        </div>
      </div>
      <div style="font-size:11px;color:var(--text-muted);padding:0 14px 8px;">CPV = costo ÷ views reales · CPI = costo ÷ interacciones reales. Menor es mejor.</div>
      <div class="table-wrap">
        <table class="table" style="font-size:12px;">
          <thead><tr>
            <th style="text-align:center;">#</th><th>Creador</th>
            <th style="text-align:right;">Costo</th>
            <th style="text-align:right;">Views</th><th style="text-align:right;">CPV</th>
            <th style="text-align:right;">Interac.</th><th style="text-align:right;">CPI</th>
          </tr></thead>
          <tbody>
            ${rankSorted.map((r,i)=>{
              const cpvBest = isFinite(r.cpv) && r.cpv===rankBestCpv;
              const cpiBest = isFinite(r.cpi) && r.cpi===rankBestCpi;
              const medal = i===0?'🥇':i===1?'🥈':i===2?'🥉':(i+1);
              return `<tr${i===0?' style="background:var(--pink-pale);"':''}>
                <td style="text-align:center;font-weight:700;">${medal}</td>
                <td style="font-weight:600;">${_esc(r.nombre)}</td>
                <td style="text-align:right;">${fmtMoney(r.costo)}</td>
                <td style="text-align:right;">${fmt(r.views)}</td>
                <td style="text-align:right;font-weight:700;${cpvBest?'color:#166534;':''}">${fmtCPX(r.cpv)}</td>
                <td style="text-align:right;">${fmt(r.eng)}</td>
                <td style="text-align:right;font-weight:700;${cpiBest?'color:#166534;':''}">${fmtCPX(r.cpi)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>` : '';

  const ugcHtml = (ugc || c.ugcSheetUrl || c.ugcRows) ? `
    <div class="card" style="margin-top:14px;background:var(--pink-pale);border:1px solid var(--pink);">
      <div class="card-header"><span class="card-title">UGC (Nano / Micro)</span></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;padding:6px 14px 14px;">
        <div><div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Perfiles cerrados</div><div style="font-size:20px;font-weight:800;">${ugc?(ugc.cantidadCreadores||'—'):'—'}</div></div>
        <div><div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Contenidos cerrados</div><div style="font-size:20px;font-weight:800;">${ugc?(ugc.cantidadContenidos||'—'):'—'}</div></div>
        <div><div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Tier</div><div style="font-size:20px;font-weight:800;">${ugc?(ugc.tier||'—'):'—'}</div></div>
        <div><div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Costo</div><div style="font-size:20px;font-weight:800;">${ugc?fmtMoney(ugc.costo):'—'}</div></div>
      </div>

      <!-- UGC results sheet sync -->
      <div style="background:var(--white);border-top:1px solid var(--pink);padding:12px 14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <span style="font-size:12px;font-weight:700;color:var(--pink-deep);white-space:nowrap;">📊 Resultados UGC</span>
        <input type="text" id="ugcSheetsUrl" class="form-input" style="flex:1;min-width:180px;font-size:12px;" placeholder="URL del Google Sheet de resultados UGC (incluye #gid=... si es una pestaña)" value="${c.ugcSheetUrl||''}" oninput="saveUgcUrl()">
        <button class="btn btn-ghost btn-sm" onclick="syncUgcResults()" style="white-space:nowrap;">🔄 Sincronizar</button>
        <span id="ugcLastSync" style="font-size:11px;color:var(--text-muted);">${c.ugcLastSync?'Última sync: '+new Date(c.ugcLastSync).toLocaleString('es-MX',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):''}</span>
      </div>

      ${ugcRes ? `
      <div style="padding:14px;">
        <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px;">Resultados reales UGC</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;">
          <div style="background:var(--white);border-radius:10px;padding:10px 12px;">
            <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Publicados</div>
            <div style="font-size:22px;font-weight:800;">${ugcRes.contenidosPublicados} <span style="font-size:11px;color:var(--text-muted);font-weight:600;">/ ${ugc?ugc.cantidadContenidos||'—':'—'}</span></div>
            <div style="margin-top:4px;">${pctCell(ugc&&ugc.cantidadContenidos?(ugcRes.contenidosPublicados/ugc.cantidadContenidos)*100:0)}</div>
          </div>
          <div style="background:var(--white);border-radius:10px;padding:10px 12px;">
            <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Views</div>
            <div style="font-size:22px;font-weight:800;">${fmt(ugcRes.views)}</div>
          </div>
          <div style="background:var(--white);border-radius:10px;padding:10px 12px;">
            <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Engagement</div>
            <div style="font-size:22px;font-weight:800;">${fmt(ugcRes.engagement)}</div>
          </div>
          <div style="background:var(--white);border-radius:10px;padding:10px 12px;">
            <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Creadores activos</div>
            <div style="font-size:22px;font-weight:800;">${ugcRes.creadoresUnicos} <span style="font-size:11px;color:var(--text-muted);font-weight:600;">/ ${ugc?ugc.cantidadCreadores||'—':'—'}</span></div>
          </div>
        </div>
        ${ugcRes.byPlatform && Object.keys(ugcRes.byPlatform).length ? `
        <div style="margin-top:12px;">
          <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px;">Desglose por plataforma</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;">
            ${Object.entries(ugcRes.byPlatform).sort((a,b)=>b[1].posts-a[1].posts).map(([pf,v]) => `
              <div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:8px 12px;font-size:11px;">
                <strong>${pf||'—'}</strong> · ${v.posts} posts · ${fmt(v.views)} views
              </div>`).join('')}
          </div>
        </div>` : ''}
      </div>` : `
      <div style="padding:12px 14px;font-size:11px;color:var(--text-muted);">
        ${c.ugcSheetUrl ? 'Cargando resultados UGC...' : 'Los resultados de UGC los entrega la agencia externa. Vincula el sheet arriba para que el OS los lea y los sume al total de la campaña.'}
      </div>`}
    </div>` : '';

  const dataIssues = (skipped||[]).filter(s => s.reason === 'sin nombre');
  const diagHtml = dataIssues.length ? `
    <details style="margin-top:12px;background:rgba(234,179,8,.08);border:1px solid rgba(234,179,8,.25);border-radius:10px;padding:8px 12px;">
      <summary style="font-size:12px;font-weight:700;color:#854d0e;cursor:pointer;">⚠️ ${dataIssues.length} fila(s) con datos pero sin nombre de creador</summary>
      <div style="font-size:11px;color:var(--text-muted);margin-top:6px;line-height:1.5;">
        Estas filas tienen datos pero el parser no pudo asignarlas a un creador. Suele pasar cuando hay celdas combinadas mal cerradas o filas separadoras vacías. Mantén las celdas unidas en el sheet — el parser hace el "forward-fill" automático, no hace falta separar.
        <ul style="margin:8px 0 0 16px;padding:0;">
          ${dataIssues.slice(0,8).map(s => `<li><code style="font-size:10px;background:var(--bg);padding:2px 6px;border-radius:4px;">fila ${s.idx+1}</code> · ${(s.sample||'').replace(/</g,'&lt;').slice(0,120)}</li>`).join('')}
        </ul>
      </div>
    </details>` : '';
  wrap.innerHTML = headlineHtml + tableHtml + rankingHtml + ugcHtml + diagHtml;
  // Replay digit-pop on headline numbers (idempotent — won't trigger if
  // value hasn't changed since last render)
  try {
    ['escHeadViews','escHeadEng','escHeadCont'].forEach(id => {
      const el = document.getElementById(id);
      if(el) _renderDigitPop(el, el.dataset.dpop || el.textContent);
    });
  } catch(e){}
}

function renderCampaignDocs(c) {
  const docIcons={PDF:ICN_doc,Sheets:ICN_sheet,Doc:ICN_doc,'Presentación':ICN_clipboard,Otro:ICN_paperclip};
  const el = document.getElementById('campaignDocsList');
  el.innerHTML = c.documents.length===0
    ? `<div class="empty-state"><div class="empty-icon">${ICN_paperclip}</div><p>Sin documentos.</p></div>`
    : c.documents.map(d=>`
    <div class="doc-item" ${d.url?`onclick="if(event.target.closest('button,a'))return;window.open('${_esc(_safeUrl(d.url))}','_blank','noopener')" style="cursor:pointer;"`:''}>
      <div class="doc-icon ${d.type==='PDF'?'doc-pdf':'doc-sheets'}">${docIcons[d.type]||ICN_paperclip}</div>
      <div class="doc-info">
        <div class="doc-name">${d.name}${(typeof _docVisToggleHtml==='function')?_docVisToggleHtml(c.id,d):''}</div>
        <div class="doc-campaign">${d.type} · ${formatDateShort(d.date)}</div>
      </div>
      ${d.url?`<a href="${_esc(_safeUrl(d.url))}" target="_blank" rel="noopener" class="card-link">Ver →</a>`:''}
      <button onclick="event.stopPropagation();deleteDoc('${d.id}')" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:12px;padding:4px;"><span class="icn-close"></span></button>
    </div>`).join('');
}

function renderCampaignFlow(c) {
  const statusColors={
    'Completado':'badge-green','Aprobado':'badge-blue','Enviado':'badge-blue',
    'En proceso':'badge-purple','Pendiente aprobación':'badge-orange','Pendiente':'badge-gray'
  };
  document.getElementById('campaignFlowList').innerHTML = c.flowSteps.map((step,i)=>`
    <div class="flow-step">
      <div class="flow-num ${step.status==='Completado'||step.status==='Aprobado'?'done':''}">${i+1}</div>
      <div class="flow-step-name">${step.step}</div>
      <select class="flow-step-select" onchange="updateFlowStep('${c.id}',${i},this.value)">
        ${STATUS_OPTIONS.map(s=>`<option ${s===step.status?'selected':''}>${s}</option>`).join('')}
      </select>
    </div>`).join('');
}

function updateFlowStep(cid, idx, status) {
  const campaigns = getData('campaigns');
  const c = campaigns.find(x=>x.id===cid);
  if(!c) return;
  const stepName = c.flowSteps[idx]?.step || 'paso';
  c.flowSteps[idx].status = status;
  setData('campaigns', campaigns);
  _notifyCampaignSubscribers(c, `${stepName} → ${status}`);
}

// ============================================================
// APROBACIÓN DE CONTENIDOS (flujo borrador→revisión→aprobado→publicado)
// ============================================================
const APPROVAL_STATES = [
  {key:'Borrador',  bg:'#e5e7eb', col:'#374151'},
  {key:'Revisión',  bg:'#fef08a', col:'#854d0e'},
  {key:'Aprobado',  bg:'#bbf7d0', col:'#166534'},
  {key:'Publicado', bg:'#166534', col:'#ffffff'},
];
function _approvalBadge(status) {
  const s = APPROVAL_STATES.find(x=>x.key===status) || APPROVAL_STATES[0];
  return `<span style="font-size:11px;font-weight:700;padding:2px 9px;border-radius:10px;background:${s.bg};color:${s.col};white-space:nowrap;">${s.key}</span>`;
}
function renderCampaignApproval(c) {
  const el = document.getElementById('campaignApprovalList');
  if(!el) return;
  const items = Array.isArray(c.approvalItems) ? c.approvalItems : [];
  if(!items.length) {
    el.innerHTML = `<div class="empty-state" style="padding:18px;"><p>Sin contenidos en aprobación. Agrega el primero para seguir su estado.</p></div>`;
    return;
  }
  el.innerHTML = items.map(it => {
    const stateOpts = APPROVAL_STATES.map(s=>`<option ${s.key===it.status?'selected':''}>${s.key}</option>`).join('');
    const linkHtml = it.link
      ? `<a href="${_esc(it.link)}" target="_blank" rel="noopener" style="color:var(--blue);font-size:12px;">Ver contenido →</a>`
      : `<span style="font-size:12px;color:var(--text-muted);">Sin link</span>`;
    const comments = Array.isArray(it.comments) ? it.comments : [];
    const commentsHtml = comments.length
      ? comments.map(cm=>`<div style="font-size:12px;padding:6px 10px;background:var(--bg);border-radius:8px;margin-top:6px;"><strong>${_esc(cm.user||'?')}</strong> <span style="color:var(--text-muted);font-size:10px;">${cm.at?new Date(cm.at).toLocaleDateString('es-MX',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):''}</span><div style="margin-top:2px;">${_esc(cm.text)}</div></div>`).join('')
      : `<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Sin comentarios</div>`;
    return `<div style="border:1px solid var(--border);border-radius:12px;padding:12px 14px;margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">
        <div>
          <div style="font-weight:700;font-size:13px;">${_esc(it.creator||'Contenido')}${it.platform?` <span style="font-weight:400;color:var(--text-muted);font-size:11px;">· ${_esc(it.platform)}</span>`:''}</div>
          <div style="margin-top:3px;">${linkHtml}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          ${_approvalBadge(it.status)}
          <select class="flow-step-select" onchange="setApprovalStatus('${c.id}','${it.id}',this.value)">${stateOpts}</select>
          <button onclick="deleteApprovalItem('${c.id}','${it.id}')" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:14px;" title="Eliminar">🗑</button>
        </div>
      </div>
      <div style="margin-top:8px;">
        ${commentsHtml}
        <div style="display:flex;gap:8px;margin-top:8px;">
          <input type="text" id="apprComment-${it.id}" class="form-input" style="flex:1;font-size:12px;" placeholder="Añadir comentario..." onkeydown="if(event.key==='Enter')addApprovalComment('${c.id}','${it.id}')">
          <button class="btn btn-ghost btn-sm" onclick="addApprovalComment('${c.id}','${it.id}')">Comentar</button>
        </div>
      </div>
    </div>`;
  }).join('');
}
function openApprovalModal() {
  if(!currentCampaignId) return;
  const ov = document.createElement('div');
  ov.className = 'modal-overlay open';
  ov.id = 'approvalAddModal';
  ov.innerHTML = `<div class="modal" style="max-width:440px;">
    <div class="modal-header"><div class="modal-title">Nuevo contenido</div><button class="modal-close" onclick="document.getElementById('approvalAddModal').remove()"><span class="icn-close"></span></button></div>
    <div class="modal-body" style="padding:18px;">
      <div class="form-group"><label class="form-label">Creador / contenido</label><input type="text" id="apprNewCreator" class="form-input" placeholder="Ej: @crilon · Reel lanzamiento"></div>
      <div class="form-group"><label class="form-label">Plataforma</label><input type="text" id="apprNewPlatform" class="form-input" placeholder="Ej: Instagram, TikTok..."></div>
      <div class="form-group"><label class="form-label">Link (opcional)</label><input type="text" id="apprNewLink" class="form-input" placeholder="https://..."></div>
    </div>
    <div class="modal-footer"><button class="btn btn-ghost" onclick="document.getElementById('approvalAddModal').remove()">Cancelar</button><button class="btn btn-primary" onclick="addApprovalItem()">Agregar</button></div>
  </div>`;
  ov.addEventListener('click', e=>{ if(e.target===ov) ov.remove(); });
  document.body.appendChild(ov);
  setTimeout(()=>document.getElementById('apprNewCreator')?.focus(),50);
}
function addApprovalItem() {
  const creator = (document.getElementById('apprNewCreator')?.value||'').trim();
  const platform = (document.getElementById('apprNewPlatform')?.value||'').trim();
  const link = (document.getElementById('apprNewLink')?.value||'').trim();
  if(!creator) { showToast('Indica el creador o contenido','error'); return; }
  const campaigns = getData('campaigns');
  const c = campaigns.find(x=>x.id===currentCampaignId);
  if(!c) return;
  if(!Array.isArray(c.approvalItems)) c.approvalItems = [];
  c.approvalItems.push({ id:'ap'+Date.now().toString(36), creator, platform, link, status:'Borrador', comments:[], createdAt:Date.now() });
  setData('campaigns', campaigns);
  document.getElementById('approvalAddModal')?.remove();
  renderCampaignApproval(c);
  showToast('Contenido agregado','success');
}
function setApprovalStatus(cid, itemId, status) {
  const campaigns = getData('campaigns');
  const c = campaigns.find(x=>x.id===cid);
  if(!c) return;
  const it = (c.approvalItems||[]).find(x=>x.id===itemId);
  if(!it) return;
  it.status = status;
  setData('campaigns', campaigns);
  renderCampaignApproval(c);
  _notifyCampaignSubscribers(c, `${it.creator||'Contenido'} → ${status}`);
}
function addApprovalComment(cid, itemId) {
  const inp = document.getElementById('apprComment-'+itemId);
  const text = (inp?.value||'').trim();
  if(!text) return;
  const campaigns = getData('campaigns');
  const c = campaigns.find(x=>x.id===cid);
  if(!c) return;
  const it = (c.approvalItems||[]).find(x=>x.id===itemId);
  if(!it) return;
  if(!Array.isArray(it.comments)) it.comments = [];
  it.comments.push({ user: currentUserProfile?.name || currentUser?.email || 'Usuario', text, at: Date.now() });
  setData('campaigns', campaigns);
  renderCampaignApproval(c);
}
function deleteApprovalItem(cid, itemId) {
  const campaigns = getData('campaigns');
  const c = campaigns.find(x=>x.id===cid);
  if(!c) return;
  c.approvalItems = (c.approvalItems||[]).filter(x=>x.id!==itemId);
  setData('campaigns', campaigns);
  renderCampaignApproval(c);
}

// ============================================================
// REPORTE DE RESULTADOS (descarga / imprimir → PDF)
// ============================================================
function downloadCampaignReport(cid) {
  const targetId = cid || currentCampaignId || currentMetricsCampaignId;
  const c = (getData('campaigns')||[]).find(x=>x.id===targetId);
  if(!c) { showToast('Abre una campaña primero','error'); return; }
  if(typeof _ensureEscenarioRows==='function') _ensureEscenarioRows(c);
  const fmt = n => formatNum(Math.round(n||0));
  const money = n => n>0 ? '$'+Math.round(n).toLocaleString('es-MX') : '—';
  const cpx = n => (n>0 && isFinite(n)) ? '$'+n.toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:n<1?4:2}) : '—';

  // Parse escenario + real metrics (mirror of renderEscenarioBlock aggregation)
  let creators = [], goal = null, ugc = null;
  try { const p = parseEscenarioRows(c.escenarioRows||[]); creators = p.creators||[]; goal = p.goal; ugc = p.ugc; } catch(e){}
  const real = _escenarioRealMetricsByCreator(c);
  const norm = s => String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[_\s@.]+/g,' ').trim();
  const match = (map,name)=>{ const k=norm(name); if(map.has(k)) return map.get(k); for(const [mk,mv] of map){ if(mk.length>=4&&k.length>=4&&(mk.includes(k)||k.includes(mk))) return mv; } return null; };
  const ugcRes = (typeof _parseUgcResults==='function') ? _parseUgcResults(c.ugcRows) : null;

  const enriched = creators.map(cr => ({ ...cr, real: match(real,cr.nombre)||{views:0,engagement:0,posts:0} }));
  const agg = enriched.reduce((a,cr)=>({views:a.views+cr.real.views, eng:a.eng+cr.real.engagement, cost:a.cost+(cr.costoTotal||0)}),{views:0,eng:0,cost:0});
  const totalViews = agg.views + (ugcRes?ugcRes.views:0);
  const totalEng = agg.eng + (ugcRes?ugcRes.engagement:0);
  const goalViews = (c.goal&&c.goal.views) || (goal&&goal.viewsEstTotal) || enriched.reduce((s,x)=>s+x.viewsEstTotal,0);
  const goalEng = (c.goal&&c.goal.engagement) || (goal&&goal.engagementEst) || enriched.reduce((s,x)=>s+x.engagementEstTotal,0);
  const totalCost = agg.cost + (ugc?ugc.costo:0);

  const ranking = enriched.filter(cr=>cr.costoTotal>0 && cr.real.views>0)
    .map(cr=>({nombre:cr.nombre, cost:cr.costoTotal, views:cr.real.views, eng:cr.real.engagement, cpv:cr.costoTotal/cr.real.views, cpi:cr.real.engagement>0?cr.costoTotal/cr.real.engagement:Infinity}))
    .sort((a,b)=>a.cpv-b.cpv);
  const topCreators = [...enriched].sort((a,b)=>b.real.views-a.real.views).slice(0,10);
  const showCost = (typeof canSeeCosts==='function') ? canSeeCosts() : true;

  // Global efficiency + published-contents progress
  const cpvCamp = totalViews>0 ? totalCost/totalViews : 0;
  const cpeCamp = totalEng>0  ? totalCost/totalEng  : 0;
  const publishedContents = enriched.reduce((s,x)=>s+(x.real.posts||0),0) + (ugcRes?ugcRes.contenidosPublicados:0);
  const closedContents    = enriched.reduce((s,x)=>s+(x.contenidosTotal||0),0) + (ugc?(ugc.cantidadContenidos||0):0);

  // Platform breakdown from real per-post metrics (each cachedMetrics row = 1 post)
  const gp = (r,...keys)=>{ for(const k of keys){ const kn=norm(k); for(const rk of Object.keys(r)){ if(norm(rk)===kn && r[rk]) return r[rk]; } } return ''; };
  const byPlat = {};
  (c.cachedMetrics||[]).forEach(r=>{
    const plat = (String(gp(r,'Plataforma','Platform','Red Social','Red')||'').trim()) || '—';
    const v = parseLocaleNumber(gp(r,'Views','Vistas','Reproducciones','Plays','Visualizaciones','Video Views','Impresiones','Impressions'));
    const bd = parseLocaleNumber(gp(r,'Likes','Me gusta'))+parseLocaleNumber(gp(r,'Comments','Comentarios'))+parseLocaleNumber(gp(r,'Shares','Compartidos','Reposts','Retweets'))+parseLocaleNumber(gp(r,'Saves','Guardados'));
    const e = bd>0?bd:parseLocaleNumber(gp(r,'Engagement','Interacciones','Interactions'));
    if(!byPlat[plat]) byPlat[plat]={posts:0,views:0,eng:0};
    byPlat[plat].posts++; byPlat[plat].views+=v; byPlat[plat].eng+=e;
  });
  const platRows = Object.entries(byPlat).sort((a,b)=>b[1].views-a[1].views);

  const pct = (r,e)=> e>0 ? Math.round((r/e)*100)+'%' : '—';
  const kpiCard = (label,val,sub)=>`<div class="kpi"><div class="kl">${label}</div><div class="kv">${val}</div>${sub?`<div class="ks">${sub}</div>`:''}</div>`;
  const today = new Date().toLocaleDateString('es-MX',{day:'2-digit',month:'long',year:'numeric'});

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Reporte · ${_esc(c.name)}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;}
    body{color:#1a1a1a;padding:40px;max-width:920px;margin:0 auto;}
    .cover{border-bottom:4px solid #ff2d87;padding-bottom:20px;margin-bottom:28px;}
    h1{font-size:30px;color:#ff2d87;}
    .meta{color:#666;font-size:14px;margin-top:6px;}
    h2{font-size:16px;margin:28px 0 12px;text-transform:uppercase;letter-spacing:1px;color:#444;border-left:4px solid #ff2d87;padding-left:10px;}
    .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;}
    .kpi{border:1px solid #e5e5e5;border-radius:12px;padding:14px;}
    .kl{font-size:10px;text-transform:uppercase;color:#888;letter-spacing:.6px;font-weight:700;}
    .kv{font-size:24px;font-weight:800;margin-top:4px;}
    .ks{font-size:11px;color:#666;margin-top:2px;}
    table{width:100%;border-collapse:collapse;font-size:12px;margin-top:8px;}
    th,td{text-align:left;padding:7px 8px;border-bottom:1px solid #eee;}
    th{background:#faf0f5;font-size:10px;text-transform:uppercase;color:#666;}
    td.r,th.r{text-align:right;}
    .foot{margin-top:36px;font-size:11px;color:#999;text-align:center;border-top:1px solid #eee;padding-top:14px;}
    @media print{body{padding:0;}.noprint{display:none;}}
  </style></head><body>
  <div class="cover">
    <h1>${_esc(c.name)}</h1>
    <div class="meta">${_esc(c.client||'')}${c.season?' · '+_esc(c.season):''} · Reporte generado ${today}</div>
    ${c.objective?`<div class="meta">Objetivo: ${_esc(c.objective)}</div>`:''}
  </div>
  <h2>Resultados clave</h2>
  <div class="kpis">
    ${kpiCard('Views', fmt(totalViews), goalViews>0?`Meta ${fmt(goalViews)} · ${pct(totalViews,goalViews)}`:'')}
    ${kpiCard('Interacciones', fmt(totalEng), goalEng>0?`Meta ${fmt(goalEng)} · ${pct(totalEng,goalEng)}`:'')}
    ${kpiCard('Contenidos publicados', `${fmt(publishedContents)}${closedContents>0?` / ${fmt(closedContents)}`:''}`, closedContents>0?pct(publishedContents,closedContents)+' del plan':'piezas live')}
    ${kpiCard('Creadores', String(enriched.length), ugc&&ugc.cantidadCreadores?`+ ${ugc.cantidadCreadores} UGC`:'')}
    ${showCost?kpiCard('CPV', cpx(cpvCamp),'costo / vista'):''}
    ${showCost?kpiCard('CPE', cpx(cpeCamp),'costo / interacción'):''}
    ${showCost?kpiCard('Inversión', money(totalCost),'MXN'):''}
  </div>
  ${platRows.length?`<h2>Avance por plataforma</h2>
  <table><thead><tr><th>Plataforma</th><th class="r">Posts</th><th class="r">Views</th><th class="r">Interac.</th><th class="r">% views</th></tr></thead><tbody>
    ${platRows.map(([p,d])=>`<tr><td>${_esc(p)}</td><td class="r">${fmt(d.posts)}</td><td class="r">${fmt(d.views)}</td><td class="r">${fmt(d.eng)}</td><td class="r">${pct(d.views,totalViews)}</td></tr>`).join('')}
  </tbody></table>`:''}
  <h2>Top creadores por views</h2>
  <table><thead><tr><th>Creador</th><th class="r">Views</th><th class="r">Interac.</th><th class="r">Views est.</th><th class="r">%</th></tr></thead><tbody>
    ${topCreators.map(cr=>`<tr><td>${_esc(cr.nombre)}</td><td class="r">${fmt(cr.real.views)}</td><td class="r">${fmt(cr.real.engagement)}</td><td class="r">${fmt(cr.viewsEstTotal)}</td><td class="r">${pct(cr.real.views,cr.viewsEstTotal)}</td></tr>`).join('')||'<tr><td colspan="5">Sin datos de métricas reales.</td></tr>'}
  </tbody></table>
  ${showCost&&ranking.length?`<h2>Ranking de eficiencia (MXN)</h2>
  <table><thead><tr><th>#</th><th>Creador</th><th class="r">Costo</th><th class="r">CPV</th><th class="r">CPI</th></tr></thead><tbody>
    ${ranking.map((r,i)=>`<tr><td>${i+1}</td><td>${_esc(r.nombre)}</td><td class="r">${money(r.cost)}</td><td class="r">${cpx(r.cpv)}</td><td class="r">${cpx(r.cpi)}</td></tr>`).join('')}
  </tbody></table>`:''}
  <div class="foot">Campaign Manager OS · Think Y</div>
  <div class="noprint" style="text-align:center;margin-top:24px;"><button onclick="window.print()" style="background:#ff2d87;color:#fff;border:none;padding:12px 28px;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;">Descargar / Imprimir PDF</button></div>
  </body></html>`;

  const w = window.open('', '_blank');
  if(!w) { showToast('Permite ventanas emergentes para descargar el reporte','error'); return; }
  w.document.write(html);
  w.document.close();
  showToast('Reporte generado','success');
}

// ============================================================
// PENDIENTES
// ============================================================
let _trackerAllRows = [];
let _trackerBatchFilter = 'all';
let _trackerStatusFilter = null;
let _trackerTimeView = 'week'; // 'week' | 'month' — timeline grouping
function setTrackerTimeView(v) { _trackerTimeView = v; _renderTrackerSummaryAndTable(); }
let _trackerShowBoost = true; // toggle: incluir línea/columna "con boost"
function setTrackerShowBoost(v) { _trackerShowBoost = v; _renderTrackerSummaryAndTable(); }

// Carga html2canvas bajo demanda (sin dependencia permanente) para exportar PNG.
let _html2canvasPromise = null;
function _loadHtml2Canvas() {
  if(window.html2canvas) return Promise.resolve(window.html2canvas);
  if(_html2canvasPromise) return _html2canvasPromise;
  _html2canvasPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
    s.integrity = 'sha384-ZZ1pncU3bQe8y31yfZdMFdSpttDoPmOZg2wguVK9almUodir1PghgT0eY7Mrty8H';
    s.crossOrigin = 'anonymous';
    s.onload = () => resolve(window.html2canvas);
    s.onerror = () => { _html2canvasPromise = null; reject(new Error('No se pudo cargar html2canvas')); };
    document.head.appendChild(s);
  });
  return _html2canvasPromise;
}
async function downloadTrackerTablePng() {
  const el = document.getElementById('trackerWeeklyTableCard');
  if(!el) { showToast('No hay tabla para exportar','error'); return; }
  showToast('Generando PNG...');
  try {
    const h2c = await _loadHtml2Canvas();
    const bg = getComputedStyle(document.body).getPropertyValue('--white').trim() || '#ffffff';
    const canvas = await h2c(el, { backgroundColor: bg, scale: 2, useCORS: true, ignoreElements: n => n.hasAttribute && n.hasAttribute('data-noexport') });
    const a = document.createElement('a');
    a.download = 'tabla-publicaciones.png';
    a.href = canvas.toDataURL('image/png');
    a.click();
    showToast('PNG descargado','success');
  } catch(e) {
    showToast('Error exportando PNG: '+e.message,'error');
  }
}
// Exporta el gráfico SVG de publicaciones a PNG (respeta semana/mes + boost
// porque captura el SVG ya renderizado). Resuelve las CSS vars a color real.
function downloadTrackerChartPng() {
  const svg = document.getElementById('trackerChartSvg');
  if(!svg) { showToast('No hay gráfico para exportar','error'); return; }
  try {
    const cs = getComputedStyle(document.body);
    const resolve = v => v.replace(/var\((--[\w-]+)\)/g, (_, n) => (cs.getPropertyValue(n).trim() || '#000'));
    const clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.querySelectorAll('*').forEach(el => {
      ['stroke','fill'].forEach(attr => {
        const val = el.getAttribute(attr);
        if(val && val.includes('var(')) el.setAttribute(attr, resolve(val));
      });
    });
    const W = parseFloat(svg.getAttribute('width')) || svg.viewBox.baseVal.width || 600;
    const H = parseFloat(svg.getAttribute('height')) || svg.viewBox.baseVal.height || 200;
    const xml = new XMLSerializer().serializeToString(clone);
    const url = URL.createObjectURL(new Blob([xml], {type:'image/svg+xml;charset=utf-8'}));
    const img = new Image();
    img.onload = () => {
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = W*scale; canvas.height = H*scale;
      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);
      ctx.fillStyle = cs.getPropertyValue('--white').trim() || '#ffffff';
      ctx.fillRect(0, 0, W, H);
      ctx.drawImage(img, 0, 0, W, H);
      URL.revokeObjectURL(url);
      const a = document.createElement('a');
      a.download = 'grafico-publicaciones.png';
      a.href = canvas.toDataURL('image/png');
      a.click();
      showToast('PNG descargado','success');
    };
    img.onerror = () => { URL.revokeObjectURL(url); showToast('Error generando PNG','error'); };
    img.src = url;
  } catch(e) {
    showToast('Error exportando PNG: '+e.message,'error');
  }
}
let _trackerAutoRefreshTimer = null;
let currentFilter = 'todos';
let filterByUser = '';

function renderPendientes() {
  const campaigns = visibleCampaigns();
  const globalTasks = getData('globalTasks');
  const today = new Date().toISOString().split('T')[0];
  const weekEnd = new Date(); weekEnd.setDate(weekEnd.getDate()+7);
  const weekEndStr = weekEnd.toISOString().split('T')[0];

  // Person filter UI
  const pf = document.getElementById('pendientesPersonFilter');
  if(pf) {
    const allAssignees = [...new Map(allUsers.map(u=>[u.uid,u])).values()];
    pf.innerHTML = [
      `<button class="metrics-tab-pill ${!filterByUser?'active':''}" onclick="setPendientesUser('')">Todos</button>`,
      ...allAssignees.map(u=>`<button class="metrics-tab-pill ${filterByUser===u.uid?'active':''}" onclick="setPendientesUser('${u.uid}')">${memberAvatarHtml(u,16)} ${_esc(u.name||u.email.split('@')[0])}</button>`)
    ].join('');
  }

  const allTasks = [...globalTasks.map(t=>({...t,source:'global'}))];
  campaigns.forEach(c=>c.tasks.forEach(t=>allTasks.push({...t,campaignId:c.id,campaignName:c.name,source:'campaign'})));

  // Recurring task expansion
  const expanded = [];
  allTasks.forEach(t => {
    if(t.recurring && t.recurringDay !== undefined) {
      // Generate virtual instance for current week
      const dayOfWeek = new Date(today).getDay();
      const diff = ((t.recurringDay - dayOfWeek) + 7) % 7;
      const occDate = new Date(today); occDate.setDate(occDate.getDate() + (diff === 0 ? 0 : diff));
      const occStr = occDate.toISOString().split('T')[0];
      const alreadyDoneThisOccurrence = t.lastDoneDate === occStr;
      expanded.push({...t, dueDate: occStr, done: alreadyDoneThisOccurrence, _isRecurring: true});
    } else {
      expanded.push(t);
    }
  });

  // Filter by assigned user
  let myTasks = filterByUser
    ? expanded.filter(t => t.assigneeUid === filterByUser)
    : expanded.filter(t => !t.assigneeUid || t.assigneeUid === currentUser.uid);

  let filtered = myTasks;
  if(currentFilter==='hoy') filtered = myTasks.filter(t=>t.dueDate===today||t._isRecurring&&t.dueDate===today);
  else if(currentFilter==='semana') filtered = myTasks.filter(t=>t.dueDate>=today&&t.dueDate<=weekEndStr);

  // Split into pending and done
  const pending = filtered.filter(t=>!t.done).sort((a,b)=>{
    const p={high:0,medium:1,low:2};
    return (p[a.priority]||1)-(p[b.priority]||1);
  });
  const done = filtered.filter(t=>t.done).sort((a,b)=>{
    const p={high:0,medium:1,low:2};
    return (p[a.priority]||1)-(p[b.priority]||1);
  });

  const prioBadge = (p) => {
    const map = {high:['#fee2e2','#991b1b','Alta'], medium:['#fef9c3','#854d0e','Media'], low:['#dcfce7','#15803d','Baja']};
    const [bg,col,lbl] = map[p]||map.medium;
    return `<span style="font-size:11px;padding:2px 8px;border-radius:10px;background:${bg};color:${col};flex-shrink:0;">${lbl}</span>`;
  };
  const assigneeChip = (t) => {
    if(!t.assignee && !t.assigneeUid) return '';
    const u = allUsers.find(x=>x.uid===t.assigneeUid);
    const name = u ? (u.name||u.email.split('@')[0]) : (t.assignee||'');
    return `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;background:var(--lavender-pale);color:#6a5a9a;border-radius:20px;padding:2px 8px 2px 4px;">
      ${memberAvatarHtml(u||{name,profileEmoji:'',profileGradient:''}, 16)}
      ${name}</span>`;
  };

  const taskRow = (t) => `
    <div class="task-item">
      <div class="task-check ${t.done?'done':''}" onclick="toggleTask('${t.id}','${t.campaignId||''}')"></div>
      <div class="priority-dot priority-${t.priority}"></div>
      <div class="task-info">
        <div class="task-title ${t.done?'done-text':''}">${_esc(t.title)}${t._isRecurring?` <span style="font-size:10px;color:var(--text-muted);">🔄 Semanal</span>`:''}${t.done&&t._isRecurring?` <span style="font-size:10px;color:var(--text-muted);">· listo esta semana</span>`:''}</div>
        <div class="task-meta" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          ${t.campaignName?`<a onclick="openCampaignDetail('${t.campaignId}')" style="color:var(--pink);cursor:pointer;font-weight:600">${t.campaignName}</a>`:''}
          ${t.campaignName?'·':''}
          ${assigneeChip(t)}
          <span>${formatDate(t.dueDate)||'Sin fecha'}</span>
        </div>
      </div>
      ${prioBadge(t.priority)}
      <button class="task-edit-btn" onclick="openEditTaskModal('${t.id}','${t.campaignId||''}')" title="Editar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg></button>
      <button onclick="deleteTask('${t.id}','${t.campaignId||''}')" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:12px;padding:4px;"><span class="icn-close"></span></button>
    </div>`;

  const el = document.getElementById('allTasksList');
  if(!el) return;

  let html = '';
  if(pending.length === 0 && done.length === 0) {
    html = `<div class="empty-state"><p>No tienes pendientes por ahora</p></div>`;
  } else {
    if(pending.length) {
      html += `<div class="card" style="margin-bottom:12px;">
        <div class="card-header"><span class="card-title" style="color:var(--text);">Por resolver (${pending.length})</span></div>
        ${pending.map(t=>taskRow(t)).join('')}
      </div>`;
    }
    if(done.length) {
      html += `<details style="margin-top:4px;">
        <summary style="list-style:none;cursor:pointer;display:flex;align-items:center;gap:8px;padding:10px 14px;background:var(--bg);border-radius:12px;border:1px solid var(--border);font-size:13px;font-weight:600;color:var(--text-muted);user-select:none;">
          <span style="font-size:11px;margin-right:2px;">▶</span> Resueltos (${done.length})
        </summary>
        <div class="card" style="margin-top:6px;">${done.map(t=>taskRow(t)).join('')}</div>
      </details>`;
    }
  }
  el.innerHTML = html;
  setPendientesBadge(pending.length);
}

function setPendientesUser(uid) {
  filterByUser = uid;
  renderPendientes();
}

function toggleTask(tid, cid) {
  let wentDone = false;
  if(cid) {
    const campaigns = getData('campaigns');
    const c = campaigns.find(x=>x.id===cid);
    if(c) {
      const t=c.tasks.find(x=>x.id===tid);
      if(t) {
        if(t.recurring) {
          const today=new Date().toISOString().split('T')[0];
          const wasDone = t.lastDoneDate===today;
          t.lastDoneDate = wasDone ? '' : today;
          wentDone = !wasDone;
        } else { wentDone = !t.done; t.done=!t.done; t.doneAt = t.done ? Date.now() : null; }
      }
      setData('campaigns',campaigns);
    }
  } else {
    const tasks = getData('globalTasks');
    const t = tasks.find(x=>x.id===tid);
    if(t) {
      if(t.recurring) {
        const today=new Date().toISOString().split('T')[0];
        const wasDone = t.lastDoneDate===today;
        t.lastDoneDate = wasDone ? '' : today;
        wentDone = !wasDone;
      } else { wentDone = !t.done; t.done=!t.done; t.doneAt = t.done ? Date.now() : null; }
    }
    setData('globalTasks',tasks);
  }
  if(wentDone) { try { _onTaskDone(tid); } catch(e){ console.warn('task done animation failed:', e); } }
  if(currentPage==='dashboard') renderDashboard();
  else if(currentPage==='pendientes') renderPendientes();
  else if(currentPage==='campannas' && currentCampaignId) {
    const campaigns=getData('campaigns');
    const c=campaigns.find(x=>x.id===currentCampaignId);
    if(c) renderCampaignTasks(c);
  }
}

// Borra automáticamente los pendientes que llevan más de una semana tachados
// (done). Para tareas viejas marcadas done sin timestamp, estampa doneAt=ahora
// la primera vez (les da una semana de gracia en vez de borrarlas de golpe).
const _DONE_TASK_TTL = 7 * 24 * 60 * 60 * 1000; // 1 semana
function _purgeOldDoneTasks() {
  const now = Date.now();
  let stampedGlobal = false, stampedCampaigns = false;

  // Globales
  let gtasks = getData('globalTasks') || [];
  gtasks.forEach(t => { if(t.done && !t.recurring && !t.doneAt) { t.doneAt = now; stampedGlobal = true; } });
  const gKept = gtasks.filter(t => !(t.done && !t.recurring && t.doneAt && (now - t.doneAt) > _DONE_TASK_TTL));
  if(gKept.length !== gtasks.length) { setData('globalTasks', gKept); }
  else if(stampedGlobal) { setData('globalTasks', gtasks); }

  // Por campaña
  const campaigns = getData('campaigns') || [];
  let campaignsChanged = false;
  campaigns.forEach(c => {
    if(!Array.isArray(c.tasks) || !c.tasks.length) return;
    c.tasks.forEach(t => { if(t.done && !t.recurring && !t.doneAt) { t.doneAt = now; stampedCampaigns = true; } });
    const kept = c.tasks.filter(t => !(t.done && !t.recurring && t.doneAt && (now - t.doneAt) > _DONE_TASK_TTL));
    if(kept.length !== c.tasks.length) { c.tasks = kept; campaignsChanged = true; }
  });
  if(campaignsChanged || stampedCampaigns) setData('campaigns', campaigns);
}

function deleteTask(tid, cid) {
  if(cid) {
    const campaigns = getData('campaigns');
    const c = campaigns.find(x=>x.id===cid);
    if(c) { c.tasks=c.tasks.filter(x=>x.id!==tid); setData('campaigns',campaigns); }
  } else {
    const tasks = getData('globalTasks');
    setData('globalTasks',tasks.filter(x=>x.id!==tid));
  }
  if(currentPage==='pendientes') renderPendientes();
  else if(currentPage==='campannas' && currentCampaignId) {
    const campaigns=getData('campaigns');
    const c=campaigns.find(x=>x.id===currentCampaignId);
    if(c) renderCampaignTasks(c);
  }
  else if(currentPage==='dashboard') renderDashboard();
}

function deleteDoc(docId) {
  if(!currentCampaignId) return;
  const campaigns = getData('campaigns');
  const c = campaigns.find(x=>x.id===currentCampaignId);
  if(c) { c.documents=c.documents.filter(d=>d.id!==docId); setData('campaigns',campaigns); renderCampaignDocs(c); }
}

// ============================================================
// METRICS
// ============================================================
let lineChartInst = null, donutChartInst = null, platformChartInst = null, platformShareChartInst = null;
let currentMetricsCampaignId = null;

// Brand colors per known platform; fallback rotates pastel palette.
const PLATFORM_COLORS = {
  instagram:'#e1306c', tiktok:'#000000', youtube:'#ff0000',
  twitter:'#1da1f2', x:'#000000', facebook:'#1877f2',
  linkedin:'#0a66c2', pinterest:'#bd081c', snapchat:'#fffc00',
  twitch:'#9146ff', threads:'#000000', spotify:'#1db954',
};
const _PLATFORM_FALLBACK = ['#ff2d87','#2c6dff','#c6f24a','#ffb3d3','#9b8cff','#ffb86b','#5ed4b0','#f97373'];
function _platformKey(p) {
  return String(p||'').toLowerCase().replace(/[^a-z0-9]/g,'').trim();
}
function _platformLabel(p) {
  const k = _platformKey(p);
  if(!k) return 'Sin plataforma';
  const map = {instagram:'Instagram', ig:'Instagram', tiktok:'TikTok', tt:'TikTok',
    youtube:'YouTube', yt:'YouTube', shorts:'YouTube',
    twitter:'X / Twitter', x:'X / Twitter',
    facebook:'Facebook', fb:'Facebook',
    linkedin:'LinkedIn', pinterest:'Pinterest', snapchat:'Snapchat',
    twitch:'Twitch', threads:'Threads', spotify:'Spotify'};
  return map[k] || (p.charAt(0).toUpperCase()+p.slice(1));
}
function _platformColor(p, idx) {
  const k = _platformKey(p);
  const aliases = {ig:'instagram', tt:'tiktok', yt:'youtube', shorts:'youtube', fb:'facebook'};
  const root = aliases[k] || k;
  return PLATFORM_COLORS[root] || _PLATFORM_FALLBACK[idx % _PLATFORM_FALLBACK.length];
}

function renderMetrics() {
  // If the user is currently viewing a campaign's metrics detail,
  // don't tear it down when this function is called via the realtime
  // listener — just re-render the campaign grid in the background.
  if(!currentMetricsCampaignId) {
    document.getElementById('metricsCampList').style.display = '';
    document.getElementById('metricsCampDetail').style.display = 'none';
  }
  const grid = document.getElementById('metricsCampGrid');
  const camps = visibleCampaigns().filter(c => c.status !== 'Completado');
  if(!camps.length) { grid.innerHTML='<div class="empty-state"><p>Sin campañas activas.</p></div>'; return; }
  grid.innerHTML = camps.map(c=>`
    <div class="campaign-card" onclick="openMetricsCampaign('${c.id}')">
      <div class="campaign-card-header">
        <div>
          <div class="campaign-name">${_esc(c.name)}</div>
          <div class="campaign-client">${c.client||''}</div>
        </div>
        <span class="badge ${statusBadgeClass(c.status)}">${c.status}</span>
      </div>
      <div style="margin-top:12px;display:flex;align-items:center;gap:8px;">
        ${c.metricsSheetUrl
          ? `<span style="font-size:11px;font-weight:700;padding:3px 8px;border-radius:20px;background:var(--mint-pale);color:#3a7a5e;">📊 Sheets vinculado</span>`
          : `<span style="font-size:11px;color:var(--text-muted);">Vincular métricas →</span>`}
      </div>
    </div>`).join('');
}

function openMetricsCampaign(cid) {
  const c = _cache.campaigns.find(x=>x.id===cid);
  if(!c) return;
  currentMetricsCampaignId = cid;
  document.getElementById('metricsCampList').style.display = 'none';
  document.getElementById('metricsCampDetail').style.display = '';
  document.getElementById('metricsCampName').textContent = c.name + (c.client ? ' · ' + c.client : '');

  if(c.metricsSheetUrl) {
    // Linked state
    document.getElementById('metricsNoLink').style.display = 'none';
    document.getElementById('metricsLinked').style.display = '';
    document.getElementById('changeSheetsRow').style.display = 'none';
    const lbl = document.getElementById('sheetsUrlLabel');
    if(lbl) lbl.textContent = '📊 ' + c.metricsSheetUrl.replace(/^https?:\/\/(docs\.google\.com\/)?/,'').substring(0,60) + '…';
    const inp = document.getElementById('sheetsUrlInputChange');
    if(inp) inp.value = c.metricsSheetUrl;
    // Always auto-fetch fresh data (don't rely on cached metrics)
    initEmptyCharts();
    _autoFetchMetrics(c.metricsSheetUrl, c);
  } else {
    // No-link state
    document.getElementById('metricsNoLink').style.display = '';
    document.getElementById('metricsLinked').style.display = 'none';
    const inp = document.getElementById('sheetsUrlInputNew');
    if(inp) inp.value = '';
  }
}

function showChangeSheets() {
  const row = document.getElementById('changeSheetsRow');
  if(row) { row.style.display = ''; document.getElementById('sheetsUrlInputChange').focus(); }
}

function closeMetricsCampDetail() {
  document.getElementById('metricsCampList').style.display = '';
  document.getElementById('metricsCampDetail').style.display = 'none';
  currentMetricsCampaignId = null;
}

function initEmptyCharts() {
  if(lineChartInst) { lineChartInst.destroy(); lineChartInst=null; }
  if(donutChartInst) { donutChartInst.destroy(); donutChartInst=null; }
  if(platformChartInst) { platformChartInst.destroy(); platformChartInst=null; }
  if(platformShareChartInst) { platformShareChartInst.destroy(); platformShareChartInst=null; }
  const lc = document.getElementById('lineChart'); if(!lc) return;
  lineChartInst = new Chart(lc.getContext('2d'),{type:'line',data:{labels:[],datasets:[]},options:{responsive:true}});
  const dc = document.getElementById('donutChart'); if(!dc) return;
  donutChartInst = new Chart(dc.getContext('2d'),{type:'doughnut',data:{labels:['Likes','Comentarios','Shares','Guardados'],datasets:[{data:[45,25,15,15],backgroundColor:['#ff2d87','#2c6dff','#c6f24a','#ffb3d3'],borderWidth:0}]},options:{responsive:true,plugins:{legend:{position:'right'}},cutout:'65%'}});
  const pc = document.getElementById('platformChart');
  if(pc) platformChartInst = new Chart(pc.getContext('2d'),{type:'bar',data:{labels:[],datasets:[]},options:{responsive:true,indexAxis:'y',plugins:{legend:{display:false}},scales:{x:{beginAtZero:true,ticks:{precision:0}}}}});
  const psc = document.getElementById('platformShareChart');
  if(psc) platformShareChartInst = new Chart(psc.getContext('2d'),{type:'doughnut',data:{labels:[],datasets:[]},options:{responsive:true,plugins:{legend:{position:'right'}},cutout:'60%'}});
}

// ---- Multi-tab metrics ----
let _metricsSheetTabs  = [];   // [{title, gid}]
let _selectedMetricsTab = 'all'; // 'all' | gid string
let _metricsCurrentCampaign = null;

function _extractSheetId(url) {
  const m = url.match(/\/spreadsheets\/d\/([^/]+)/);
  return m ? m[1] : null;
}

async function _fetchSheetTabs(sheetId) {
  // Old Sheets v3 feeds API is deprecated/dead. Discover tabs by scraping
  // public HTML for {name,gid} pairs. Falls back gracefully if blocked.
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/htmlview`;
  const res = await fetch(url);
  if(!res.ok) throw new Error(`tabs HTTP ${res.status}`);
  const html = await res.text();
  if(html.trim().startsWith('<!DOCTYPE') === false && !html.includes('sheet-button')) throw new Error('tabs not public');
  const tabs = [];
  const seen = new Set();
  // Pattern: <li ... id="sheet-button-XXXX" ...>NAME</li>
  const re = /id="sheet-button-(\d+)"[^>]*>([^<]+)</g;
  let m;
  while((m = re.exec(html)) !== null) {
    const gid = m[1], title = m[2].trim();
    if(!seen.has(gid)) { seen.add(gid); tabs.push({title, gid}); }
  }
  if(!tabs.length) throw new Error('no tabs parsed');
  return tabs;
}

async function _fetchTabRows(sheetId, gid) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
  const res = await fetch(url);
  if(!res.ok) throw new Error(`tab ${gid} HTTP ${res.status}`);
  const text = await res.text();
  if(text.trim().startsWith('<!')) throw new Error('not public');
  return parseCSV(text);
}

function _renderMetricsTabs() {
  const sel = document.getElementById('metricsTabSelector');
  if(!sel || !_metricsSheetTabs.length) { if(sel) sel.style.display='none'; return; }
  sel.style.display = 'flex';
  sel.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;';
  sel.innerHTML = [
    `<button class="metrics-tab-pill ${_selectedMetricsTab==='all'?'active':''}" onclick="selectMetricsTab('all')">Todas las pestañas</button>`,
    ..._metricsSheetTabs.map(t =>
      `<button class="metrics-tab-pill ${_selectedMetricsTab===t.gid?'active':''}" onclick="selectMetricsTab('${t.gid}')">${_esc(t.title)}</button>`)
  ].join('');
}

async function selectMetricsTab(gid) {
  _selectedMetricsTab = gid;
  _renderMetricsTabs();
  if(!_metricsCurrentCampaign) return;
  initEmptyCharts();
  const sheetId = _extractSheetId(_metricsCurrentCampaign.metricsSheetUrl);
  if(!sheetId) return;
  try {
    let rows;
    if(gid === 'all') {
      const all = await Promise.all(_metricsSheetTabs.map(t => _fetchTabRows(sheetId, t.gid)));
      rows = all.flat();
    } else {
      rows = await _fetchTabRows(sheetId, gid);
    }
    if(rows.length) displayMetrics(rows, _metricsCurrentCampaign);
  } catch(e) { console.warn('selectMetricsTab error:', e.message); }
}

async function _autoFetchMetrics(url, campaign) {
  _metricsCurrentCampaign = campaign;
  _selectedMetricsTab = 'all';
  const sheetId = _extractSheetId(url);
  // Reset tab selector while loading
  const sel = document.getElementById('metricsTabSelector');
  if(sel) sel.style.display = 'none';

  // Try to discover tabs (requires sheet published to web)
  if(sheetId) {
    try {
      _metricsSheetTabs = await _fetchSheetTabs(sheetId);
      _renderMetricsTabs();
      // Fetch all tabs and merge
      const all = await Promise.all(_metricsSheetTabs.map(t => _fetchTabRows(sheetId, t.gid)));
      const rows = all.flat();
      if(rows.length) {
        _cacheMetricsOnCampaign(campaign, rows);
        displayMetrics(rows, campaign);
        return;
      }
    } catch(e) {
      console.warn('Multi-tab fetch failed, falling back to single:', e.message);
      _metricsSheetTabs = [];
      if(sel) sel.style.display = 'none';
    }
  }

  // Fallback: single CSV fetch
  const csvUrl = normalizeCsvUrl(url);
  if(!csvUrl) return;
  try {
    const res = await fetch(csvUrl);
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if(text.trim().startsWith('<!')) throw new Error('not public');
    const rows = parseCSV(text);
    if(rows.length) {
      _cacheMetricsOnCampaign(campaign, rows);
      displayMetrics(rows, campaign);
    }
  } catch(e) {
    console.warn('Auto-fetch metrics failed:', e.message);
  }
}

// Cache parsed metric rows on the campaign IN MEMORY ONLY. We never
// call setData here because:
//  (a) persistCampaigns strips cachedMetrics before writing to Firestore
//      anyway, so the write is wasted work, AND
//  (b) the round-trip fires the campaigns onSnapshot listener, which
//      calls rerenderCurrent(), which on the Métricas page calls
//      renderMetrics() — that function resets the detail view back to
//      the campaign grid, kicking the user out mid-load.
function _cacheMetricsOnCampaign(campaign, rows) {
  if(!campaign || !rows || !rows.length) return;
  campaign.cachedMetrics = rows;
  // Mirror into _cache.campaigns so other code paths see the rows
  // without going through setData/persist.
  try {
    const arr = _cache.campaigns || [];
    const idx = arr.findIndex(x => x.id === campaign.id);
    if(idx !== -1) arr[idx].cachedMetrics = rows;
  } catch(e) {}
  // If the Escenario tab is currently rendered, refresh it so the new
  // views/engagement reales appear without a manual reload.
  try {
    if(currentCampaignId === campaign.id
       && currentPage !== 'metricas'
       && typeof renderEscenarioBlock === 'function') {
      renderEscenarioBlock(campaign);
    }
  } catch(e){}
}

function normalizeCsvUrl(raw) {
  if(!raw) return null;
  // Already a CSV pub URL
  if(raw.includes('output=csv')) return raw;
  // Standard edit URL → convert to pub CSV
  const m = raw.match(/\/spreadsheets\/d\/([^/]+)/);
  if(!m) return null;
  const id = m[1];
  // Extract gid if present
  const gidM = raw.match(/[#&?]gid=(\d+)/);
  const gid = gidM ? '&gid='+gidM[1] : '';
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv${gid}`;
}

async function loadMetrics() {
  const newInp = document.getElementById('sheetsUrlInputNew');
  const chgInp = document.getElementById('sheetsUrlInputChange');
  const raw = ((newInp && newInp.offsetParent) ? newInp.value : (chgInp ? chgInp.value : '')).trim();
  if(!raw) { showToast('Ingresa la URL del Google Sheet','error'); return; }
  const csvUrl = normalizeCsvUrl(raw);
  if(!csvUrl) { showToast('URL de Google Sheets inválida. Copia la URL completa del documento.','error'); return; }
  showToast('Cargando datos...');
  try {
    const res = await fetch(csvUrl);
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if(text.trim().startsWith('<!')) throw new Error('El sheet no es público o no está en formato CSV');
    const rows = parseCSV(text);
    if(!rows.length) throw new Error('No se encontraron filas en el sheet');
    let campaign = null;
    if(currentMetricsCampaignId) {
      const campaigns = getData('campaigns');
      const idx = campaigns.findIndex(x=>x.id===currentMetricsCampaignId);
      if(idx!==-1) {
        campaigns[idx].metricsSheetUrl = raw;
        campaigns[idx].cachedMetrics = rows;
        setData('campaigns', campaigns);
        campaign = campaigns[idx];
        _cache.campaigns = campaigns;
      }
      // Switch to linked state UI
      document.getElementById('metricsNoLink').style.display = 'none';
      document.getElementById('metricsLinked').style.display = '';
      document.getElementById('changeSheetsRow').style.display = 'none';
      const lbl = document.getElementById('sheetsUrlLabel');
      if(lbl) lbl.textContent = '📊 ' + raw.replace(/^https?:\/\/(docs\.google\.com\/)?/,'').substring(0,60) + '…';
      const inp = document.getElementById('sheetsUrlInputChange');
      if(inp) inp.value = raw;
    }
    displayMetrics(rows, campaign);
    showToast('Datos cargados','success');
  } catch(e) {
    const hint = e.message.includes('HTTP')||e.message.includes('público')
      ? 'Asegúrate de que el sheet sea público: Compartir → Cualquier persona con el enlace puede ver.'
      : e.message;
    showToast('Error: '+hint,'error');
    initEmptyCharts();
  }
}

function parseCSV(text) {
  // Full RFC 4180 parser: walks char-by-char so quoted fields can contain
  // commas, embedded newlines, and "" escapes without breaking row alignment.
  const rows = [];
  let cur = '', row = [], inQ = false, fieldStart = true;
  const t = text.replace(/\r\n?/g, '\n');
  for(let i=0; i<t.length; i++) {
    const ch = t[i];
    if(inQ) {
      if(ch === '"') {
        const next = t[i+1];
        if(next === '"') { cur += '"'; i++; }
        // Close quote only if followed by delimiter / newline / EOF.
        // Otherwise treat as a stray quote in user-typed content.
        else if(next === ',' || next === '\n' || next === undefined) { inQ = false; }
        else { cur += '"'; }
      } else cur += ch;
    } else {
      // Opening quote only valid at start of field (RFC 4180); mid-field
      // quotes are kept literal to survive malformed exports.
      if(ch === '"' && fieldStart) { inQ = true; fieldStart = false; }
      else if(ch === ',') { row.push(cur); cur = ''; fieldStart = true; }
      else if(ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; fieldStart = true; }
      else { cur += ch; fieldStart = false; }
    }
  }
  if(cur.length || row.length) { row.push(cur); rows.push(row); }
  while(rows.length && rows[rows.length-1].every(v => !v || !v.trim())) rows.pop();
  if(rows.length < 2) return [];
  // Header row detection — los sheets reales traen encima de los headers
  // filas de banners/agrupación ("INFORMACIÓN DEL TALENTO", nombre del
  // tracker, campañas, meses del calendario…) que están mayormente vacías.
  // Escaneamos las primeras 8 filas y tomamos la PRIMERA cuya densidad de
  // celdas pobladas alcance el 50% del máximo observado: esa es la fila de
  // headers (los headers definen las columnas, así que son tan densos como
  // las filas de datos; los banners no).
  let headerIdx = 0;
  const nonEmpty = r => r.filter(v=>v && v.trim()).length;
  const scan = Math.min(rows.length - 1, 8);
  let maxNE = 0;
  for(let i=0; i<scan; i++) maxNE = Math.max(maxNE, nonEmpty(rows[i]));
  for(let i=0; i<scan; i++){ if(nonEmpty(rows[i]) >= maxNE * 0.5){ headerIdx = i; break; } }
  // Regla legacy: fila meta/categoría densa pero con ≤4 valores únicos
  // repetidos sobre muchas columnas → headers en la siguiente.
  if(headerIdx === 0 && rows.length > 2) {
    const uniqueFirst = new Set(rows[0].map(v=>v.trim()).filter(Boolean));
    if(uniqueFirst.size <= 4 && rows[0].length > 5) headerIdx = 1;
  }
  if(rows.length <= headerIdx + 1) return [];
  const headers = rows[headerIdx].map(h => h.trim());
  const N = headers.length;
  // Normalize every data row to exactly N columns. Rows shorter than N are
  // assumed to be a stray newline inside a previous-row cell (broken quoting):
  // merge them back into the prior row's last cell joined by \n. Rows longer
  // than N have their tail dropped — they can only come from leaked content
  // that no real column can hold.
  const dataRows = rows.slice(headerIdx + 1).filter(r => r.some(v => v && v.trim()));
  const aligned = [];
  for(const r of dataRows) {
    if(r.length < N && aligned.length) {
      const prev = aligned[aligned.length-1];
      prev[prev.length-1] = (prev[prev.length-1]||'') + '\n' + (r[0]||'');
      for(let k=1; k<r.length; k++) prev.push(r[k]);
      // Re-trim if still too short — just leave for next iteration to fix
      continue;
    }
    if(r.length > N) {
      aligned.push(r.slice(0, N));
    } else {
      // Pad short rows that have no prior to attach to
      while(r.length < N) r.push('');
      aligned.push(r);
    }
  }
  // Final pass: collapse any over-long rows accidentally produced by merging
  const final = aligned.map(r => r.length > N ? r.slice(0, N) : r);
  const out = final.filter(r => r.some(v => v && v.trim())).map(vals => {
    const obj = {};
    headers.forEach((h,i) => { obj[h] = (vals[i]||'').trim(); });
    return obj;
  });
  try { console.log('[parseCSV]', { headers:N, rawRows:rows.length, dataRows:dataRows.length, aligned:aligned.length, final:out.length }); } catch(e){}
  return out;
}

// ---- Metrics table filter/sort state + shared row accessors ----
let _metricsRows = [];
let _metricsPlatFilter = null;       // canonical platform label or null
let _metricsSortKey = null;          // 'views'|'reach'|'likes'|'eng'
let _metricsSortDir = 'desc';        // 'desc'|'asc'
function _mGi(r, ...keys){ for(const k of keys){ const kn=k.toLowerCase().replace(/_/g,' '); for(const rk of Object.keys(r)){ if(rk.toLowerCase().replace(/_/g,' ')===kn){ const v=Math.round(parseLocaleNumber(r[rk])); if(v) return v; } } } return 0; }
function _mGs(r, ...keys){ for(const k of keys){ const kn=k.toLowerCase().replace(/_/g,' '); for(const rk of Object.keys(r)){ if(rk.toLowerCase().replace(/_/g,' ')===kn && r[rk]) return r[rk]; } } return '—'; }
function _mViews(r){ return _mGi(r,'Views','Vistas','organic views','Total Views','Impresiones','Impressions','Reproducciones','Plays','Visualizaciones','Video Views'); }
function _mLikes(r){ return _mGi(r,'Organic_Likes','Likes','Me gusta'); }
function _mReach(r){ return _mGi(r,'Organic_Reach','Reach','Alcance'); }
function _mEng(r){ const bd=_mGi(r,'Likes','Me gusta','organic likes')+_mGi(r,'Comments','Comentarios','organic comments')+_mGi(r,'Shares','Compartidos','organic shares')+_mGi(r,'Saves','Guardados','Saved','organic saves'); return bd>0?bd:_mGi(r,'Engagement','Interacciones','Interactions','Total Engagement','Engagements'); }
function _mPlatformLabel(r){ const raw=_mGs(r,'Platform','Plataforma','Red Social','Network','Canal'); return (raw && raw!=='—') ? (_platformLabel(raw)) : 'Sin plataforma'; }

function setMetricsSort(key){
  if(_metricsSortKey===key){ _metricsSortDir = _metricsSortDir==='desc'?'asc':'desc'; }
  else { _metricsSortKey = key; _metricsSortDir='desc'; }
  _renderMetricsTable();
}
function setMetricsPlatformFilter(label){
  _metricsPlatFilter = (_metricsPlatFilter===label) ? null : label;
  _renderMetricsTable();
}
function _renderMetricsTable(){
  const tb = document.getElementById('metricsTable');
  if(!tb) return;
  let view = _metricsRows.slice();
  if(_metricsPlatFilter) view = view.filter(r => _mPlatformLabel(r) === _metricsPlatFilter);
  if(_metricsSortKey){
    const f = { views:_mViews, reach:_mReach, likes:_mLikes, eng:_mEng }[_metricsSortKey];
    view.sort((a,b)=> _metricsSortDir==='desc' ? f(b)-f(a) : f(a)-f(b));
  }
  // Filter pills
  const filterBar = document.getElementById('metricsTableFilters');
  if(filterBar){
    const counts = {};
    _metricsRows.forEach(r=>{ const p=_mPlatformLabel(r); counts[p]=(counts[p]||0)+1; });
    const pills = Object.entries(counts).sort((a,b)=>b[1]-a[1]);
    filterBar.innerHTML = `<button class="metrics-tab-pill ${!_metricsPlatFilter?'active':''}" onclick="setMetricsPlatformFilter(null)">Todas (${_metricsRows.length})</button>` +
      pills.map(([p,n])=>`<button class="metrics-tab-pill ${_metricsPlatFilter===p?'active':''}" onclick="setMetricsPlatformFilter('${String(p).replace(/'/g,"&#39;")}')">${_esc(p)} (${n})</button>`).join('');
  }
  // Sort indicators
  document.querySelectorAll('.m-sort-ind').forEach(el=>{
    el.textContent = (el.dataset.k===_metricsSortKey) ? (_metricsSortDir==='desc'?'▼':'▲') : '';
  });
  tb.innerHTML = view.length ? view.map(r=>`<tr>
    <td>${_esc(_mGs(r,'Influencer Name','Influencer','Creator','Creador','Cuenta'))}</td>
    <td>${_esc(_mGs(r,'Formato','Format','Tipo','Type','Content Type'))}</td>
    <td>${_esc(_mGs(r,'Post Date','Campaign Date','Fecha','Date'))}</td>
    <td>${platformBadge(_mGs(r,'Platform','Plataforma','Red Social','Network','Canal'))}</td>
    <td>${formatNum(_mViews(r))}</td>
    <td>${formatNum(_mReach(r))}</td>
    <td>${formatNum(_mLikes(r))}</td>
    <td>${formatNum(_mEng(r))}</td>
    <td>${_esc(_mGs(r,'ER% Profile Instagram','ER% Profile Tiktok','Engagement Rate','ER','Tasa Engagement'))}</td>
  </tr>`).join('') : `<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:18px;">Sin resultados para este filtro.</td></tr>`;
}

// Legend text color that adapts to light/dark theme (default Chart.js color is
// too dark to read on the dark glass background).
function _chartTextColor(){
  return document.documentElement.classList.contains('dark') ? '#e9e8f0' : '#33333b';
}

// Descarga un chart de la página de métricas como PNG (Chart.js .toBase64Image).
function downloadMetricChart(instanceName, fname) {
  const inst = window[instanceName];
  if(!inst || typeof inst.toBase64Image !== 'function') { showToast('No hay gráfico para exportar','error'); return; }
  try {
    const dataUrl = inst.toBase64Image('image/png', 1);
    const a = document.createElement('a');
    a.download = fname || 'grafico.png';
    a.href = dataUrl; a.click();
    showToast('PNG descargado','success');
  } catch(e) { showToast('Error exportando: '+e.message,'error'); }
}

// Panel "Meta vs Real": cruza totales reales (cachedMetrics) con el estimado
// del escenario para mostrar % completado por views, engagement y contenidos.
function _renderMetricsGoal(c, realViews, realEng, realPosts) {
  const el = document.getElementById('metricsGoalPanel');
  if(!el) return;
  if(!c) { el.innerHTML = ''; return; }
  // Estimados: prioridad campaign.goal -> parseEscenarioRows.goal -> suma de creadores
  let estViews = 0, estEng = 0, estCont = 0;
  if(c.goal) {
    estViews = Number(c.goal.views)||0;
    estEng   = Number(c.goal.engagement)||0;
    estCont  = Number(c.goal.contenidos)||0;
  }
  try {
    if((!estViews || !estEng || !estCont) && c.escenarioRows && c.escenarioRows.length && typeof parseEscenarioRows==='function') {
      const p = parseEscenarioRows(c.escenarioRows);
      if(p.goal) {
        estViews = estViews || (p.goal.viewsEstTotal||0);
        estEng   = estEng   || (p.goal.engagementEst||0);
        estCont  = estCont  || (p.goal.totalContenidos||0);
      }
      if(!estViews || !estEng || !estCont) {
        const sum = (p.creators||[]).reduce((a,cr)=>({
          v:a.v+(cr.viewsEstTotal||0), e:a.e+(cr.engagementEstTotal||0), c:a.c+(cr.contenidosTotal||0)
        }), {v:0,e:0,c:0});
        estViews = estViews || sum.v;
        estEng   = estEng   || sum.e;
        estCont  = estCont  || sum.c;
      }
    }
  } catch(e){}
  if(!estViews && !estEng && !estCont) { el.innerHTML = '<div style="font-size:11px;color:var(--text-muted);padding:8px 4px;">Vincula un escenario para ver % de cumplimiento vs estimado.</div>'; return; }
  const pct = (r,e) => e>0 ? Math.min(999, (r/e)*100) : 0;
  const sem = p => p>=80?{bg:'#bbf7d0',col:'#166534'}:p>=40?{bg:'#fef08a',col:'#854d0e'}:{bg:'#fecaca',col:'#991b1b'};
  const fmt = n => formatNum(Math.round(n||0));
  const bar = (label, real, est) => {
    const p = pct(real, est);
    const s = sem(p);
    const w = Math.min(100, p);
    return `<div style="background:var(--white);border:1px solid var(--border);border-radius:14px;padding:12px 14px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.6px;">${label}</div>
        <div style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;background:${s.bg};color:${s.col};">${p.toFixed(0)}%</div>
      </div>
      <div style="font-size:16px;font-weight:800;color:var(--text);line-height:1.1;">${fmt(real)} <span style="font-size:11px;color:var(--text-muted);font-weight:600;">/ ${fmt(est)} est.</span></div>
      <div style="margin-top:8px;height:6px;border-radius:6px;background:var(--bg);overflow:hidden;">
        <div style="width:${w}%;height:100%;background:linear-gradient(90deg, var(--pink), var(--lavender));"></div>
      </div>
    </div>`;
  };
  el.innerHTML = `
    <div style="background:var(--bg);border:1px solid var(--border);border-radius:14px;padding:14px 16px;">
      <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px;">🎯 Meta vs Real (escenario)</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;">
        ${bar('Views', realViews, estViews)}
        ${bar('Engagement', realEng, estEng)}
        ${bar('Contenidos', realPosts, estCont)}
      </div>
    </div>`;
}

function displayMetrics(rows, campaign) {
  _metricsRows = rows || [];
  _metricsPlatFilter = null; _metricsSortKey = null; _metricsSortDir = 'desc';
  // Case-insensitive, underscore/space-normalized key lookup
  const gi = (r, ...keys) => {
    for(const k of keys) {
      const kn = k.toLowerCase().replace(/_/g,' ');
      for(const rk of Object.keys(r)) {
        if(rk.toLowerCase().replace(/_/g,' ') === kn) {
          const v = Math.round(parseLocaleNumber(r[rk]));
          if(v) return v;
        }
      }
    }
    return 0;
  };
  // Case-insensitive string field lookup
  const gs = (r, ...keys) => {
    for(const k of keys) {
      const kn = k.toLowerCase().replace(/_/g,' ');
      for(const rk of Object.keys(r)) {
        if(rk.toLowerCase().replace(/_/g,' ') === kn && r[rk]) return r[rk];
      }
    }
    return '—';
  };

  let totalViews=0, totalReach=0, totalEngagement=0, totalFollowers=0;
  let totalLikes=0, totalComments=0, totalShares=0, totalSaves=0;
  rows.forEach(r=>{
    totalViews    += gi(r,'Views','Vistas','organic views','Total Views','Impresiones','Impressions','Reproducciones','Plays','Visualizaciones','Video Views');
    totalReach    += gi(r,'Reach','Alcance');
    totalLikes    += gi(r,'Likes','Me gusta','organic likes');
    totalComments += gi(r,'Comments','Comentarios','organic comments');
    totalShares   += gi(r,'Shares','Compartidos','organic shares','Retweets','Reposts');
    totalSaves    += gi(r,'Saves','Guardados','Saved','organic saves');
    totalEngagement += gi(r,'Engagement','Interacciones','Interactions','Total Engagement','Engagements');
    totalFollowers += gi(r,'Followers','Seguidores','Audience','Audiencia','Suscriptores','Subscribers');
  });
  // Sum of the four breakdown columns — used as the engagement total
  // when the sheet has per-row likes / comments / shares / saves but no
  // aggregate "Engagement" column.
  const breakdownSum = totalLikes + totalComments + totalShares + totalSaves;
  if(breakdownSum > 0) totalEngagement = breakdownSum;
  // "Engagement de calidad" = comments + shares + saves (no likes)
  const qualityEng = totalComments + totalShares + totalSaves;

  // Formulas per user spec:
  //   ER    = views ÷ total interactions (likes+shares+saves+comments)
  //   VR    = views ÷ followers
  //   Q/E.R = (shares + saves + comments) ÷ total interactions × 100%
  const er  = totalEngagement>0 ? (totalViews/totalEngagement).toFixed(2) : '—';
  const vr  = totalFollowers>0  ? ((totalViews/totalFollowers)*100).toFixed(2)+'%' : '—';
  const qer = totalEngagement>0 ? ((qualityEng/totalEngagement)*100).toFixed(2)+'%' : '—';
  const budget = campaign ? (campaign.budgetClient||campaign.budget||0) : 0;
  const fmtMXN = n => n>0 ? '$'+Number(n).toFixed(2) : '—';
  const cpv = (budget>0 && totalViews>0)      ? fmtMXN(budget/totalViews)      : '—';
  const cpe = (budget>0 && totalEngagement>0) ? fmtMXN(budget/totalEngagement) : '—';

  _renderDigitPop('mViews',      formatNum(totalViews));
  _renderDigitPop('mEngagement', formatNum(totalEngagement));
  try { _renderMetricsGoal(campaign, totalViews, totalEngagement, rows.length); } catch(e) { console.warn('goal panel', e); }
  _renderDigitPop('mER',         er);
  _renderDigitPop('mVR',         vr);
  if(document.getElementById('mQER')) _renderDigitPop('mQER', qer);
  _renderDigitPop('mCPV',        cpv);
  _renderDigitPop('mCPE',        cpe);

  const rowViews = r => gi(r,'Views','Vistas','organic views','Total Views','Impresiones','Impressions','Reproducciones','Plays','Visualizaciones','Video Views');
  const rowEng   = r => {
    const bd = gi(r,'Likes','Me gusta','organic likes')
             + gi(r,'Comments','Comentarios','organic comments')
             + gi(r,'Shares','Compartidos','organic shares')
             + gi(r,'Saves','Guardados','Saved','organic saves');
    return bd>0 ? bd : gi(r,'Engagement','Interacciones','Interactions','Total Engagement','Engagements');
  };
  _renderMetricsTable();

  if(lineChartInst) lineChartInst.destroy();
  if(donutChartInst) donutChartInst.destroy();
  const labels    = rows.map(r=>gs(r,'Post Date','Campaign Date','Fecha','Date')).filter(v=>v&&v!=='—');
  const viewsData = rows.map(r=>rowViews(r));
  const engData   = rows.map(r=>rowEng(r));
  const lc = document.getElementById('lineChart'); if(!lc) return;
  lineChartInst = new Chart(lc.getContext('2d'),{type:'line',data:{labels,datasets:[
    {label:'Vistas',data:viewsData,borderColor:'#ff2d87',backgroundColor:'rgba(255,45,135,0.1)',tension:.4,fill:true,pointBackgroundColor:'#ff2d87'},
    {label:'Engagement',data:engData,borderColor:'#2c6dff',backgroundColor:'rgba(44,109,255,0.08)',tension:.4,fill:true,pointBackgroundColor:'#2c6dff'}
  ]},options:{responsive:true,plugins:{legend:{position:'top',labels:{color:_chartTextColor()}}},scales:{y:{beginAtZero:true,ticks:{color:_chartTextColor()}},x:{ticks:{color:_chartTextColor()}}}}});
  const dc = document.getElementById('donutChart'); if(!dc) return;
  // Dynamic donut: only show non-zero buckets, no hardcoded fallback
  const donutBuckets = [
    {l:'Likes',v:totalLikes,c:'#ff2d87'},
    {l:'Comentarios',v:totalComments,c:'#2c6dff'},
    {l:'Shares',v:totalShares,c:'#c6f24a'},
    {l:'Guardados',v:totalSaves,c:'#ffb3d3'},
  ].filter(d=>d.v>0);
  const noDonutData = donutBuckets.length === 0;
  donutChartInst = new Chart(dc.getContext('2d'),{type:'doughnut',data:{
    labels: noDonutData ? ['Sin datos'] : donutBuckets.map(d=>d.l),
    datasets:[{
      data: noDonutData ? [1] : donutBuckets.map(d=>d.v),
      backgroundColor: noDonutData ? ['#e5e7eb'] : donutBuckets.map(d=>d.c),
      borderWidth:0,hoverOffset:6
    }]
  },options:{responsive:true,plugins:{legend:{position:'right',labels:{font:{size:12},color:_chartTextColor()}},tooltip:{callbacks:{label:ctx=>{const t=ctx.dataset.data.reduce((a,b)=>a+(Number(b)||0),0)||1;return ` ${ctx.label}: ${formatNum(ctx.parsed)} (${((ctx.parsed/t)*100).toFixed(1)}%)`;}}}},cutout:'65%'}});

  // ----- Platform distribution -----
  const platformCounts = {};
  rows.forEach(r => {
    const raw = gs(r,'Platform','Plataforma','Red Social','Network','Canal');
    const key = raw && raw !== '—' ? _platformLabel(raw) : 'Sin plataforma';
    platformCounts[key] = (platformCounts[key]||0) + 1;
  });
  const pfEntries = Object.entries(platformCounts).sort((a,b)=>b[1]-a[1]);
  const pfLabels  = pfEntries.map(e=>e[0]);
  const pfData    = pfEntries.map(e=>e[1]);
  const pfColors  = pfEntries.map((e,i)=>_platformColor(e[0], i));
  const noPfData  = pfEntries.length === 0;

  if(platformChartInst) platformChartInst.destroy();
  const pc = document.getElementById('platformChart');
  if(pc) {
    platformChartInst = new Chart(pc.getContext('2d'),{
      type:'bar',
      data:{
        labels: noPfData ? ['Sin datos'] : pfLabels,
        datasets:[{
          label:'Contenidos',
          data: noPfData ? [0] : pfData,
          backgroundColor: noPfData ? ['#e5e7eb'] : pfColors,
          borderRadius:8, borderSkipped:false, barThickness:'flex', maxBarThickness:28,
        }]
      },
      options:{
        responsive:true,
        indexAxis:'y',
        onClick:(evt, els)=>{ if(els&&els.length){ const lbl = pfLabels[els[0].index]; setMetricsPlatformFilter(lbl); } },
        plugins:{
          legend:{display:false},
          tooltip:{callbacks:{label:ctx=>` ${ctx.parsed.x} contenido${ctx.parsed.x===1?'':'s'} (click para filtrar)`}}
        },
        scales:{ x:{ beginAtZero:true, ticks:{ precision:0, color:_chartTextColor() } }, y:{ ticks:{ color:_chartTextColor() } } }
      }
    });
  }

  if(platformShareChartInst) platformShareChartInst.destroy();
  const psc = document.getElementById('platformShareChart');
  if(psc) {
    platformShareChartInst = new Chart(psc.getContext('2d'),{
      type:'doughnut',
      data:{
        labels: noPfData ? ['Sin datos'] : pfLabels,
        datasets:[{
          data: noPfData ? [1] : pfData,
          backgroundColor: noPfData ? ['#e5e7eb'] : pfColors,
          borderWidth:0, hoverOffset:6
        }]
      },
      options:{
        responsive:true,
        onClick:(evt, els)=>{ if(els&&els.length){ const lbl = pfLabels[els[0].index]; setMetricsPlatformFilter(lbl); } },
        plugins:{
          legend:{position:'right',labels:{font:{size:12},color:_chartTextColor()}},
          tooltip:{ callbacks:{ label:ctx=>{
            const total = pfData.reduce((a,b)=>a+b,0) || 1;
            const pct = ((ctx.parsed/total)*100).toFixed(1);
            return ` ${ctx.label}: ${ctx.parsed} (${pct}%) — click para filtrar`;
          }}}
        },
        cutout:'60%'
      }
    });
  }
}

