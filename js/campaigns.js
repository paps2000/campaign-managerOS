/* Campaign OS — Dashboard, campañas, coherencia, contactos, notificaciones, kudos, reacciones
   Extraído de index.html. Script CLÁSICO a propósito (NO type="module"):
   el HTML llama estas funciones desde atributos onclick/onchange, que solo
   resuelven contra el scope global. El orden de carga en index.html replica
   el orden original de ejecución y no debe alterarse. */

// ============================================================
// DASHBOARD
// ============================================================
function renderDashboard() {
  // Show campaigns where user is assigned, created, or subscribed (but not ones they can merely see via admin)
  const campaigns = isAdmin()
    ? visibleCampaigns()
    : visibleCampaigns().filter(c =>
        isSubscribed(c.id) ||
        c.createdBy === currentUser.uid ||
        (Array.isArray(c.assignedTo) && c.assignedTo.includes(currentUser.uid))
      );

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
    if(c.trackerSheetUrl && (!c.trackerRows || !c.trackerRows.length) && !c._trackerFetching) {
      c._trackerFetching = true;
      _autoFetchTracker(c.trackerSheetUrl, c, {silent:true}).finally(() => {
        c._trackerFetching = false;
        _scheduleDashRefresh();
      });
    }
  });

  // Non-admin with no subscriptions: show hint instead of empty dashboard
  if(!isAdmin() && campaigns.length === 0 && _cache.campaigns.length > 0) {
    ['statActive','statToday','statUrgent','statPubs'].forEach(id => { const el=document.getElementById(id); if(el) el.textContent='—'; });
    const hint = `<div class="dashboard-sub-hint">Aún no sigues ninguna campaña.<br><a onclick="navigate('campannas')">Ve a Campañas</a> y haz clic en <strong>+ Seguir</strong> para ver su info aquí.</div>`;
    ['todayTasksList','alertsList','recentDocsList','upcomingPubs'].forEach(id => { const el=document.getElementById(id); if(el) el.innerHTML=hint; });
    const dct=document.getElementById('dashCampaignTable'); if(dct) dct.innerHTML=`<tr><td colspan="5">${hint}</td></tr>`;
    setPendientesBadge(0);
    return;
  }

  const globalTasks = getData('globalTasks');
  const today = new Date().toISOString().split('T')[0];

  // Collect all tasks
  const allTasks = [...globalTasks];
  campaigns.forEach(c => c.tasks.forEach(t => allTasks.push({...t, campaignName:c.name, campaignId:c.id})));

  // Only show tasks assigned to current user (or legacy tasks with no UID)
  const myTasks = allTasks.filter(t => !t.assigneeUid || t.assigneeUid === currentUser.uid);
  const todayTasks = myTasks.filter(t => !t.done && t.dueDate === today);
  const urgentTasks = myTasks.filter(t => !t.done && t.priority==='high');
  const activeCampaigns = campaigns.filter(c => !['Completado'].includes(c.status));

  // Upcoming pubs this week
  const weekEnd = new Date(); weekEnd.setDate(weekEnd.getDate()+7);
  const weekEndStr = weekEnd.toISOString().split('T')[0];
  const upcomingPubs = [];
  campaigns.forEach(c => {
    c.influencers.forEach(inf => {
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
          <span class="tb-pill tb-pill-static" style="background:${TASK_STATUS_BY_ID[taskStatus(t)].color};">${TASK_STATUS_BY_ID[taskStatus(t)].label}</span>
          ${_tbPeopleStack(t, 18)}
          <span>${t.campaignName||'General'}${showDate && t.dueDate ? ' · ' + formatDate(t.dueDate) : ''}</span>
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
    c.tasks.filter(t=>!t.done && t.priority==='high').forEach(t=>{
      alerts.push({msg:t.title, campaign:c.name, time:'Hoy', icon:ICN_alert});
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
        reviewAlerts.push({ kind:'int', name:String(name).trim(), campaign:c.name });
      } else if(RE_EXT.test(statusBlob)) {
        reviewAlerts.push({ kind:'ext', name:String(name).trim(), campaign:c.name });
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
    return `
      <div class="alert-item">
        <span class="alert-icon" style="width:18px;height:18px;display:inline-flex;flex-shrink:0;">${icon}</span>
        <div class="alert-info">
          <div class="alert-msg" style="display:flex;align-items:center;gap:6px;">${tag} ${_esc(a.name)}</div>
          <div class="alert-campaign">${_esc(a.campaign)} · ${label}</div>
        </div>
      </div>`;
  }).join('');

  const highHtml = alerts.slice(0,4).map(a=>`
      <div class="alert-item">
        <span class="alert-icon" style="width:18px;height:18px;display:inline-flex;color:#c9a449;flex-shrink:0">${a.icon}</span>
        <div class="alert-info">
          <div class="alert-msg">${a.msg}</div>
          <div class="alert-campaign">${a.campaign}</div>
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
    return `<span class="badge ${map[s]||'badge-gray'}">${s}</span>`;
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
      <td style="color:var(--text-muted);font-size:12px">${nextStep}</td>
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
      <div class="inf-avatar">${initial}</div>
      <div class="inf-info" style="min-width:0;">
        <div class="inf-name" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${_esc(p.name)}</div>
        <div class="inf-handle" style="display:flex;align-items:center;gap:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${campChip}${sub?`<span style="color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;">${_esc(sub)}</span>`:''}</div>
      </div>
      ${p.format?`<span style="font-size:11px;color:var(--text-muted);white-space:nowrap;">${p.format}</span>`:''}
      ${st?`<span style="display:inline-flex;flex-direction:column;align-items:flex-end;gap:2px;">
        <span style="font-size:9px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;">${st.stage}</span>
        ${(typeof trackerStatusBadge==='function')?trackerStatusBadge(st.value):`<span style="font-size:11px;font-weight:600;">${st.value}</span>`}
      </span>`:''}
      <span class="inf-date">${formatDateShort(p.publishDate)}</span>
    </div>`;
  }).join('') || '<div class="empty-state"><p>Nadie publicó esta semana. En cuanto el tracker registre un post, aparece aquí.</p></div>';

  // Recent docs
  const allDocs = [];
  campaigns.forEach(c=>c.documents.forEach(d=>allDocs.push({...d,campaignName:c.name})));
  allDocs.sort((a,b)=>b.date.localeCompare(a.date));
  const docIcons = {PDF:ICN_doc,Sheets:ICN_sheet,Doc:ICN_doc,'Presentación':ICN_clipboard,Otro:ICN_paperclip};
  const rd = document.getElementById('recentDocsList');
  rd.innerHTML = allDocs.slice(0,4).map(d=>`
    <div class="doc-item">
      <div class="doc-icon ${d.type==='PDF'?'doc-pdf':'doc-sheets'}">${docIcons[d.type]||ICN_paperclip}</div>
      <div class="doc-info">
        <div class="doc-name">${d.name}</div>
        <div class="doc-campaign">${d.campaignName}</div>
      </div>
      <span class="doc-date">${formatDateShort(d.date)}</span>
    </div>`).join('') || '<div class="empty-state"><p>Sin documentos todavía. Sube el brief o el reporte y queda a la mano de toda la campaña.</p></div>';

  renderCalendarWidget();
  populateCampaignSelects();
}

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
function renderCampaignGrid() {
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
  const campaigns = _cache.campaigns.filter(c => {
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
    return `<span class="badge ${map[s]||'badge-gray'}">${s}</span>`;
  };
  if(campaigns.length===0) {
    grid.innerHTML=`<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">${ICN_clipboard}</div><p>${(q||_campStatusFilter)?'Sin campañas con esos filtros.':'No hay campañas. ¡Crea la primera!'}</p></div>`;
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
    const subBtn = !isAdmin() ? `<button class="sub-btn ${sub?'sub-active':''}" onclick="toggleSubscribeCampaign('${c.id}',event)" title="${sub?'Dejar de seguir':'Seguir campaña'}">${sub?'✓ Siguiendo':'+ Seguir'}</button>` : '';
    return `<div class="campaign-card" onclick="openCampaignDetail('${c.id}')">
      <div class="campaign-card-header">
        <div>
          <div class="campaign-name">${_esc(c.name)}</div>
          <div class="campaign-client">${_esc(c.client)}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">${statusBadge(c.status)}${subBtn}</div>
      </div>
      <div class="campaign-meta">
        <span class="badge badge-lavender"><span class="badge-icn">${ICN_users}</span>${c.influencers.length} ${c.influencers.length===1?'creador':'creadores'}</span>
        <span class="badge badge-mint"><span class="badge-icn">${ICN_calendar}</span>${c.season||'—'}</span>
        ${(()=>{ const r=c.responsables||{}; return ['operaciones','cuentas','creativo','data'].map(k=>{ const uids=getAreaUids(r,k); return uids.map(uid=>{ const u=allUsers.find(x=>x.uid===uid); return u?`<span class="badge badge-area-${u.area||k.charAt(0).toUpperCase()+k.slice(1)}">${_esc(u.name||u.email.split('@')[0])}</span>`:'';}).join(''); }).join(''); })()||''}
      </div>
      ${(()=>{ const ppl=(c.influencers||[]).filter(i=>i&&i.name); if(!ppl.length) return ''; const max=5; const shown=ppl.slice(0,max); const extra=ppl.length-shown.length; const av=shown.map(i=>`<div class="t-avatar" title="${_esc(i.name)}">${_esc((i.name||'?')[0].toUpperCase())}</div>`).join('')+(extra>0?`<div class="t-avatar is-more" title="+${extra} más">+${extra}</div>`:''); return `<div class="camp-people tdev-avatars"><div class="camp-people-avatars">${av}</div></div>`; })()}
      <div class="campaign-progress">
        <div class="progress-label"><span>Flujo</span><span>${pct}%</span></div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
      </div>
      <div class="campaign-progress" style="margin-top:8px;">
        <div class="progress-label"><span>Contenidos publicados</span><span>${totalPub}/${totalCerrado||'—'} · ${contPct}%</span></div>
        <div class="progress-bar"><div class="progress-fill" style="width:${contPct}%;background:linear-gradient(90deg,#bbf7d0,#166534);"></div></div>
      </div>
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
  renderCampaignGrid();
}

// El grid de Resumen (responsables, presupuesto, participantes) se re-renderiza
// también desde rerenderCurrent(): antes solo se pintaba al abrir la campaña,
// así que un cambio de responsables no se veía hasta volver a entrar.
function renderCampaignInfoGrid(c) {
  const statusBadge = (s) => {
    const map = {'En proceso':'badge-blue','Ajustes':'badge-yellow','Pendiente cliente':'badge-orange','En reporte':'badge-red','En producción':'badge-purple','Completado':'badge-green'};
    return `<span class="badge ${map[s]||'badge-gray'}">${s}</span>`;
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
    if(!bc && c.budget) return `<div class="info-field"><div class="info-label">Presupuesto</div><div class="info-value">${c.budget}</div></div>`;
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

  // Assignees list
  const assignedUids = Array.isArray(c.assignedTo) ? c.assignedTo : [];
  const assignedUsers = assignedUids.map(uid => allUsers.find(u=>u.uid===uid)).filter(Boolean);
  const assigneeChips = assignedUsers.length === 0
    ? '<span style="color:var(--text-muted);font-size:13px;">Sin asignados</span>'
    : assignedUsers.map(u => `
        <span class="badge" style="background:var(--lavender-pale);color:var(--lavender);display:inline-flex;align-items:center;gap:6px;">
          ${memberAvatarHtml(u, 18)}
          ${_esc(u.name||u.email)}
          ${(isAdmin() || c.createdBy===currentUser.uid) ? `<button onclick="removeAssignee('${c.id}','${u.uid}')" style="background:none;border:none;cursor:pointer;color:var(--lavender);font-size:11px;padding:0 0 0 4px;">✕</button>` : ''}
        </span>`).join(' ');

  document.getElementById('campaignInfoGrid').innerHTML = `
    <div class="info-field"><div class="info-label">Cliente</div><div class="info-value">${_esc(c.client)}</div></div>
    <div class="info-field"><div class="info-label">Temporada</div><div class="info-value">${c.season||'—'}</div></div>
    <div class="info-field"><div class="info-label">Objetivo</div><div class="info-value">${c.objective||'—'}</div></div>
    <div class="info-field"><div class="info-label">Core Message</div><div class="info-value">${c.coreMessage||'—'}</div></div>
    ${budgetField}
    ${(()=>{
      const r = c.responsables || {};
      const areaLabel = {operaciones:'Operaciones', cuentas:'Cuentas', creativo:'Creativo', data:'Data'};
      const areaColor = {operaciones:'badge-area-Operaciones', cuentas:'badge-area-Cuentas', creativo:'badge-area-Creativo', data:'badge-area-Data'};
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
        <span>Participantes</span>
        <span style="display:flex;gap:6px;">
          ${(()=>{
            const subbed = Array.isArray(c.subscribers) && c.subscribers.includes(currentUser?.uid);
            return `<button class="btn btn-ghost btn-sm" onclick="toggleCampaignSubscription('${c.id}')" style="font-size:11px;" title="Recibe notificaciones cuando esta campaña cambie">${subbed?`<span class="icn-inline">${ICN_bellOff}</span>Dejar de seguir`:`<span class="icn-inline">${ICN_bell}</span>Suscribirme`}</button>`;
          })()}
          ${(isAdmin() || c.createdBy===currentUser.uid) ? `<button class="btn btn-ghost btn-sm" onclick="openAssignModal()" style="font-size:11px;">+ Asignar</button>` : ''}
        </span>
      </div>
      <div class="info-value" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;">${assigneeChips}</div>
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

  renderCampaignInfoGrid(c);

  renderCampaignInfluencers(c);
  renderCampaignTasks(c);
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

  // Escenario parsed
  let escenario = null;
  if(c.escenarioRows && c.escenarioRows.length && typeof parseEscenarioRows === 'function') {
    try { escenario = parseEscenarioRows(c.escenarioRows); } catch(e){}
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

function _switchCampaignTab(tabName) {
  document.querySelectorAll('.detail-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.toggle('active', t.id === 'tab-'+tabName));
  try { localStorage.setItem('cmos:lastCampaignTab', tabName); } catch(e){}
}

// ============================================================
// CAMPAIGN CLIENT CONTACTS
// ============================================================
function renderCampaignClients(c) {
  const el = document.getElementById('campaignClientsSection');
  if(!el) return;
  const contacts = Array.isArray(c.clientContacts) ? c.clientContacts : [];
  const canEdit = (typeof isAdmin === 'function' && isAdmin()) || c.createdBy === currentUser?.uid || (Array.isArray(c.assignedTo) && c.assignedTo.includes(currentUser?.uid));
  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
      <h4 style="font-size:13px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.8px;margin:0;">👥 Clientes · Puntos de contacto</h4>
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
              ${ct.linkedin ? `<a href="${_esc(ct.linkedin)}" target="_blank" rel="noopener" style="font-size:12px;color:#0a66c2;display:inline-flex;align-items:center;gap:4px;margin-top:4px;text-decoration:none;font-weight:600;"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M19 0H5a5 5 0 0 0-5 5v14a5 5 0 0 0 5 5h14a5 5 0 0 0 5-5V5a5 5 0 0 0-5-5zM8 19H5V8h3v11zM6.5 6.7a1.8 1.8 0 1 1 0-3.6 1.8 1.8 0 0 1 0 3.6zM20 19h-3v-5.6c0-3.4-4-3.1-4 0V19h-3V8h3v1.8c1.4-2.6 7-2.8 7 2.5V19z"/></svg> LinkedIn</a>` : ''}
              ${ct.notes ? `<div style="font-size:11px;color:var(--text-muted);margin-top:8px;background:var(--bg);padding:6px 8px;border-radius:8px;line-height:1.4;white-space:pre-wrap;">${_esc(ct.notes)}</div>` : ''}
            </div>`).join('')}
        </div>`}`;
}

let _editingClientContact = { campaignId:null, idx:null };
function openClientContactModal(cid, idx) {
  const campaigns = getData('campaigns');
  const c = campaigns.find(x => x.id === cid);
  if(!c) return;
  _editingClientContact = { campaignId:cid, idx: typeof idx==='number'?idx:null };
  const ct = (typeof idx==='number' && c.clientContacts && c.clientContacts[idx]) || {name:'',email:'',cargo:'',linkedin:'',notes:''};
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
  openModal('clientContactModal');
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
  const campaigns = getData('campaigns');
  const c = campaigns.find(x => x.id === campaignId);
  if(!c) return;
  if(!Array.isArray(c.clientContacts)) c.clientContacts = [];
  const obj = { name, cargo, email, linkedin, notes };
  if(typeof idx === 'number') c.clientContacts[idx] = obj;
  else c.clientContacts.push(obj);
  setData('campaigns', campaigns);
  closeModal('clientContactModal');
  showToast('Contacto guardado','success'); try { showSuccessCheck(); } catch(e){}
  if(currentCampaignId === campaignId) renderCampaignClients(c);
}

async function deleteClientContact(cid, idx) {
  if(!await confirmar({
    title: '¿Eliminar este contacto?',
    body: 'Se quita de la campaña. Puedes volver a capturarlo cuando quieras.',
    confirmLabel: 'Eliminar contacto',
    cancelLabel: 'Conservar',
    danger: true,
  })) return;
  const campaigns = getData('campaigns');
  const c = campaigns.find(x => x.id === cid);
  if(!c || !Array.isArray(c.clientContacts)) return;
  c.clientContacts.splice(idx, 1);
  setData('campaigns', campaigns);
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
              <div style="font-size:13px;font-weight:700;color:${sevColor[i.severity]};">${i.title}</div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${i.detail}</div>
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
      <div style="font-size:13px;font-weight:600;color:var(--text-muted);margin-bottom:10px;">📊 Métricas</div>
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
  setData('campaigns', campaigns);
  _cache.campaigns = campaigns;
  showToast('Sheet de métricas vinculado','success');
  renderCampaignMetricsSection(campaigns[idx]);
}

function navigateToMetrics(cid) {
  navigate('metricas');
  setTimeout(()=>openMetricsCampaign(cid), 80);
}

function renderCampaignInfluencers(c) {
  const sheetsInput = document.getElementById('campaignSheetsUrl');
  if(sheetsInput) sheetsInput.value = c.sheetsUrl || '';
  // Render escenario block (estimated vs real per creator)
  try { renderEscenarioBlock(c); } catch(e){ console.warn('escenario render error', e); }
  const infStatusBadge = (s) => {
    const map={Publicado:'badge-green',Aprobado:'badge-blue','En producción':'badge-purple',Pendiente:'badge-gray'};
    return `<span class="badge ${map[s]||'badge-gray'}">${s}</span>`;
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

function _taskItemHtml(t, cid) {
  const st = TASK_STATUS_BY_ID[taskStatus(t)];
  return `
  <div class="task-item">
    <div class="task-check ${t.done?'done':''}" onclick="toggleTask('${t.id}','${cid}')"></div>
    <div class="priority-dot priority-${t.priority}"></div>
    <div class="task-info" onclick="openTaskDetail('${t.id}','${cid}')" style="cursor:pointer;">
      <div class="task-title ${t.done?'done-text':''}">${_esc(t.title)}</div>
      <div class="task-meta" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
        <span class="tb-pill tb-pill-static" style="background:${st.color};">${st.label}</span>
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

function renderCampaignTasks(c) {
  const el = document.getElementById('campaignTasksList');
  if(!c.tasks || c.tasks.length===0) {
    el.innerHTML=`<div class="empty-state"><div class="empty-icon">${ICN_check}</div><p>Sin tareas. ¡Todo al día!</p></div>`;
    return;
  }
  const AREA_ORDER = ['Cuentas','Operaciones','Creativo','Data'];
  const AREA_COLOR = {Cuentas:'var(--blue)',Operaciones:'var(--pink)',Creativo:'var(--lavender)',Data:'#3a7a5e'};

  // Group tasks by assignee's area
  const groups = {};
  c.tasks.forEach(t => {
    const u = allUsers.find(x=>x.uid===t.assigneeUid);
    const area = u?.area || 'Sin área';
    if(!groups[area]) groups[area] = [];
    groups[area].push(t);
  });

  const areas = [...AREA_ORDER.filter(a=>groups[a]), ...Object.keys(groups).filter(a=>!AREA_ORDER.includes(a))];

  // If only one area group, render flat (no grouping chrome needed)
  if(areas.length <= 1) {
    el.innerHTML = c.tasks.map(t=>_taskItemHtml(t,c.id)).join('');
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
      <div class="task-area-body">${tasks.map(t=>_taskItemHtml(t,c.id)).join('')}</div>
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
    try {
      db.collection('users').doc(currentUser.uid).set(patch, {merge:true});
      db.collection('workspaces').doc(WORKSPACE).collection('members').doc(currentUser.uid).set(patch,{merge:true});
    } catch(e) {}
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

// ============================================================
// NOTIFICATIONS
// ============================================================
let _notifUnsub = null;
let _notifs = [];

function initNotifications() {
  if(!currentUser || !db) return;
  _loadEmailConfig();
  if(_notifUnsub) _notifUnsub();
  // Sin orderBy a propósito: combinar where('toUid') con orderBy('createdAt')
  // en campos distintos pide un índice compuesto que este proyecto nunca
  // desplegó (no hay firestore.indexes.json). Sin ese índice el listener
  // tiraba error y el callback lo tragaba en silencio — la campanita nunca
  // mostraba nada, ni etiquetando a alguien, porque el ALTA sí funcionaba
  // (un simple add() no necesita índice) pero la LECTURA nunca llegaba.
  // Se ordena en el cliente en vez de pedirle el orden a Firestore.
  const q = db.collection('workspaces').doc(WORKSPACE)
    .collection('notifications')
    .where('toUid','==',currentUser.uid);
  _notifUnsub = q.onSnapshot(snap => {
    _notifs = snap.docs.map(d=>({id:d.id,...d.data()}))
      .sort((a,b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
      .slice(0, 30);
    _renderNotifBell();
  }, err => console.warn('notifications listener failed:', err.message));
  // Refresh deadline notifications periodically + once now (Firestore snapshot
  // may not fire, so this guarantees time-based alerts appear).
  _renderNotifBell();
  if(_deadlineTimer) clearInterval(_deadlineTimer);
  _deadlineTimer = setInterval(_renderNotifBell, 30 * 60 * 1000);
}
let _deadlineTimer = null;

// --- Deadline (time-based) notifications, computed locally (no Firestore) ---
const DEADLINE_WARN_DAYS = 3; // avisar cuando falten ≤3 días
function _dlSeen() { try { return new Set(JSON.parse(localStorage.getItem('cmos:dlSeen')||'[]')); } catch(e){ return new Set(); } }
function _dlMarkSeen(id) {
  const s = _dlSeen(); s.add(id);
  try { localStorage.setItem('cmos:dlSeen', JSON.stringify([...s].slice(-200))); } catch(e){}
}
function _computeDeadlineNotifs() {
  if(!currentUser) return [];
  const seen = _dlSeen();
  const today = new Date(); today.setHours(0,0,0,0);
  const out = [];
  // Avisa a quien está etiquetado en la tarea, no solo al responsable: un
  // supervisor que se entera del retraso el día después no puede hacer nada.
  const mine = t => {
    const involved = typeof taskPeople === 'function' ? taskPeople(t) : [t.assigneeUid];
    return !t.assigneeUid || involved.includes(currentUser.uid);
  };
  const consider = (t, campaignName) => {
    if(t.done || !mine(t)) return;
    const where = campaignName ? ` · ${campaignName}` : '';
    // Los dos deadlines avisan por separado: el interno es del equipo y el de
    // cliente es el que no se puede mover.
    [['dueDate','interno'], ['clientDueDate','cliente']].forEach(([field, label]) => {
      const raw = t[field];
      if(!raw) return;
      const due = new Date(raw+'T00:00:00'); if(isNaN(due)) return;
      const days = Math.round((due - today)/86400000);
      if(days > DEADLINE_WARN_DAYS) return;
      const id = 'dl_'+(t.id||t.title)+'_'+field+'_'+raw;
      const text = days < 0 ? `⏰ Deadline ${label} vencido hace ${-days}d: "${t.title}"${where}`
        : days === 0 ? `⏰ Deadline ${label} es HOY: "${t.title}"${where}`
        : `⏰ Deadline ${label} en ${days}d: "${t.title}"${where}`;
      out.push({ id, type:'deadline', text, read: seen.has(id), createdAt: due.getTime(), _sort: days });
    });
  };
  (getData('globalTasks')||[]).forEach(t=>consider(t,''));
  (getData('campaigns')||[]).forEach(c => (c.tasks||[]).forEach(t=>consider(t,c.name)));
  return out.sort((a,b)=>a._sort-b._sort);
}

function _renderNotifBell() {
  const deadlines = _computeDeadlineNotifs();
  const all = [...deadlines, ..._notifs];
  const unread = all.filter(n=>!n.read).length;
  _setTBadge('notifBadge', unread);
  const list = document.getElementById('notifList');
  if(!list) return;
  if(!all.length) { list.innerHTML='<div class="notif-empty">Sin notificaciones 🎉</div>'; return; }
  list.innerHTML = all.map(n => {
    const ago = n.type==='deadline' ? '' : _timeAgo(n.createdAt?.toDate ? n.createdAt.toDate() : new Date(n.createdAt||Date.now()));
    const icon = n.type==='kudos'?'🏆':n.type==='task_assigned'?'✅':n.type==='deadline'?'⏰':'💬';
    return `<div class="notif-item ${n.read?'':'unread'}" onclick="markNotifRead('${n.id}')">
      <div class="notif-avatar">${icon}</div>
      <div class="notif-body">
        <p>${n.text||''}</p>
        ${ago?`<time>${ago}</time>`:''}
      </div>
    </div>`;
  }).join('');
}

function _timeAgo(date) {
  if(!date) return '';
  const diff = Math.floor((Date.now() - date.getTime())/1000);
  if(diff < 60) return 'Ahora';
  if(diff < 3600) return `${Math.floor(diff/60)}m`;
  if(diff < 86400) return `${Math.floor(diff/3600)}h`;
  return `${Math.floor(diff/86400)}d`;
}

function toggleNotifPanel() {
  const panel = document.getElementById('notifPanel');
  if(!panel) return;
  const isOpen = panel.classList.toggle('open');
  if(isOpen) {
    // Close on outside click
    setTimeout(()=>document.addEventListener('click', _closeNotifOnOutside, {once:true}),0);
  }
}

function _closeNotifOnOutside(e) {
  const panel = document.getElementById('notifPanel');
  const btn = document.getElementById('notifBellBtn');
  if(panel && !panel.contains(e.target) && !btn?.contains(e.target)) {
    panel.classList.remove('open');
  }
}

async function markNotifRead(nid) {
  if(String(nid).startsWith('dl_')) { _dlMarkSeen(nid); _renderNotifBell(); return; }
  try {
    await db.collection('workspaces').doc(WORKSPACE).collection('notifications').doc(nid).update({read:true});
  } catch(e) {}
}

async function markAllNotifsRead() {
  _computeDeadlineNotifs().filter(n=>!n.read).forEach(n=>_dlMarkSeen(n.id));
  const unread = _notifs.filter(n=>!n.read);
  await Promise.all(unread.map(n=>markNotifRead(n.id)));
  _renderNotifBell();
}

// Etiquetar a alguien SIEMPRE deja aviso, y eso te incluye a ti: si te pones
// de responsable de Cuentas y no te llega nada, la campanita deja de ser el
// registro de en qué estás metido y hay que ir a buscarlo a mano.
async function _createNotification({toUid, type, text, email}) {
  if(!toUid) return;
  try {
    await db.collection('workspaces').doc(WORKSPACE).collection('notifications').add({
      toUid, fromUid: currentUser.uid,
      fromName: currentUserProfile?.name || currentUser.email,
      type, text,
      read: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch(e) { console.warn('notification create failed:', e.message); }
  // El correo a uno mismo sí sobra: acabas de hacerlo tú, ya lo sabes.
  if(email && toUid !== currentUser?.uid) _queueEmail(toUid, email.subject, email.html);
}

// ============================================================
// CORREO
// ============================================================
// El navegador no puede mandar correo: hace falta algo del lado del servidor.
// Lo que hay aquí es la mitad del cliente — deja el correo en la colección
// `mail`, que es el formato exacto que consume la extensión de Firebase
// "Trigger Email from Firestore". Mientras la extensión no esté instalada esto
// no manda nada (ver emailNotifsEnabled): no rompe, solo no sale correo.
// Instrucciones de instalación en NOTIFICACIONES-EMAIL.md.
let _emailCfg = { enabled:false, fromName:'Campaign OS' };

async function _loadEmailConfig() {
  if(!db) return;
  try {
    const snap = await db.collection('workspaces').doc(WORKSPACE)
      .collection('config').doc('notifications').get();
    if(snap.exists) _emailCfg = { ..._emailCfg, ...snap.data() };
  } catch(e) { /* sin config = correo apagado */ }
  _renderEmailSettings();
}
function emailNotifsEnabled() { return !!_emailCfg.enabled; }

// Preferencia por persona. Quien no quiere correo sigue viendo la campanita.
function myEmailPref() { return currentUserProfile?.emailNotifs !== false; }
async function setMyEmailPref(on) {
  if(!currentUser || !db) return;
  try {
    // La preferencia se guardaba en workspaces/<ws>/users, una colección que
    // nadie lee: _queueEmail busca al destinatario en `allUsers`, que sale de
    // workspaces/<ws>/members, y currentUserProfile sale de users/<uid>. Así
    // que apagar el correo no apagaba nada. Se escribe donde sí se lee.
    const _pref = { emailNotifs: !!on };
    await Promise.all([
      db.collection('workspaces').doc(WORKSPACE).collection('members')
        .doc(currentUser.uid).set(_pref, { merge:true }),
      db.collection('users').doc(currentUser.uid).set(_pref, { merge:true }),
    ]);
    if(currentUserProfile) currentUserProfile.emailNotifs = !!on;
    showToast(on ? 'Te llegarán correos de tus tareas' : 'Ya no te llegarán correos', 'success');
  } catch(e) { showToast('No se pudo guardar la preferencia', 'error'); }
  _renderEmailSettings();
}

function _renderEmailSettings() {
  const box = document.getElementById('emailNotifsBox');
  if(!box) return;
  if(!emailNotifsEnabled()) {
    box.innerHTML = `<div class="settings-note">
      <b>El correo todavía no está conectado.</b>
      Las notificaciones viven solo dentro de la app. Para que además salgan por correo hay que instalar el envío en Firebase una vez — está documentado en <code>NOTIFICACIONES-EMAIL.md</code>.
    </div>`;
    return;
  }
  const on = myEmailPref();
  box.innerHTML = `<label class="settings-switch">
      <input type="checkbox" ${on ? 'checked' : ''} onchange="setMyEmailPref(this.checked)">
      <span>Mandarme también un correo cuando me etiqueten en una tarea</span>
    </label>
    <div class="settings-note" style="margin-top:10px;">Se manda a <b>${_esc(currentUser?.email || '')}</b>. Los recordatorios de deadline no van por correo, solo el etiquetado.</div>`;
}

async function _queueEmail(toUid, subject, html) {
  if(!emailNotifsEnabled() || !db) return;
  const u = allUsers.find(x => x.uid === toUid);
  if(!u || !u.email) return;
  if(u.emailNotifs === false) return;
  try {
    await db.collection('mail').add({
      to: [u.email],
      message: { subject, html },
      _meta: { workspace: WORKSPACE, toUid, fromUid: currentUser?.uid || '', createdAt: Date.now() },
    });
  } catch(e) { console.warn('email queue failed:', e.message); }
}

// Plantilla mínima: asunto que se entiende sin abrir, y un cuerpo que dice qué
// tarea, quién la asignó, con qué papel y para cuándo.
function _taskEmailHtml({ role, who, title, campaignName, dueDate, clientDueDate, notes }) {
  const row = (k, v) => v ? `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:13px;">${k}</td><td style="padding:4px 0;font-size:13px;color:#111827;font-weight:600;">${v}</td></tr>` : '';
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;">
    <p style="font-size:15px;color:#111827;margin:0 0 14px;"><b>${_esc(who)}</b> te etiquetó como <b>${_esc(role.toLowerCase())}</b> en una tarea.</p>
    <p style="font-size:17px;font-weight:700;color:#111827;margin:0 0 14px;">${_esc(title)}</p>
    <table style="border-collapse:collapse;margin-bottom:18px;">
      ${row('Campaña', _esc(campaignName || 'General'))}
      ${row('Deadline interno', dueDate ? _esc(formatDate(dueDate)) : '')}
      ${row('Deadline cliente', clientDueDate ? _esc(formatDate(clientDueDate)) : '')}
    </table>
    ${notes ? `<p style="font-size:13px;color:#374151;white-space:pre-wrap;margin:0 0 18px;">${_esc(notes)}</p>` : ''}
    <a href="${location.origin}/#pendientes" style="display:inline-block;background:#ff2d87;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:10px 18px;border-radius:10px;">Ver en Campaign OS</a>
    <p style="font-size:11px;color:#9ca3af;margin:22px 0 0;">Puedes apagar estos correos en Ajustes → Notificaciones.</p>
  </div>`;
}

// ============================================================
// KUDOS
// ============================================================
// Un aviso por papel. "Te asignaron una tarea" cuando en realidad te pusieron
// de supervisor hace que la gente abra cosas que no le tocaban, y al revés:
// los supervisores ignoran los avisos porque nunca son suyos.
const _TASK_ROLE_COPY = {
  assignee:   { icon:'✅', verb:'te asignó',                  self:'Te asignaste',             role:'Responsable'   },
  supervisor: { icon:'👁', verb:'te puso como supervisor de', self:'Te pusiste de supervisor de', role:'Supervisor' },
  watcher:    { icon:'👥', verb:'te sumó a',                  self:'Te sumaste a',             role:'Colaborador'   },
};

function _notifyTaskPeople({ title, campaignId, dueDate, clientDueDate, notes, added }) {
  if(!added) return;
  const c = campaignId ? (getData('campaigns')||[]).find(x => x.id === campaignId) : null;
  const campaignName = c ? c.name : 'General';
  const extra = c ? ` en ${c.name}` : '';
  const who = currentUserProfile?.name || currentUser?.email || 'Alguien';

  const send = (uid, kind) => {
    if(!uid) return;
    const cp = _TASK_ROLE_COPY[kind];
    const when = dueDate ? ` · vence ${formatDateShort(dueDate)}` : '';
    // "Paulo te asignó" leído por Paulo es absurdo. Mismo aviso, otra voz.
    const frase = uid === currentUser?.uid
      ? `${cp.icon} ${cp.self} una tarea${extra}: "${title}"${when}`
      : `${cp.icon} ${who} ${cp.verb} una tarea${extra}: "${title}"${when}`;
    _createNotification({
      toUid: uid,
      type: 'task_assigned',
      text: frase,
      email: {
        subject: `${cp.role} · ${title}`,
        html: _taskEmailHtml({ role:cp.role, who, title, campaignName, dueDate, clientDueDate, notes }),
      },
    });
  };

  send(added.assignee, 'assignee');
  (added.supervisors || []).forEach(uid => send(uid, 'supervisor'));
  (added.watchers    || []).forEach(uid => send(uid, 'watcher'));
}

// Compat: el resto de la app sigue llamando a la versión vieja de un solo uid.
function _notifyTaskAssigned(uid, title, campaignId) {
  _notifyTaskPeople({ title, campaignId, added:{ assignee: uid } });
}

// Etiquetar a alguien en una CAMPAÑA avisa igual que etiquetarlo en una tarea.
// Antes solo avisaban las tareas: te ponían de responsable de Cuentas de una
// campaña y no te enterabas hasta que alguien te escribía por otro lado.
const _CAMP_AREA_LABEL = {
  operaciones:'Operaciones', cuentas:'Cuentas', creativo:'Creativo',
  data:'Data', administracion:'Administración',
};

function _notifyCampaignRoles(campaignName, campaignId, added) {
  if(!added) return;
  const who = currentUserProfile?.name || currentUser?.email || 'Alguien';

  const send = (uid, texto, texoPropio) => {
    if(!uid) return;
    _createNotification({
      toUid: uid,
      type: 'campaign_role',
      text: uid === currentUser?.uid ? texoPropio : texto,
    });
  };

  Object.keys(added.responsables || {}).forEach(area => {
    const label = _CAMP_AREA_LABEL[area] || area;
    (added.responsables[area] || []).forEach(uid => send(uid,
      `🧭 ${who} te puso como responsable de ${label} en "${campaignName}"`,
      `🧭 Te pusiste como responsable de ${label} en "${campaignName}"`));
  });

  (added.assignees || []).forEach(uid => send(uid,
    `📋 ${who} te sumó a la campaña "${campaignName}"`,
    `📋 Te sumaste a la campaña "${campaignName}"`));
}

// Diferencia entre dos mapas de responsables: solo los que ENTRAN.
// Sin esto, cada guardado de la campaña volvería a avisar a todo el mundo.
function _diffResponsables(antes, despues) {
  const out = {};
  const norm = v => Array.isArray(v) ? v.filter(Boolean) : (v ? [v] : []);
  Object.keys(_CAMP_AREA_LABEL).forEach(area => {
    const viejos = new Set(norm((antes || {})[area]));
    const nuevos = norm((despues || {})[area]).filter(uid => !viejos.has(uid));
    if(nuevos.length) out[area] = nuevos;
  });
  return out;
}

function _notifyCampaignSubscribers(campaign, summary) {
  if(!campaign) return;
  const subs = Array.isArray(campaign.subscribers) ? campaign.subscribers : [];
  // Auto-subscribers: anyone with an active task in this campaign
  const taskUids = (campaign.tasks||[]).map(t => t.assigneeUid).filter(Boolean);
  const all = Array.from(new Set([...subs, ...taskUids])).filter(uid => uid && uid !== currentUser?.uid);
  const who = currentUserProfile?.name || currentUser?.email || 'Alguien';
  all.forEach(uid => _createNotification({
    toUid: uid,
    type: 'campaign_update',
    text: `📣 ${who} actualizó ${campaign.name}: ${summary}`
  }));
}

function toggleCampaignSubscription(campaignId) {
  if(!currentUser) return;
  const campaigns = getData('campaigns');
  const c = campaigns.find(x => x.id === campaignId);
  if(!c) return;
  c.subscribers = Array.isArray(c.subscribers) ? c.subscribers : [];
  const uid = currentUser.uid;
  const idx = c.subscribers.indexOf(uid);
  if(idx >= 0) { c.subscribers.splice(idx,1); showToast('Suscripción desactivada'); }
  else { c.subscribers.push(uid); showToast('Te suscribiste a esta campaña','success'); }
  setData('campaigns', campaigns);
  if(currentCampaignId === campaignId) openCampaignDetail(campaignId);
}

async function sendKudos(toUid, e) {
  if(e) e.stopPropagation();
  const toUser = allUsers.find(u=>u.uid===toUid);
  if(!toUser) return;
  const name = toUser.name || toUser.email.split('@')[0];
  const emojis = ['🏆','⭐','🔥','💪','🎉','❤️','✨'];
  const pick = emojis[Math.floor(Math.random()*emojis.length)];
  await _createNotification({
    toUid,
    type: 'kudos',
    text: `${pick} ${currentUserProfile?.name||'Alguien'} te envió kudos. ¡Buen trabajo!`
  });
  showToast(`Kudos enviado a ${name} ${pick}`,'success');
}

// ============================================================
// EMOJI REACTIONS ON TASKS
// ============================================================
const REACTION_EMOJIS = ['👍','❤️','🔥','✅','😅'];

function _reactionHtml(t, cid) {
  const reactions = t.reactions || {};
  const hasAny = Object.values(reactions).some(u=>u.length>0);
  const buttons = REACTION_EMOJIS.map(e => {
    const users = reactions[e] || [];
    const reacted = users.includes(currentUser?.uid);
    return users.length > 0 || !hasAny
      ? `<button class="reaction-btn ${reacted?'reacted':''}" onclick="toggleReaction('${t.id}','${cid}','${e}',event)">${e}${users.length>0?' '+users.length:''}</button>`
      : '';
  }).join('');
  // Show add-reaction button only if clicking it
  return `<div class="task-reactions" style="${hasAny?'':'display:none'}" id="reactions-${t.id}">${buttons}</div>`;
}

function toggleReaction(tid, cid, emoji, e) {
  if(e) e.stopPropagation();
  if(!currentUser) return;
  const uid = currentUser.uid;
  // Find task in cache
  let task = null;
  if(cid) {
    const c = _cache.campaigns.find(x=>x.id===cid);
    if(c) task = c.tasks.find(x=>x.id===tid);
  } else {
    task = (_cache.globalTasks||[]).find(x=>x.id===tid);
  }
  if(!task) return;
  if(!task.reactions) task.reactions = {};
  if(!task.reactions[emoji]) task.reactions[emoji] = [];
  const idx = task.reactions[emoji].indexOf(uid);
  if(idx > -1) task.reactions[emoji].splice(idx,1);
  else task.reactions[emoji].push(uid);
  // Persist
  if(cid) {
    const campaigns = getData('campaigns');
    const c = campaigns.find(x=>x.id===cid);
    if(c) { const t2=c.tasks.find(x=>x.id===tid); if(t2) t2.reactions=task.reactions; setData('campaigns',campaigns); }
  } else {
    const tasks = getData('globalTasks');
    const t2 = tasks.find(x=>x.id===tid);
    if(t2) { t2.reactions=task.reactions; setData('globalTasks',tasks); }
  }
  // Re-render reactions inline
  const el = document.getElementById('reactions-'+tid);
  if(el) {
    const hasAny = Object.values(task.reactions).some(u=>u.length>0);
    el.style.display = hasAny ? '' : 'none';
    el.innerHTML = REACTION_EMOJIS.map(em=>{
      const users = task.reactions[em]||[];
      const reacted = users.includes(uid);
      return users.length>0
        ? `<button class="reaction-btn ${reacted?'reacted':''}" onclick="toggleReaction('${tid}','${cid}','${em}',event)">${em} ${users.length}</button>`
        : '';
    }).join('');
  }
}

function showReactions(tid, cid, e) {
  if(e) e.stopPropagation();
  const el = document.getElementById('reactions-'+tid);
  if(el) {
    el.style.display = '';
    el.innerHTML = REACTION_EMOJIS.map(em=>`<button class="reaction-btn" onclick="toggleReaction('${tid}','${cid}','${em}',event)">${em}</button>`).join('');
  }
}

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
  setData('campaigns', campaigns);
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
  for(const k of TRACKER_STATUS_KEYS){
    const kn = _trackerNorm(k);
    for(const rk of Object.keys(row)){
      if(_trackerNorm(rk)===kn && row[rk]!=null && row[rk]!==''){
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

function _trackerNorm(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[_\s\/]+/g,' ').trim(); }
function _trackerGet(row, keys){
  for(const k of keys){
    const kn = _trackerNorm(k);
    for(const rk of Object.keys(row)){
      if(_trackerNorm(rk)===kn && row[rk]!=null && row[rk]!=='') return row[rk];
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
      if(!isNaN(d)) return d.toISOString().split('T')[0];
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
  if(!isNaN(d)) return d.toISOString().split('T')[0];
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
          <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.8px;">📈 Publicaciones por ${periodTitle}</div>
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
        <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px;">🎨 Desglose por Plataforma Creativa</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">
          ${Object.entries(creativaCounts).sort((a,b)=>b[1]-a[1]).map(([s,c])=>makeCreativaCard(s,c)).join('')||'<span style="font-size:12px;color:var(--text-muted);">Sin datos en columna "PLATAFORMA CREATIVA"</span>'}
        </div>
      </div>
      ${chartHtml}
      ${weeklyTableHtml}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div style="background:var(--bg);border:1px solid var(--border);border-radius:14px;padding:14px 16px;">
          <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px;">📝 Estatus Guión</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;">
            ${Object.entries(guionCounts).map(([s,c])=>makeSummaryCard(s,c,'guion')).join('')||'<span style="font-size:12px;color:var(--text-muted);">Sin datos</span>'}
          </div>
        </div>
        <div style="background:var(--bg);border:1px solid var(--border);border-radius:14px;padding:14px 16px;">
          <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px;">🎬 Estatus Contenido</div>
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
    wrap.innerHTML = `<div class="empty-state"><p>Cargando datos del tracker...</p></div>`;
    _autoFetchTracker(c.trackerSheetUrl, c, {silent:true});
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
  if(!csvUrl) return;
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
      setData('campaigns',campaigns);
    } // else: campaign was deleted while we were fetching — drop the write
    if(opts.silent !== true) showToast('Tracker sincronizado','success');
  } catch(e) {
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
  if(c) { c.trackerSheetUrl = url; setData('campaigns',campaigns); }
}

function syncTracker() {
  const url = document.getElementById('trackerSheetsUrl')?.value?.trim();
  if(!url) { showToast('Pega la URL del master tracker.','error'); return; }
  const campaigns = getData('campaigns');
  const c = campaigns.find(x=>x.id===currentCampaignId);
  if(!c) return;
  c.trackerSheetUrl = url;
  setData('campaigns',campaigns);
  const wrap = document.getElementById('trackerTableWrap');
  if(wrap) wrap.innerHTML = `<div class="empty-state"><p>Cargando...</p></div>`;
  showToast('Sincronizando tracker…','success');
  _autoFetchTracker(url, c);
}

