/* Campaign OS — Resumen (la portada)
   ====================
   Lo que necesita atención hoy: pendientes propios, avisos del tracker,
   próximas publicaciones y el avance de cada campaña contra su meta. Todo se
   recorta a misCampanas() —no a visibleCampaigns()— porque el tablero es de una
   persona, no de la agencia: ver las setenta campañas que no llevas entierra
   las tres que sí.
   Script CLÁSICO a propósito (NO type="module"): el HTML llama estas funciones
   desde atributos onclick/onchange, que sólo resuelven contra el scope global,
   y todos los archivos de js/ comparten ese mismo scope. El orden de <script>
   en index.html es el orden real de ejecución. */

// ============================================================
// DASHBOARD
// ============================================================
function renderDashboard() {
  // El tablero es de UNA persona, no de la agencia: sólo sus campañas. Antes un
  // admin caía en visibleCampaigns(), o sea todas, y sus pendientes de hoy y
  // sus próximas publicaciones venían de campañas que no lleva.
  const campaigns = misCampanas();

  // Lazy: igual que el calendario — campañas con tracker vinculado pero sin
  // filas cacheadas se sincronizan en background. Sin esto el dashboard sale
  // vacío hasta que el usuario abre cada campaña a mano. Idempotente vía
  // _trackerFetching; el re-render se debouncea tras cada fetch que termina,
  // así un solo repintado refleja todas las campañas que llegaron.
  const _scheduleDashRefresh = () => {
    if(window._dashRefreshTimer) clearTimeout(window._dashRefreshTimer);
    window._dashRefreshTimer = setTimeout(() => {
      window._dashRefreshTimer = null;
      if(currentPage === 'dashboard') { try { renderDashboard(); } catch(e){} }
    }, 400);
  };
  campaigns.forEach(c => {
    // `_fuenteEnEspera` es lo que corta el bucle cuando el sheet no responde:
    // sin él, "tiene URL y no tiene filas" sigue siendo cierto para siempre y
    // cada repintado vuelve a pedirlo. Ver la nota en core.js.
    if(c.trackerSheetUrl && (!c.trackerRows || !c.trackerRows.length) && !_fetchTrackerEnCurso.has(c.id)
       && !_fuenteEnEspera(c.id, 'tracker', c.trackerSheetUrl)) {
      _fetchTrackerEnCurso.add(c.id);
      _autoFetchTracker(c.trackerSheetUrl, c, {silent:true}).finally(() => {
        _fetchTrackerEnCurso.delete(c.id);
        _marcarFuenteVacia(c.id, 'tracker', c.trackerSheetUrl, !(c.trackerRows && c.trackerRows.length));
        _scheduleDashRefresh();
      });
    }
    // Mismo trato para las métricas: sin esto el avance contra la meta salía
    // en cero hasta que alguien abriera la página de Métricas campaña por
    // campaña, que es justo el paseo que este tablero viene a ahorrar.
    if(c.metricsSheetUrl && (!c.cachedMetrics || !c.cachedMetrics.length) && !_fetchMetricasEnCurso.has(c.id)
       && !_fuenteEnEspera(c.id, 'metricas', c.metricsSheetUrl) && typeof fetchMetricsRowsQuiet === 'function') {
      _fetchMetricasEnCurso.add(c.id);
      Promise.resolve(fetchMetricsRowsQuiet(c.metricsSheetUrl, c)).finally(() => {
        _fetchMetricasEnCurso.delete(c.id);
        _marcarFuenteVacia(c.id, 'metricas', c.metricsSheetUrl, !(c.cachedMetrics && c.cachedMetrics.length));
        _scheduleDashRefresh();
      });
    }
  });

  // Sin campañas propias, el aviso en vez de un tablero de ceros. Ya no se
  // excluye a los admins: desde que el tablero muestra sólo lo suyo, un admin
  // que no esté metido en ninguna campaña llega aquí igual que cualquiera, y
  // cuatro ceros sin explicación se leen como que la app se rompió.
  if(campaigns.length === 0 && _cache.campaigns.length > 0) {
    ['statActive','statToday','statUrgent','statPubs'].forEach(id => { const el=document.getElementById(id); if(el) el.textContent='—'; });
    const hint = `<div class="dashboard-sub-hint">Aún no sigues ninguna campaña.<br><a onclick="navigate('campannas')">Ve a Campañas</a> y haz clic en <strong>+ Seguir</strong> para ver su info aquí.</div>`;
    ['todayTasksList','alertsList','recentDocsList','upcomingPubs','dashAvanceList'].forEach(id => { const el=document.getElementById(id); if(el) el.innerHTML=hint; });
    const dct=document.getElementById('dashCampaignTable'); if(dct) dct.innerHTML=`<tr><td colspan="5">${hint}</td></tr>`;
    setPendientesBadge(0);
    return;
  }

  const globalTasks = getData('globalTasks');
  const today = hoyISO();

  // Collect all tasks
  const allTasks = [...globalTasks];
  campaigns.forEach(c => (c.tasks||[]).forEach(t => allTasks.push({...t, campaignName:c.name, campaignId:c.id})));

  // Only show tasks assigned to current user (or legacy tasks with no UID)
  const myTasks = allTasks.filter(t => !t.assigneeUid || t.assigneeUid === currentUser.uid);
  const todayTasks = myTasks.filter(t => !t.done && t.dueDate === today);
  const urgentTasks = myTasks.filter(t => !t.done && t.priority==='high');
  const activeCampaigns = campaigns.filter(c => !['Completado'].includes(c.status));

  // Upcoming pubs this week
  const weekEnd = new Date(); weekEnd.setDate(weekEnd.getDate()+7);
  const weekEndStr = fechaISO(weekEnd);
  const upcomingPubs = [];
  campaigns.forEach(c => {
    (c.influencers||[]).forEach(inf => {
      if(inf.publishDate && inf.publishDate >= today && new Date(inf.publishDate) <= weekEnd) {
        upcomingPubs.push({...inf, campaignName:c.name, client:c.client});
      }
    });
    // Also pull from tracker rows
    const _n=s=>s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/_/g,' ').trim();
    const gst = (r,...keys)=>{for(const k of keys){const kn=_n(k);for(const rk of Object.keys(r)){if(_n(rk)===kn&&r[rk])return r[rk];}}return '';};
    const campYear = (c.startDate && parseInt(c.startDate.slice(0,4))) || new Date().getFullYear();
    (c.trackerRows||[]).forEach(row=>{
      const rawDate = gst(row,'FECHA DE POST','Fecha de Post','Fecha de publicación','Fecha publicación','Fecha pub','Fecha','publish date','date','fecha');
      const pubDate = (typeof _trackerParseDate==='function') ? _trackerParseDate(rawDate, campYear) : rawDate;
      if(pubDate && pubDate >= today && pubDate <= weekEndStr) {
        const name = gst(row, ...TRACKER_NAME_KEYS, 'Influencer', 'Creator', 'name');
        const guion = gst(row,'ESTATUS GUIÓN','ESTATUS GUION','Estatus Guión','Estatus Guion');
        const contenido = (typeof _trackerStatusOf==='function') ? _trackerStatusOf(row) : gst(row,'ESTATUS CONTENIDO','Estatus Contenido','ESTATUS','Estatus');
        const creativa = gst(row,'PLATAFORMA CREATIVA','Plataforma Creativa');
        upcomingPubs.push({
          name: name || 'Publicación',
          format: gst(row,'TIPO DE CONTENIDO','Tipo de contenido','Tipo','formato','format','type'),
          publishDate: pubDate,
          campaignName: c.name,
          client: c.client,
          platform: gst(row,'PLATFORM','PLATAFORMA','Platform','Plataforma','Red social'),
          _trackerGuion: String(guion||'').trim(),
          _trackerContenido: String(contenido||'').trim(),
          _trackerCreativa: String(creativa||'').trim(),
          _fromTracker: true
        });
      }
    });
  });
  upcomingPubs.sort((a,b)=>a.publishDate.localeCompare(b.publishDate));

  // Stats
  _renderDigitPop('statActive', activeCampaigns.length);
  _renderDigitPop('statToday',  todayTasks.length);
  _renderDigitPop('statUrgent', urgentTasks.length);
  _renderDigitPop('statPubs',   upcomingPubs.length);
  setPendientesBadge(myTasks.filter(t=>!t.done).length);

  // Today tasks
  const ttl = document.getElementById('todayTasksList');
  const taskItemHtml = (t, showDate) => `
    <div class="task-item">
      <div class="task-check ${t.done?'done':''}" onclick="toggleTask('${t.id}','${t.campaignId||''}')"></div>
      <div class="priority-dot priority-${t.priority}"></div>
      <div class="task-info">
        <div class="task-title ${t.done?'done-text':''}">${_esc(t.title)}</div>
        <div class="task-meta" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          <span class="tb-pill tb-pill-static" style="background:${TASK_STATUS_BY_ID[taskStatus(t)].color};color:${_tbInk(TASK_STATUS_BY_ID[taskStatus(t)].color)};">${TASK_STATUS_BY_ID[taskStatus(t)].label}</span>
          ${_tbPeopleStack(t, 18)}
          <span>${_esc(t.campaignName||'General')}${showDate && t.dueDate ? ' · ' + formatDate(t.dueDate) : ''}</span>
        </div>
      </div>
      <button class="task-edit-btn" onclick="openEditTaskModal('${t.id}','${t.campaignId||''}')" title="Editar" aria-label="Editar tarea"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg></button>
    </div>`;
  if(todayTasks.length===0) {
    const upcoming = myTasks
      .filter(t => !t.done && t.dueDate && t.dueDate > today)
      .sort((a,b) => a.dueDate.localeCompare(b.dueDate))
      .slice(0, 6);
    if(upcoming.length === 0) {
      ttl.innerHTML = `<div style="display:flex;align-items:center;gap:8px;padding:12px 4px;color:var(--text-muted);font-size:13px;"><span style="width:18px;height:18px;flex-shrink:0;color:var(--mint);">${ICN_check}</span>¡Todo al día! Sin tareas pendientes.</div>`;
    } else {
      ttl.innerHTML = `<div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;padding:0 2px;">Próximos pendientes</div>` +
        upcoming.map(t => taskItemHtml(t, true)).join('');
    }
  } else {
    ttl.innerHTML = todayTasks.slice(0,6).map(t => taskItemHtml(t, false)).join('');
  }

  // Alerts
  const alerts = [];
  campaigns.forEach(c => {
    (c.tasks||[]).filter(t=>!t.done && t.priority==='high').forEach(t=>{
      alerts.push({msg:t.title, campaign:c.name, time:'Hoy', icon:ICN_alert, tid:t.id, cid:c.id});
    });
  });

  // Tracker review states: "Revisión INT" (sentarse a leer guión / revisar
  // contenido para decidir si pasa a cliente) y "Revisión EXT" (push con
  // cliente para que el contenido salga). Surface every matching row.
  const RE_INT = /revisi[oó]n\s*\(?\s*int/i;
  const RE_EXT = /revisi[oó]n\s*\(?\s*ext/i;
  const STATUS_KEYS = ['ESTATUS CONTENIDO','Estatus Contenido','ESTATUS','Estatus','STATUS','Status','ESTADO','Estado','ESTATUS POST','Estatus Post','STATUS POST'];
  const GUION_KEYS  = ['ESTATUS GUIÓN','ESTATUS GUION','Estatus Guión','Estatus Guion'];
  const reviewAlerts = [];
  campaigns.forEach(c => {
    (c.trackerRows||[]).forEach(row => {
      const name = (typeof _trackerGet==='function')
        ? (_trackerGet(row, TRACKER_NAME_KEYS.concat(['Influencer','Creator']))||'Contenido')
        : 'Contenido';
      // join the status-bearing cells so we catch the state wherever it lives
      let statusBlob = '';
      if(typeof _trackerGet==='function') {
        statusBlob = [ _trackerGet(row, STATUS_KEYS), _trackerGet(row, GUION_KEYS) ].filter(Boolean).join(' · ');
      }
      if(!statusBlob) statusBlob = Object.values(row).map(v=>String(v||'')).join(' · ');
      if(RE_INT.test(statusBlob)) {
        reviewAlerts.push({ kind:'int', name:String(name).trim(), campaign:c.name, cid:c.id });
      } else if(RE_EXT.test(statusBlob)) {
        reviewAlerts.push({ kind:'ext', name:String(name).trim(), campaign:c.name, cid:c.id });
      }
    });
  });

  const al = document.getElementById('alertsList');
  const reviewHtml = reviewAlerts.slice(0,12).map(a => {
    const isInt = a.kind==='int';
    const icon  = isInt ? '🔍' : '👀';
    const label = isInt ? 'Revisión INT — leer guión / revisar contenido' : 'Revisión EXT — push con cliente para publicar';
    const tag   = isInt
      ? '<span style="font-size:9px;font-weight:800;background:#fef08a;color:#854d0e;padding:1px 6px;border-radius:6px;">INT</span>'
      : '<span style="font-size:9px;font-weight:800;background:#fde047;color:#713f12;padding:1px 6px;border-radius:6px;">EXT</span>';
    // El aviso lleva a la fila: una alerta que sólo describe el problema
    // obliga a ir a buscarlo a mano, que es la mitad del trabajo.
    return `
      <div class="alert-item is-clickable" role="button" tabindex="0"
           title="Abrir el tracker de ${_esc(a.campaign)}"
           onclick="_abrirCampanaDeAviso('${a.cid}','tracker')"
           onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();_abrirCampanaDeAviso('${a.cid}','tracker');}">
        <span class="alert-icon" style="width:18px;height:18px;display:inline-flex;flex-shrink:0;">${icon}</span>
        <div class="alert-info">
          <div class="alert-msg" style="display:flex;align-items:center;gap:6px;">${tag} ${_esc(a.name)}</div>
          <div class="alert-campaign">${_esc(a.campaign)} · ${label}</div>
        </div>
      </div>`;
  }).join('');

  const highHtml = alerts.slice(0,4).map(a=>`
      <div class="alert-item is-clickable" role="button" tabindex="0"
           title="Abrir la tarea"
           onclick="openTaskDetail('${a.tid}','${a.cid}')"
           onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openTaskDetail('${a.tid}','${a.cid}');}">
        <span class="alert-icon" style="width:18px;height:18px;display:inline-flex;color:#c9a449;flex-shrink:0">${a.icon}</span>
        <div class="alert-info">
          <div class="alert-msg">${_esc(a.msg)}</div>
          <div class="alert-campaign">${_esc(a.campaign)}</div>
        </div>
        <span class="alert-time">${a.time}</span>
      </div>`).join('');

  if(!alerts.length && !reviewAlerts.length) {
    al.innerHTML=`<div class="empty-state"><div class="empty-icon">${ICN_check}</div><p>Sin alertas urgentes.</p></div>`;
  } else {
    al.innerHTML = reviewHtml + highHtml;
  }

  // Campaign status table
  const statusBadge = (s) => {
    const map = {'En proceso':'badge-blue','Ajustes':'badge-yellow','Pendiente cliente':'badge-orange','En reporte':'badge-red','En producción':'badge-purple','Completado':'badge-green'};
    return `<span class="badge ${map[s]||'badge-gray'}">${_esc(s)}</span>`;
  };
  const dct = document.getElementById('dashCampaignTable');
  dct.innerHTML = campaigns.map(c => {
    // Sin `|| 'Completado'` a secas: una campaña sin pasos definidos (creada
    // antes de que existiera flowSteps, o importada) caía en el mismo valor
    // que una terminada, y el tablero la anunciaba como Completada al lado de
    // su estado real. Vacío y terminado no son lo mismo.
    const pasos = Array.isArray(c.flowSteps) ? c.flowSteps : [];
    const nextStep = pasos.length
      ? (pasos.find(f=>f.status!=='Completado'&&f.status!=='Aprobado')?.step || 'Completado')
      : '—';
    return `<tr onclick="openCampaignDetail('${c.id}')" style="cursor:pointer">
      <td><strong>${_esc(c.name)}</strong></td>
      <td>${_esc(c.client)}</td>
      <td>${statusBadge(c.status)}</td>
      <td style="color:var(--text-muted);font-size:12px">${_esc(nextStep)}</td>
      <td style="font-size:12px">${c.startDate?formatDateShort(c.startDate):'—'}${c.endDate?' → '+formatDateShort(c.endDate):''}</td>
    </tr>`;
  }).join('');

  // Upcoming pubs
  const up = document.getElementById('upcomingPubs');
  // Stage logic: if Guión != Aprobado → current stage = Guión (show its status).
  // If Guión = Aprobado → current stage = Asset/Contenido (show its status).
  const stageInfo = (p) => {
    if(!p._fromTracker) return null;
    const guion = p._trackerGuion;
    const contenido = p._trackerContenido;
    const guionApr = /aprobad/i.test(guion);
    if(guionApr) {
      return { stage: 'Asset', value: contenido || 'Pendiente' };
    }
    return { stage: 'Guión', value: guion || 'Pendiente' };
  };
  up.innerHTML = upcomingPubs.slice(0,8).map(p=>{
    const st = stageInfo(p);
    const initial = (p.name||'?')[0];
    const sub = p._trackerCreativa ? p._trackerCreativa : (p.client||'');
    const campChip = p.campaignName
      ? `<span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;color:var(--blue,#2c6dff);background:var(--blue-pale,#eff6ff);border-radius:20px;padding:2px 8px;white-space:nowrap;max-width:160px;overflow:hidden;text-overflow:ellipsis;" title="${_esc(p.campaignName)}">${_esc(p.campaignName)}</span>`
      : '';
    return `
    <div class="influencer-row" style="gap:8px;cursor:pointer;" onclick="navigate('calendario')" title="Ver en calendario">
      <div class="inf-avatar">${_esc(initial)}</div>
      <div class="inf-info" style="min-width:0;">
        <div class="inf-name" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${_esc(p.name)}</div>
        <div class="inf-handle" style="display:flex;align-items:center;gap:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${campChip}${sub?`<span style="color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;">${_esc(sub)}</span>`:''}</div>
      </div>
      ${p.format?`<span style="font-size:11px;color:var(--text-muted);white-space:nowrap;">${_esc(p.format)}</span>`:''}
      ${st?`<span style="display:inline-flex;flex-direction:column;align-items:flex-end;gap:2px;">
        <span style="font-size:9px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;">${st.stage}</span>
        ${(typeof trackerStatusBadge==='function')?trackerStatusBadge(st.value):`<span style="font-size:11px;font-weight:600;">${_esc(st.value)}</span>`}
      </span>`:''}
      <span class="inf-date">${formatDateShort(p.publishDate)}</span>
    </div>`;
  }).join('') || '<div class="empty-state"><p>Nadie publicó esta semana. En cuanto el tracker registre un post, aparece aquí.</p></div>';

  // Recent docs
  const allDocs = [];
  campaigns.forEach(c=>(c.documents||[]).forEach(d=>allDocs.push({...d,campaignName:c.name})));
  // String(a.date) y no a.date: el campo fecha se puede dejar vacío al subir un
  // documento, y un undefined aquí tiraba localeCompare y con él el Resumen.
  allDocs.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
  const docIcons = {PDF:ICN_doc,Sheets:ICN_sheet,Doc:ICN_doc,'Presentación':ICN_clipboard,Otro:ICN_paperclip};
  const rd = document.getElementById('recentDocsList');
  rd.innerHTML = allDocs.slice(0,4).map(d=>`
    <div class="doc-item">
      <div class="doc-icon ${d.type==='PDF'?'doc-pdf':'doc-sheets'}">${docIcons[d.type]||ICN_paperclip}</div>
      <div class="doc-info">
        <div class="doc-name">${_esc(d.name)}</div>
        <div class="doc-campaign">${_esc(d.campaignName)}</div>
      </div>
      <span class="doc-date">${formatDateShort(d.date)}</span>
    </div>`).join('') || '<div class="empty-state"><p>Sin documentos todavía. Sube el brief o el reporte y queda a la mano de toda la campaña.</p></div>';

  try { renderDashboardAvance(campaigns); } catch(e){ console.warn('avance render', e); }

  renderCalendarWidget();
  populateCampaignSelects();
}

// ============================================================
// AVANCE CONTRA META (Resumen)
// ============================================================
// Las métricas eran el único eslabón de la cadena que no llegaba al tablero:
// subías el tracker y aparecían las publicaciones, pero el resultado contra lo
// que se prometió se quedaba encerrado dentro de la campaña. El Resumen
// contaba el proceso y nunca el resultado.
//
// Los números salen de _campaignCoherenceData(), el mismo motor que ya cuadra
// tracker, escenario y métricas dentro de la campaña: si el Resumen y la
// campaña usaran cuentas distintas volveríamos a tener dos verdades.

function _mSumaViews(rows) {
  if(!Array.isArray(rows) || typeof _mViews !== 'function') return 0;
  return rows.reduce((a, r) => a + (_mViews(r) || 0), 0);
}

// El semáforo va por clase, no por hex: _semaforo() devuelve los verdes y rojos
// oscuros del reporte impreso, que sobre el fondo del modo oscuro se quedan en
// 2:1. Las clases toman --green-text / --red-text, que ya se voltean solos.
function _avanceBarra(label, real, meta, formato) {
  const pct = meta > 0 ? Math.round((real / meta) * 100) : 0;
  const nivel = meta <= 0 ? 'is-none' : (pct >= 80 ? 'is-good' : (pct >= 40 ? 'is-mid' : 'is-low'));
  const fmt = formato || (n => formatNum(n));
  return `
    <div class="avance-metric ${nivel}">
      <div class="avance-metric-top">
        <span class="avance-metric-label">${_esc(label)}</span>
        <span class="avance-metric-num">${meta > 0 ? `${fmt(real)} / ${fmt(meta)}` : `${fmt(real)} / —`}</span>
      </div>
      <div class="avance-bar"><div class="avance-bar-fill" style="width:${Math.min(pct,100)}%;"></div></div>
      <span class="avance-pct">${meta > 0 ? pct + '%' : 'sin meta'}</span>
    </div>`;
}

function renderDashboardAvance(campaigns) {
  const el = document.getElementById('dashAvanceList');
  if(!el) return;

  // Sólo las que ya tienen algo que comparar. Una campaña en Brief, sin
  // escenario ni tracker, no tiene avance: mostrarla con tres ceros hace ruido
  // y esconde a las que sí importan.
  const filas = [];
  campaigns.forEach(c => {
    let d = null;
    try { d = _campaignCoherenceData(c); } catch(e) { return; }
    if(!d) return;
    const viewsReales = _mSumaViews(c.cachedMetrics);
    const tieneAlgo = d.totalCerrado > 0 || d.totalPublicado > 0 || viewsReales > 0;
    if(!tieneAlgo) return;
    const graves = d.issues.filter(i => i.severity === 'error' || i.severity === 'warn').length;
    filas.push({ c, d, viewsReales, graves });
  });

  if(!filas.length) {
    el.innerHTML = `<div class="empty-state"><p>Todavía no hay nada que comparar. En cuanto una campaña tenga escenario o tracker, aquí sale su avance contra la meta.</p></div>`;
    return;
  }

  // Primero lo que peor va: el tablero es para lo que necesita atención hoy.
  filas.sort((a, b) => {
    const pa = a.d.totalCerrado > 0 ? a.d.totalPublicado / a.d.totalCerrado : 1;
    const pb = b.d.totalCerrado > 0 ? b.d.totalPublicado / b.d.totalCerrado : 1;
    return pa - pb;
  });

  el.innerHTML = filas.slice(0, 6).map(({ c, d, viewsReales, graves }) => `
    <div class="avance-row" onclick="_abrirCampanaDeAviso('${c.id}')" role="button" tabindex="0"
         onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();_abrirCampanaDeAviso('${c.id}');}">
      <div class="avance-head">
        <span class="avance-name">${_esc(c.name)}</span>
        ${c.client ? `<span class="avance-client">${_esc(c.client)}</span>` : ''}
        ${graves ? `<span class="avance-focos" title="Desfases entre tracker, escenario y métricas">${graves} foco${graves>1?'s':''}</span>` : ''}
      </div>
      <div class="avance-metrics">
        ${_avanceBarra('Contenidos publicados', d.totalPublicado, d.totalCerrado, n => String(n))}
        ${_avanceBarra('Views', viewsReales, d.escenarioViewsEst)}
      </div>
      ${!c.metricsSheetUrl && d.totalPublicado > 0
        ? `<div class="avance-nudge">Ya hay publicaciones y las métricas no están vinculadas — el resultado real todavía no se puede medir.</div>`
        : ''}
    </div>`).join('');
}
