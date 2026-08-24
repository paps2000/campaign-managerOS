/* Campaign OS — Calendario, perfil, onboarding, easter eggs, command palette, asistente IA
   Extraído de index.html. Script CLÁSICO a propósito (NO type="module"):
   el HTML llama estas funciones desde atributos onclick/onchange, que solo
   resuelven contra el scope global. El orden de carga en index.html replica
   el orden original de ejecución y no debe alterarse. */

// ============================================================
// CALENDAR PAGE
// ============================================================
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth(); // 0-based

function calNav(dir) {
  if(dir === 0) { calYear = new Date().getFullYear(); calMonth = new Date().getMonth(); }
  else { calMonth += dir; if(calMonth > 11) { calMonth=0; calYear++; } else if(calMonth < 0) { calMonth=11; calYear--; } }
  renderCalendar();
}

// Map an ESTATUS CONTENIDO string to a calendar chip style (bg, text color,
// emoji prefix, normalized status key). Mirrors trackerStatusBadge palette
// so the calendar and the tracker tab share visual language.
const TRACKER_STATUS_STYLES = [
  { key:'publicado',    test:/^publicad|^[✅✔☑✓]/i,                  bg:'#166534', color:'#fff', icon:ICN_check, label:'Publicado' },
  { key:'por_publicar', test:/^por\s*publicar|^⚠/i,                  bg:'#fca5a5', color:'#991b1b', icon:ICN_calendar, label:'Por publicar' },
  { key:'aprobado',     test:/^aprobad/i,                            bg:'#bbf7d0', color:'#166534', icon:ICN_thumbsUp, label:'Aprobado' },
  { key:'rev_int',      test:/revisi[oó]n\s*\(?\s*int/i,             bg:'#fef08a', color:'#854d0e', icon:ICN_search, label:'Revisión interna' },
  { key:'rev_ext',      test:/revisi[oó]n\s*\(?\s*ext/i,             bg:'#fde047', color:'#713f12', icon:ICN_eye, label:'Revisión externa' },
  { key:'grabacion',    test:/grabaci[oó]n/i,                        bg:'#ede9fe', color:'#5b21b6', icon:ICN_play, label:'En grabación' },
  { key:'corrigiendo',  test:/corrigiendo/i,                         bg:'#78350f', color:'#fff',    icon:ICN_edit, label:'Corrigiendo' },
  { key:'guion',        test:/(trabajando\s*gui[oó]n|trab\.\s*gui)/i,bg:'#f3e8ff', color:'#7c3aed', icon:ICN_doc, label:'Trabajando guión' },
  { key:'pendiente',    test:/^pendiente/i,                          bg:'#991b1b', color:'#fff',    icon:ICN_clock, label:'Pendiente' },
  { key:'cancelado',    test:/^cancelad/i,                           bg:'#475569', color:'#fff',    icon:ICN_ban, label:'Cancelado' },
];
function _trackerStatusEventStyle(estatusRaw) {
  const s = String(estatusRaw||'').trim();
  for(const entry of TRACKER_STATUS_STYLES) {
    if(entry.test.test(s)) return { ...entry, statusKey: entry.key };
  }
  // Unknown / empty
  return { key:'unknown', bg:'#e5e7eb', color:'#374151', icon:ICN_pin, label:'Sin estatus', statusKey:'unknown' };
}

function renderCalendar() {
  const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  document.getElementById('calMonthTitle').textContent = MONTHS[calMonth] + ' ' + calYear;
  const grid = document.getElementById('calGrid');
  if(!grid) return;

  // Lazy: for any visible campaign with a tracker URL but no cached rows,
  // fetch in the background so events appear on the next render. Idempotent.
  // Debounced: schedule a single calendar re-render once any fetch settles
  // so we don't cascade N re-renders for N campaigns.
  let _calNeedsRefresh = false;
  misCampanas().forEach(c => {
    if(c.trackerSheetUrl && (!c.trackerRows || !c.trackerRows.length) && !c._trackerFetching) {
      c._trackerFetching = true;
      _autoFetchTracker(c.trackerSheetUrl, c, {silent:true}).finally(()=>{
        c._trackerFetching = false;
        _calNeedsRefresh = true;
      });
    }
  });
  // Single deferred re-render after current event loop drains
  if(typeof window._calRefreshTimer === 'undefined') window._calRefreshTimer = null;
  if(window._calRefreshTimer) clearTimeout(window._calRefreshTimer);
  window._calRefreshTimer = setTimeout(() => {
    window._calRefreshTimer = null;
    if(_calNeedsRefresh && currentPage === 'calendario') {
      try { renderCalendar(); } catch(e){}
    }
  }, 800);

  // Build event map: date string → [{type,label,color,campName}]
  const events = {};
  const add = (date, ev) => { if(!date) return; if(!events[date]) events[date]=[]; events[date].push(ev); };

  misCampanas().forEach(c => {
    // Campaign start/end
    if(c.startDate) add(c.startDate, {type:'start', label:c.name, icon:ICN_rocket, color:'rgba(198,242,74,0.85)', text:'#2a5a18'});
    if(c.endDate)   add(c.endDate,   {type:'end',   label:c.name, icon:ICN_flag, color:'rgba(240,200,74,0.85)', text:'#6a4800'});
    // Publications
    (c.influencers||[]).forEach(inf => {
      if(inf.publishDate) add(inf.publishDate, {type:'pub', label:inf.name||inf.handle, icon:ICN_sparkle, color:'var(--pink)', text:'#fff'});
    });
    // Tracker publications (Master Tracker / Social Calendar)
    // Color the chip based on ESTATUS CONTENIDO (Publicado, Por publicar, ...)
    // using the same palette as trackerStatusBadge so the calendar legend
    // matches the badges shown in the Tracker tab.
    const campYear = (c.startDate && parseInt(c.startDate.slice(0,4))) || calYear;
    (c.trackerRows||[]).forEach(row => {
      let raw = '';
      for(const k of ['FECHA DE POST','Fecha de Post','Fecha publicación','Fecha de publicación','Fecha Pub','Fecha']) {
        if(row[k]) { raw = row[k]; break; }
      }
      if(!raw) {
        // case-insensitive fallback
        for(const rk of Object.keys(row)) {
          if(/fecha/i.test(rk) && row[rk]) { raw = row[rk]; break; }
        }
      }
      const iso = _trackerParseDate(raw, campYear);
      if(!iso) return;
      const name = _trackerGet(row, TRACKER_NAME_KEYS)||'';
      const creativa = _trackerGet(row, TRACKER_CREATIVA_KEYS)||'';
      const estatusRaw = String(_trackerStatusOf(row)||'').trim();
      const sty = _trackerStatusEventStyle(estatusRaw);
      // Skip cancelled rows — user request: not shown on calendar
      if(sty.statusKey === 'cancelado') return;
      const icon = sty.icon;
      const label = icon + (creativa? creativa+' · ':'') + (name || 'Publicación');
      add(iso, {type:'pub', status: sty.statusKey, statusLabel: sty.label, statusIcon: sty.icon, label, color: sty.bg, text: sty.color, campaignId:c.id, campaignName:c.name});
    });
    // Campaign tasks
    (c.tasks||[]).filter(t=>!t.done&&t.dueDate).forEach(t => {
      add(t.dueDate, {type:'task', label:t.title, icon:ICN_clipboard, color:'var(--lavender)', text:'#fff'});
    });
  });
  // Global tasks
  (_cache.globalTasks||[]).filter(t=>!t.done&&t.dueDate).forEach(t => {
    add(t.dueDate, {type:'task', label:t.title, icon:ICN_clipboard, color:'var(--lavender)', text:'#fff'});
  });

  // Grid cells: Monday-first
  const firstDay = new Date(calYear, calMonth, 1);
  const lastDay  = new Date(calYear, calMonth+1, 0);
  // dow: Mon=0 … Sun=6
  const startDow = (firstDay.getDay()+6) % 7;
  const todayStr = new Date().toISOString().split('T')[0];
  const pad = n => String(n).padStart(2,'0');
  const dateStr = d => `${calYear}-${pad(calMonth+1)}-${pad(d)}`;

  let html = '';
  const totalCells = startDow + lastDay.getDate();
  const rows = Math.ceil(totalCells/7);

  for(let i=0; i < rows*7; i++) {
    const day = i - startDow + 1;
    const inMonth = day >= 1 && day <= lastDay.getDate();
    const ds = inMonth ? dateStr(day) : '';
    const isToday = ds === todayStr;
    const evs = (ds && events[ds]) || [];
    const weekend = (i%7 === 5 || i%7 === 6);
    const cellBg = !inMonth ? 'background:var(--bg);' : (isToday ? 'background:var(--pink-pale);' : '');
    html += `<div style="min-height:90px;border-right:1px solid var(--border);border-bottom:1px solid var(--border);padding:6px 5px;box-sizing:border-box;${cellBg}">`
      + (inMonth ? `<div style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;margin-bottom:4px;font-size:12px;font-weight:700;${isToday?'background:var(--pink);color:#fff;':'color:'+(weekend?'var(--text-muted)':'var(--text)')+';'}">${day}</div>` : '')
      + evs.slice(0,3).map(ev=>`<div style="font-size:10px;font-weight:600;padding:2px 5px;border-radius:4px;background:${ev.color};color:${ev.text};margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${_esc(ev.label)}"><span class="cal-chip-icn">${ev.icon||ev.statusIcon||''}</span>${_esc(ev.label)}</div>`).join('')
      + (evs.length > 3 ? `<div style="font-size:10px;color:var(--text-muted);padding:1px 4px;">+${evs.length-3} más</div>` : '')
      + `</div>`;
  }
  grid.innerHTML = html;

  // ── Agenda (teléfono) ──
  // La rejilla de mes reparte el ancho entre siete columnas. En 375px eso deja
  // 49px por día: los números del mes se leen, pero el contenido —que es lo que
  // se viene a consultar— queda en "@ju…". La agenda usa los MISMOS eventos y
  // los pone en lista, con el día a la izquierda y las etiquetas completas a la
  // derecha, que es como cabe un mes en una pantalla angosta.
  //
  // Se listan sólo los días que tienen algo. Un mes en blanco son treinta filas
  // vacías que hay que scrollear para descubrir que no hay nada; mejor decirlo.
  const agenda = document.getElementById('calAgenda');
  if(agenda) {
    const DIAS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
    const conEventos = [];
    for(let dnum = 1; dnum <= lastDay.getDate(); dnum++) {
      const ds = dateStr(dnum);
      const evs = events[ds];
      if(evs && evs.length) conEventos.push({ ds, dnum, evs });
    }

    if(!conEventos.length) {
      agenda.innerHTML = `<div class="card"><div class="empty-state">`
        + `<div class="empty-icon">${ICN_calendar}</div>`
        + `<p>Nada agendado en ${MONTHS[calMonth].toLowerCase()}.</p></div></div>`;
    } else {
      agenda.innerHTML = conEventos.map(({ds, dnum, evs}) => {
        const fecha = new Date(calYear, calMonth, dnum);
        const esHoy = ds === todayStr;
        const finde = fecha.getDay() === 0 || fecha.getDay() === 6;
        // Aquí no se corta a tres como en la rejilla: en lista no hay motivo,
        // la fila crece y el "+2 más" obligaba a abrir el día para ver algo
        // que ya cabía.
        const chips = evs.map(ev => `<div class="cal-ag-chip" style="background:${ev.color};color:${ev.text};"><span class="cal-chip-icn">${ev.icon||ev.statusIcon||''}</span>${_esc(ev.label)}</div>`).join('');
        return `<div class="cal-ag-dia${esHoy ? ' hoy' : ''}${finde ? ' finde' : ''}">
          <div class="cal-ag-fecha">
            <span class="cal-ag-num">${dnum}</span>
            <span class="cal-ag-dow">${DIAS[fecha.getDay()]}</span>
          </div>
          <div class="cal-ag-evs">${chips}</div>
        </div>`;
      }).join('');
    }
  }

  // Build dynamic legend from the statuses actually present in this view
  const legend = document.getElementById('calLegend');
  if(legend) {
    const seen = new Map(); // statusKey → {bg, color, label, icon}
    Object.values(events).forEach(arr => arr.forEach(ev => {
      if(ev.type === 'pub' && ev.status && ev.status !== 'cancelado') {
        if(!seen.has(ev.status)) seen.set(ev.status, { bg: ev.color, color: ev.text, label: ev.statusLabel || ev.status, icon: (ev.statusIcon||'').trim() });
      }
    }));
    const fixed = [
      { bg:'var(--lavender)', color:'#fff',    icon:ICN_clipboard, label:'Tarea',           show: Object.values(events).some(a => a.some(e => e.type==='task')) },
      { bg:'rgba(198,242,74,0.85)', color:'#2a5a18', icon:ICN_rocket, label:'Inicio campaña',  show: Object.values(events).some(a => a.some(e => e.type==='start')) },
      { bg:'rgba(240,200,74,0.85)', color:'#6a4800', icon:ICN_flag, label:'Cierre campaña',  show: Object.values(events).some(a => a.some(e => e.type==='end')) },
    ].filter(x => x.show);
    // Order: tracker statuses (defined order), then task/campaign markers
    const orderedStatuses = TRACKER_STATUS_STYLES
      .filter(s => s.key !== 'cancelado')
      .map(s => s.key)
      .filter(k => seen.has(k));
    if(seen.has('unknown')) orderedStatuses.push('unknown');
    const chips = [
      ...orderedStatuses.map(k => seen.get(k)),
      ...fixed,
    ];
    legend.innerHTML = chips.length === 0
      ? '<span style="font-size:11px;color:var(--text-muted);">Sin publicaciones en este mes.</span>'
      : chips.map(c => `<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:14px;background:${c.bg};color:${c.color};font-size:11px;font-weight:700;"><span class="cal-chip-icn">${c.icon||''}</span>${_esc(c.label)}</span>`).join('');
  }
}

// ============================================================
// PROFILE MODAL
// ============================================================
function openProfileModal(uid) {
  const u = allUsers.find(x => x.uid === uid);
  if(!u) return;

  // Tasks assigned to this user
  const allTasks = [
    ..._cache.campaigns.flatMap(c => (c.tasks||[]).filter(t => t.assigneeUid === uid).map(t => ({...t, campaignName: c.name, campaignId: c.id}))),
    ..._cache.globalTasks.filter(t => t.assigneeUid === uid).map(t => ({...t, campaignName: t.campaignName||'General'}))
  ];
  const active = allTasks.filter(t => !t.done);
  const done   = allTasks.filter(t => t.done).slice(0,5);

  // Las campañas de esta persona: responsable de un área, o suscrita.
  const userCampaigns = _cache.campaigns.filter(c => {
    if(typeof esResponsableDe === 'function' && esResponsableDe(c, uid)) return true;
    const perfil = (allUsers || []).find(u => u.uid === uid);
    const subs = (perfil && perfil.subscribedCampaigns) || [];
    return subs.includes(c.id);
  });

  const taskRow = (t, isDone) => `
    <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);">
      <div style="width:8px;height:8px;border-radius:50%;margin-top:5px;flex-shrink:0;background:${t.priority==='high'?'var(--red)':t.priority==='medium'?'var(--yellow)':'var(--border)'}"></div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:600;${isDone?'text-decoration:line-through;color:var(--text-muted);':''}">${_esc(t.title)}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:2px;display:flex;gap:8px;flex-wrap:wrap;">
          <span>${_esc(t.campaignName)}</span>
          ${t.dueDate?`<span>${formatDate(t.dueDate)}</span>`:''}
        </div>
      </div>
    </div>`;

  const campCard = c => `
    <div onclick="openCampaignDetail('${c.id}');closeModal('profileModal');" style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--border);border-radius:10px;cursor:pointer;transition:all var(--dur-quick);" onmouseover="this.style.borderColor='var(--pink)'" onmouseout="this.style.borderColor='var(--border)'">
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${_esc(c.name)}</div>
        <div style="font-size:11px;color:var(--text-muted);">${_esc(c.client||'')}</div>
      </div>
      <span class="badge ${statusBadgeClass(c.status)}" style="font-size:10px;">${_esc(c.status)}</span>
    </div>`;

  document.getElementById('profileModalContent').innerHTML = `
    <!-- LA CREDENCIAL ES LA PORTADA. Antes había aquí un header con degradado
         que repetía avatar, nombre, puesto y área — exactamente lo que la
         tarjeta ya certifica. Ahora la tarjeta es lo primero y lo único que
         presenta a la persona; lo que no cabe en una credencial (correo,
         estado, bio) va debajo, en texto. -->
    <div class="profile-cred-band" style="--band:${u.profileGradient||'linear-gradient(135deg,#ff2d87,#a855f7)'};">
      <div class="holo-host" id="profileHoloHost"></div>
      <div class="profile-cred-actions">
        <button class="btn btn-ghost btn-sm" onclick="holoShareCard('${u.uid}')" style="display:inline-flex;align-items:center;gap:7px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v14"/></svg>
          Compartir
        </button>
        ${u.uid === currentUser?.uid ? `<button class="btn btn-ghost btn-sm" onclick="closeModal('profileModal');openEditProfileModal();">Personalizar</button>` : ''}
      </div>
    </div>

    <!-- Cuerpo -->
    <div style="padding:20px 24px 24px;">
      <!-- Lo que una credencial no lleva: contacto, estado y bio. -->
      <div class="profile-meta">
        <div class="profile-meta-main">
          <div class="profile-meta-name">${_esc(u.name||'—')}${u.pronouns?` <span>${_esc(_shortPronouns(u.pronouns)||u.pronouns)}</span>`:''}</div>
          <a href="mailto:${_esc(u.email||'')}" class="profile-meta-mail">${_esc(u.email||'')}</a>
        </div>
        ${u.role==='admin'?'<span class="badge badge-lavender">Admin</span>':''}
      </div>
      ${u.statusText ? `<div class="profile-meta-status">${u.statusEmoji||'💬'} ${_esc(u.statusText)}</div>` : ''}
      ${u.tagline ? `<div class="profile-meta-line" style="font-style:italic;">${_esc(u.tagline)}</div>` : ''}
      ${u.bio ? `<div class="profile-meta-line">“${_esc(u.bio)}”</div>` : ''}
      <!-- Stats row -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px;">
        <div style="text-align:center;padding:14px 12px;background:var(--pink-pale);border-radius:16px;border:1px solid rgba(255,45,135,.12);">
          <div style="font-size:27px;font-weight:700;color:var(--pink);line-height:1;">${active.length}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px;font-weight:600;">Pendientes</div>
        </div>
        <div style="text-align:center;padding:14px 12px;background:var(--lavender-pale);border-radius:16px;border:1px solid rgba(44,109,255,.12);">
          <div style="font-size:27px;font-weight:700;color:var(--lavender);line-height:1;">${userCampaigns.length}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px;font-weight:600;">Campañas</div>
        </div>
        <div style="text-align:center;padding:14px 12px;background:var(--mint-pale);border-radius:16px;border:1px solid rgba(58,122,94,.14);">
          <div style="font-size:27px;font-weight:700;color:#3a7a5e;line-height:1;">${done.length}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px;font-weight:600;">Completadas</div>
        </div>
      </div>
      <!-- Campaigns -->
      ${userCampaigns.length ? `
      <div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">Campañas</div>
      <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:20px;">${userCampaigns.map(campCard).join('')}</div>
      ` : ''}
      <!-- Active tasks -->
      <div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">Tareas activas</div>
      ${active.length ? active.map(t=>taskRow(t,false)).join('') : '<div style="color:var(--text-muted);font-size:13px;padding:12px 0;">Sin tareas activas 🎉</div>'}
      ${done.length ? `
        <div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin:20px 0 10px;">Completadas recientes</div>
        ${done.map(t=>taskRow(t,true)).join('')}
      ` : ''}
    </div>`;
  // Después del innerHTML: el host tiene que existir para poder medirlo.
  try { mountHoloInto('profileHoloHost', u); } catch(e) { console.warn('holo mount', e); }
  openModal('profileModal');
}

// ============================================================
// MY PROFILE EDIT — v2
// ============================================================
let _editProfileEmoji = '';
let _editProfileGradient = 'linear-gradient(135deg,#ff2d87,#2c6dff)';
let _editProfileShape = 'rounded';
let _editStatusEmoji = '💬';
let _currentEmojiCat = 'animales';

const SHAPE_RADIUS = {
  circle:  (size) => '50%',
  rounded: (size) => Math.round(size * 0.28) + 'px',
  square:  (size) => Math.max(3, Math.round(size * 0.13)) + 'px',
};

function getAvatarRadius(u, size, fallback) {
  if(size < 22) return fallback || '50%';
  const shape = u?.profileShape || 'rounded';
  return (SHAPE_RADIUS[shape] || SHAPE_RADIUS.rounded)(size);
}

const EMOJI_CATS = {
  'inicial':   { label:'Aa', emojis:[] },
  'animales':  { label:'🐾', emojis:['🦁','🐯','🐺','🦊','🐉','🦋','🐬','🦅','🐙','🦄','🦈','🐸','🐼','🦒','🦩','🐧'] },
  'vibra':     { label:'✨', emojis:['🔥','⚡','💫','🌙','☀️','🌊','🌸','🌺','🌟','💎','🎯','🚀','🏆','👑','💫','🌈'] },
  'personas':  { label:'👤', emojis:['🤖','👾','🎭','🤠','🤩','🦸','🧙','🤓','😎','🦹','🧸','👻','🤡','🧠','💀','🫶'] },
  'objetos':   { label:'🎮', emojis:['🎸','📸','🎮','✏️','🎨','💻','🎵','📱','🎬','🎪','🧪','🎁','🎲','🏋️','🧩','🎤'] },
};

const SOLID_COLORS = [
  {bg:'#ff2d87', label:'Pink'},
  {bg:'#2c6dff', label:'Azul'},
  {bg:'#a855f7', label:'Morado'},
  {bg:'#16a34a', label:'Verde'},
  {bg:'#f97316', label:'Naranja'},
  {bg:'#0891b2', label:'Cyan'},
  {bg:'#dc2626', label:'Rojo'},
  {bg:'#1a1a2e', label:'Dark'},
];
const GRADIENT_COLORS = [
  {bg:'linear-gradient(135deg,#ff2d87,#2c6dff)', label:'Pink → Azul'},
  {bg:'linear-gradient(135deg,#ff2d87,#a855f7)', label:'Pink → Morado'},
  {bg:'linear-gradient(135deg,#a855f7,#2c6dff)', label:'Morado → Azul'},
  {bg:'linear-gradient(135deg,#c6f24a,#2c6dff)', label:'Mint → Azul'},
  {bg:'linear-gradient(135deg,#ff2d87,#fbbf24)', label:'Pink → Dorado'},
  {bg:'linear-gradient(135deg,#fbbf24,#f97316)', label:'Dorado'},
  {bg:'linear-gradient(135deg,#c6f24a,#16a34a)', label:'Verde'},
  {bg:'linear-gradient(135deg,#1a1a2e,#2c6dff)', label:'Dark → Azul'},
];

function memberAvatarHtml(u, size=20, radius='50%') {
  if(!u) return '';
  const bg      = u.profileGradient || 'var(--lavender)';
  const content = u.profileEmoji || (u.name||u.email||'?')[0].toUpperCase();
  const r       = getAvatarRadius(u, size, radius);
  const fontSize = u.profileEmoji ? `${Math.round(size*0.6)}px` : `${Math.round(size*0.5)}px`;
  return `<span style="width:${size}px;height:${size}px;border-radius:${r};background:${bg};color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:${fontSize};font-weight:700;flex-shrink:0;cursor:pointer;" onclick="openProfileModal('${u.uid||''}')" title="${_esc(u.name||u.email||'')}">${content}</span>`;
}

function applyAvatarEl(el, profile) {
  if(!el) return;
  const bg      = profile.profileGradient || 'var(--pink)';
  const content = profile.profileEmoji || (profile.name||profile.email||'?')[0].toUpperCase();
  const r       = getAvatarRadius(profile, parseInt(el.style.width)||34, '12px');
  el.style.background   = bg;
  el.style.borderRadius = r;
  el.style.fontSize     = profile.profileEmoji ? '18px' : '';
  el.textContent        = content;
}

function updateSidebarAvatar() {
  const el = document.getElementById('userAvatarSidebar');
  if(el && currentUserProfile) {
    applyAvatarEl(el, currentUserProfile);
    // Keep sidebar avatar always rounded-square regardless of shape (it's small)
    el.style.borderRadius = '12px';
  }
  // Status row
  const statusRow = document.getElementById('userStatusRow');
  const statusEl  = document.getElementById('userStatusSidebar');
  if(statusRow && statusEl && currentUserProfile) {
    const se = currentUserProfile.statusEmoji || '';
    const st = currentUserProfile.statusText  || '';
    if(st) {
      statusEl.textContent       = (se ? se + ' ' : '') + st;
      statusRow.style.display    = 'flex';
    } else {
      statusRow.style.display    = 'none';
    }
  }
  renderSidebarTeam();
}

function renderSidebarTeam() { /* sidebar team strip removed */ }

function clearMyStatus(e) {
  e.stopPropagation();
  if(!currentUser || !currentUserProfile) return;
  currentUserProfile.statusText  = '';
  currentUserProfile.statusEmoji = '💬';
  const updates = { statusText:'', statusEmoji:'💬' };
  const ws = db.collection('workspaces').doc(WORKSPACE);
  Promise.all([
    ws.collection('members').doc(currentUser.uid).set(updates, {merge:true}),
    db.collection('users').doc(currentUser.uid).set(updates, {merge:true})
  ]).catch(err => console.error('clearMyStatus error', err));
  updateSidebarAvatar();
  showToast('Estado eliminado', 'success');
}

function switchProfileTab(tab) {
  document.querySelectorAll('.profile-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.ptab === tab));
  document.querySelectorAll('.profile-tab-pane').forEach(p => p.classList.toggle('active', p.id === 'ptab-' + tab));
  // La credencial se monta al ENTRAR a su pestaña, no al abrir el modal: en un
  // panel oculto mide 0 de ancho, y todo su tipografía va en unidades de
  // contenedor — montarla ahí la deja con las letras colapsadas.
  if(tab === 'credencial') _mountHoloPreview();
  else if(typeof unmountHolo === 'function') unmountHolo('holoPreviewHost');
}

// ── CREDENCIAL: material, tinta y stickers ──
let _editCardFoil = 'holo';
let _editCardTint = 'rosa';
let _editCardStickers = [];
/* Si la credencial muestra las campañas de su dueño. Encendido por defecto:
   la tira existe para que se vea de un vistazo qué lleva cada quien, y una
   opción apagada por defecto no la vería nadie. */
let _editCardCampaigns = true;

function _mountHoloPreview() {
  if(!currentUserProfile) return;
  // Se monta con los valores EN EDICIÓN, no con los guardados: la vista previa
  // tiene que mostrar lo que estás eligiendo antes de guardar.
  try {
    mountHoloInto('holoPreviewHost', Object.assign({}, currentUserProfile, {
      uid: currentUser?.uid,
      profileEmoji: _editProfileEmoji,
      profileGradient: _editProfileGradient,
      puesto: document.getElementById('profilePuestoInput')?.value || currentUserProfile.puesto,
      area:   document.getElementById('profileAreaInput')?.value   || currentUserProfile.area,
      pronouns: document.getElementById('profilePronounsInput')?.value || currentUserProfile.pronouns,
      cardFoil: _editCardFoil,
      cardTint: _editCardTint,
      cardStickers: _editCardStickers,
      cardCampaigns: _editCardCampaigns,
    }), {
      editable: true,
      // Los stickers se mueven arrastrándolos sobre la tarjeta, no con campos:
      // la posición final la reporta el tablero cuando cada uno se detiene.
      onStickersChange: (list) => { _editCardStickers = list; },
    });
  } catch(e) { console.warn('holo preview', e); }
}

function _buildHoloPickers() {
  const tintEl = document.getElementById('holoTintPicker');
  const foilEl = document.getElementById('holoFoilPicker');
  if(tintEl) tintEl.innerHTML = HOLO_TINTS.map(t =>
    `<button type="button" class="holo-swatch ${_editCardTint===t.key?'on':''}" data-tint="${t.key}" onclick="pickCardTint('${t.key}')"><i style="background:${t.grad}"></i>${t.label}</button>`
  ).join('');
  if(foilEl) foilEl.innerHTML = HOLO_FOILS.map(f =>
    `<button type="button" class="holo-swatch ${_editCardFoil===f.key?'on':''}" data-foil="${f.key}" onclick="pickCardFoil('${f.key}')">${f.label}</button>`
  ).join('');

  const fontSel = document.getElementById('holoStickerFont');
  if(fontSel && !fontSel.options.length) {
    fontSel.innerHTML = HOLO_STICKER_FONTS.map(f=>`<option value="${f.key}">${f.label}</option>`).join('');
  }
  const colSel = document.getElementById('holoStickerColor');
  if(colSel && !colSel.options.length) {
    colSel.innerHTML = HOLO_STICKER_COLORS.map(c=>`<option value="${c.key}">${c.label}</option>`).join('');
  }
  const dl = document.getElementById('holoStickerWords');
  if(dl && !dl.children.length) {
    dl.innerHTML = HOLO_STICKER_WORDS.map(w=>`<option value="${_esc(w)}">`).join('');
  }
  // Estampas: van aparte del campo de palabra porque no se escriben, se eligen.
  const imgs = document.getElementById('holoStickerImgs');
  if(imgs && !imgs.children.length) {
    imgs.innerHTML = HOLO_STICKER_IMAGES.map(i =>
      `<button type="button" class="holo-stamp-btn" onclick="addCardImageSticker('${i.key}')" title="Pegar ${_esc(i.label)}">
         <img src="${i.src}" alt="" loading="lazy">${_esc(i.label)}
       </button>`).join('');
  }
  // Las campañas se repintan en CADA apertura, no una sola vez como el resto de
  // los catálogos: de una vez a otra te pueden haber metido a una campaña nueva
  // o haberle subido el logo a una que ya llevabas.
  _renderCampStickerRow();

  const campsChk = document.getElementById('holoCampsToggle');
  if(campsChk) campsChk.checked = _editCardCampaigns !== false;
  _renderStickerList();
}

/* Los logos de las campañas que llevas, listos para pegar. Solo las tuyas: la
   credencial dice en qué trabajas, no es un catálogo de las cuentas de la
   agencia. Y solo las que tienen logo cargado — el resto se cuentan en una
   línea, porque el hueco entre "llevo seis campañas" y "veo dos logos" se
   explica solo si alguien lo dice. */
function _renderCampStickerRow() {
  const el = document.getElementById('holoStickerCamps');
  if(!el) return;
  const mias = (typeof holoUserCampaigns === 'function' && currentUser)
    ? holoUserCampaigns({ uid: currentUser.uid }) : [];
  if(!mias.length) {
    el.innerHTML = '<span class="holo-camp-hint">Cuando lleves una campaña, su logo aparecerá aquí para pegarlo.</span>';
    return;
  }
  const conLogo = mias.filter(c => c.logo);
  const sinLogo = mias.length - conLogo.length;
  const botones = conLogo.map(c =>
    `<button type="button" class="holo-stamp-btn" onclick="addCardCampaignSticker('${_esc(c.id)}')" title="Pegar ${_esc(c.name)}">
       <img src="${_esc(c.logo)}" alt="">${_esc(c.name)}
     </button>`).join('');
  const nota = sinLogo
    ? `<span class="holo-camp-hint">${sinLogo === 1 ? 'Una campaña tuya no tiene logo' : `${sinLogo} campañas tuyas no tienen logo`}: súbelo en Editar campaña › Logo de la marca.</span>`
    : '';
  el.innerHTML = botones + nota;
}

/* La tira de campañas cambia el HTML de la tarjeta, así que aquí sí toca
   remontar: setStyle solo reescribe variables. Los stickers se rescatan del
   tablero vivo antes, o el remonte los devolvería a donde estaban al abrir. */
/* Los stickers se colocan arrastrándolos, así que la verdad está en el tablero
   vivo. PERO el tablero se puebla en cuanto cargan las fuentes y las estampas,
   así que hasta ese momento está vacío: leerlo antes borraba los stickers
   guardados en cuanto alguien guardaba, compartía o cambiaba una opción con el
   modal recién abierto. Solo se cree lo que diga si ya tiene algo montado. */
function _syncStickersFromBoard() {
  const inst = _holoMounts.get('holoPreviewHost');
  if(inst && inst.board && inst.board.items.length) _editCardStickers = inst.getStickers();
  return _editCardStickers;
}

function toggleCardCampaigns(on) {
  _editCardCampaigns = !!on;
  _syncStickersFromBoard();
  _mountHoloPreview();
}

function _renderStickerList() {
  const el = document.getElementById('holoStickerList');
  if(!el) return;
  el.innerHTML = _editCardStickers.length
    ? _editCardStickers.map((s,i)=>{
        const img = s.i ? (HOLO_STICKER_IMAGE_BY_KEY[s.i]||null) : null;
        const camp = s.m ? (typeof holoStickerCampaign==='function' ? holoStickerCampaign(s.m) : null) : null;
        const src = img ? img.src : (camp ? camp.logo : '');
        const face = src ? `<img src="${_esc(src)}" alt="" class="holo-chip-stamp">` : '';
        return `<span class="holo-sticker-chip">${face}${_esc(holoStickerLabel(s)||'')}<button type="button" onclick="removeCardSticker(${i})" title="Quitar">✕</button></span>`;
      }).join('')
    : '<span style="font-size:12px;color:var(--text-muted);">Sin stickers todavía.</span>';
  const full = document.getElementById('holoStickerFull');
  if(full) full.style.display = _editCardStickers.length >= HOLO_STICKER_MAX ? '' : 'none';
}

/* Dónde cae el próximo sticker: un punto disperso con rotación ligera.
   Apilarlos todos en el centro obligaría a separarlos a mano antes de poder
   verlos. */
function _stickerDrop(n) {
  return {
    x: 0.22 + (n % 3) * 0.28,
    y: 0.28 + Math.floor(n / 3) * 0.34,
    r: (n % 2 ? 1 : -1) * (4 + (n * 3) % 9),
  };
}

function _pushCardSticker(def) {
  if(_editCardStickers.length >= HOLO_STICKER_MAX) { showToast(`Máximo ${HOLO_STICKER_MAX} stickers`,'error'); return false; }
  _editCardStickers.push(Object.assign(def, _stickerDrop(_editCardStickers.length)));
  _renderStickerList();
  _holoMounts.get('holoPreviewHost')?.setStickers(_editCardStickers);
  return true;
}

function addCardSticker() {
  const inp = document.getElementById('holoStickerWord');
  const word = (inp?.value || '').trim();
  if(!word) { showToast('Escribe una palabra','error'); return; }
  const ok = _pushCardSticker({
    w: word,
    f: document.getElementById('holoStickerFont')?.value || 'quick',
    c: document.getElementById('holoStickerColor')?.value || 'fresa',
  });
  if(ok && inp) inp.value = '';
}

/* Estampa (PNG troquelado). Comparte el catálogo de color con los de palabra,
   pero de ese par solo usa el CONTORNO: el relleno lo trae la imagen. */
function addCardImageSticker(key) {
  if(!HOLO_STICKER_IMAGE_BY_KEY[key]) return;
  _pushCardSticker({ i: key, c: document.getElementById('holoStickerColor')?.value || 'fresa' });
}

/* Sticker de campaña. El logo se carga ANTES de empujarlo: el tablero salta
   los stickers cuya imagen todavía no está decodificada, así que pegar y
   rasterizar en el mismo tic dejaba la tarjeta igual que antes y parecía que el
   botón no hacía nada. */
async function addCardCampaignSticker(cid) {
  const c = typeof holoStickerCampaign === 'function' ? holoStickerCampaign(cid) : null;
  if(!c) { showToast('Esa campaña ya no tiene logo disponible','error'); return; }
  if(_editCardStickers.some(s => s.m === cid)) { showToast(`"${c.name}" ya está en tu credencial`,'error'); return; }
  try { await holoStickerLogosReady([{ m: cid }]); } catch(e) { console.warn('logo campaña', e); }
  _pushCardSticker({ m: cid, c: document.getElementById('holoStickerColor')?.value || 'papel' });
}

function removeCardSticker(i) {
  _editCardStickers.splice(i, 1);
  _renderStickerList();
  _holoMounts.get('holoPreviewHost')?.setStickers(_editCardStickers);
}

// Comparte con lo que está EN EDICIÓN, no con lo guardado: si acabas de cambiar
// la tinta, la imagen tiene que salir con esa tinta aunque no hayas guardado.
function shareMyCard() {
  _syncStickersFromBoard();
  const u = Object.assign({}, currentUserProfile, {
    uid: currentUser?.uid,
    profileEmoji: _editProfileEmoji,
    profileGradient: _editProfileGradient,
    puesto: document.getElementById('profilePuestoInput')?.value || currentUserProfile?.puesto,
    area:   document.getElementById('profileAreaInput')?.value   || currentUserProfile?.area,
    cardFoil: _editCardFoil, cardTint: _editCardTint, cardStickers: _editCardStickers,
    cardCampaigns: _editCardCampaigns,
  });
  holoShareUser(u);
}

// Cambiar material NO remonta la tarjeta: setStyle reescribe solo las variables
// estáticas, así que la pose y la inercia sobreviven al cambio y puedes comparar
// dos acabados sin que la tarjeta se reinicie entre uno y otro.
function pickCardFoil(key) {
  _editCardFoil = key;
  document.querySelectorAll('#holoFoilPicker .holo-swatch').forEach(b => b.classList.toggle('on', b.dataset.foil === key));
  const inst = _holoMounts.get('holoPreviewHost');
  if(inst) inst.setStyle(_editCardFoil, _editCardTint);
}
function pickCardTint(key) {
  _editCardTint = key;
  document.querySelectorAll('#holoTintPicker .holo-swatch').forEach(b => b.classList.toggle('on', b.dataset.tint === key));
  const inst = _holoMounts.get('holoPreviewHost');
  if(inst) inst.setStyle(_editCardFoil, _editCardTint);
}

function _buildEmojiGrid(cat) {
  _currentEmojiCat = cat;
  // Update cat buttons
  document.querySelectorAll('.emoji-cat-btn').forEach(b => b.classList.toggle('active', b.dataset.cat === cat));
  const grid = document.getElementById('emojiGrid');
  if(!grid) return;
  let html = '';
  if(cat === 'inicial') {
    // Show letter placeholder
    const letter = (currentUserProfile?.name || 'A')[0].toUpperCase();
    html = `<button class="emoji-item letter ${!_editProfileEmoji ? 'selected' : ''}" onclick="pickEmoji('')" title="Usar inicial">${letter}</button>`;
    // Fill rest with nothing (just the one option)
    for(let i=1;i<8;i++) html += `<div></div>`;
  } else {
    const emojis = EMOJI_CATS[cat]?.emojis || [];
    // Letter option always first
    const letter = (currentUserProfile?.name || 'A')[0].toUpperCase();
    html += `<button class="emoji-item letter ${!_editProfileEmoji ? 'selected' : ''}" onclick="pickEmoji('')" title="Usar inicial">${letter}</button>`;
    emojis.forEach(e => {
      html += `<button class="emoji-item ${_editProfileEmoji === e ? 'selected' : ''}" onclick="pickEmoji('${e}')" title="${e}">${e}</button>`;
    });
  }
  grid.innerHTML = html;
}

function _buildColorSwatches() {
  const solidEl = document.getElementById('solidSwatches');
  const gradEl  = document.getElementById('gradientSwatchesNew');
  if(!solidEl || !gradEl) return;

  solidEl.innerHTML = SOLID_COLORS.map(c =>
    `<div class="color-swatch ${_editProfileGradient === c.bg ? 'selected' : ''}"
      style="background:${c.bg};"
      onclick="pickColor('${c.bg}')"
      title="${c.label}"></div>`
  ).join('');

  gradEl.innerHTML = GRADIENT_COLORS.map(c =>
    `<div class="color-swatch gradient ${_editProfileGradient === c.bg ? 'selected' : ''}"
      style="background:${c.bg};"
      onclick="pickColor('${c.bg.replace(/'/g,'\\\'')}')"
      title="${c.label}"></div>`
  ).join('');
}

function pickShape(s) {
  _editProfileShape = s;
  document.querySelectorAll('.shape-opt').forEach(b => b.classList.toggle('selected', b.dataset.shape === s));
  _syncProfilePreview();
}

function openEditProfileModal() {
  if(!currentUser || !currentUserProfile) return;
  _editProfileEmoji    = currentUserProfile.profileEmoji    || '';
  _editProfileGradient = currentUserProfile.profileGradient || 'linear-gradient(135deg,#ff2d87,#2c6dff)';
  _editProfileShape    = currentUserProfile.profileShape    || 'rounded';
  _editStatusEmoji     = currentUserProfile.statusEmoji     || '💬';
  _editCardFoil        = currentUserProfile.cardFoil        || 'holo';
  _editCardTint        = currentUserProfile.cardTint        || 'rosa';
  // Quien nunca puso stickers arranca con un par: una tarjeta vacía no enseña
  // que se les puede pegar nada.
  _editCardStickers    = Array.isArray(currentUserProfile.cardStickers)
    ? currentUserProfile.cardStickers.map(s => Object.assign({}, s))
    : holoDefaultStickers();
  _editCardCampaigns   = currentUserProfile.cardCampaigns !== false;
  _buildHoloPickers();

  // Build emoji category buttons
  const catBtns = document.getElementById('emojiCatBtns');
  if(catBtns) {
    catBtns.innerHTML = Object.entries(EMOJI_CATS).map(([key, val]) =>
      `<button class="emoji-cat-btn ${key === _currentEmojiCat ? 'active' : ''}" data-cat="${key}" onclick="_buildEmojiGrid('${key}')">${val.label}</button>`
    ).join('');
  }

  // Build grids + swatches
  _buildEmojiGrid(_currentEmojiCat);
  _buildColorSwatches();
  // Init shape selector
  pickShape(_editProfileShape);

  // Puesto select
  const ps = document.getElementById('profilePuestoInput');
  if(ps) {
    ps.innerHTML = `<option value="">— Sin puesto —</option>` + PUESTOS.map(p=>`<option value="${p}">${p}</option>`).join('');
    ps.value = currentUserProfile.puesto || '';
  }
  const as = document.getElementById('profileAreaInput');
  if(as) as.value = currentUserProfile.area || '';

  // Status
  const statusInput = document.getElementById('profileStatusInput');
  if(statusInput) statusInput.value = currentUserProfile.statusText || '';
  const pronounsInput = document.getElementById('profilePronounsInput');
  if(pronounsInput) pronounsInput.value = currentUserProfile.pronouns || '';
  // Sync the chip UI from the saved value (comma-separated, max 2)
  try {
    const saved = String(currentUserProfile.pronouns||'').split(',').map(s=>s.trim()).filter(Boolean);
    document.querySelectorAll('#profilePronounsChips .pronoun-chip').forEach(c => {
      c.classList.toggle('selected', saved.includes(c.dataset.val));
    });
    _refreshPronounChipState();
  } catch(e){}
  const taglineInput = document.getElementById('profileTaglineInput');
  if(taglineInput) taglineInput.value = currentUserProfile.tagline || '';
  // Mark active theme swatch
  THEMES.forEach(t => {
    const sw = document.getElementById('theme-'+t);
    if(sw) sw.classList.toggle('selected', (currentUserProfile.theme||'default') === t);
  });
  const statusBtn = document.getElementById('statusEmojiBtn');
  if(statusBtn) statusBtn.textContent = _editStatusEmoji;
  const bioInput = document.getElementById('profileBioInput');
  if(bioInput) {
    bioInput.value = currentUserProfile.bio || '';
    const counter = document.getElementById('bioCounter');
    if(counter) counter.textContent = bioInput.value.length + '/80';
  }

  document.getElementById('profileEmojiInput').value = _editProfileEmoji;
  _syncProfilePreview();

  // La credencial es lo primero que se ve: es la identidad, y el resto de la
  // ficha son datos que la sostienen.
  switchProfileTab('credencial');
  openModal('editProfileModal');
}

function pickEmoji(e) {
  _editProfileEmoji = e;
  const inp = document.getElementById('profileEmojiInput');
  if(inp) inp.value = e;
  // Refresh grid selection
  document.querySelectorAll('.emoji-item').forEach(b => {
    const isMatch = b.textContent === (e || (currentUserProfile?.name||'A')[0].toUpperCase());
    b.classList.toggle('selected', isMatch && (e ? true : b.classList.contains('letter')));
  });
  _syncProfilePreview();
}

function pickColor(g) {
  _editProfileGradient = g;
  document.querySelectorAll('.color-swatch').forEach(s => {
    const bg = s.style.background.replace(/\s/g,'');
    s.classList.toggle('selected', bg === g.replace(/\s/g,'') || bg === g);
  });
  _syncProfilePreview();
}

// Keep old name for any lingering references
function pickGradient(g) { pickColor(g); }

function _syncProfilePreview() {
  const avatar  = document.getElementById('profilePreviewAvatar');
  const nameEl  = document.getElementById('profilePreviewName');
  const subEl   = document.getElementById('profilePreviewSub');
  const statusP = document.getElementById('profileStatusPreview');
  if(!avatar || !currentUserProfile) return;

  const content = _editProfileEmoji || (currentUserProfile.name||currentUserProfile.email||'?')[0].toUpperCase();
  avatar.style.background   = _editProfileGradient;
  avatar.style.fontSize     = _editProfileEmoji ? '36px' : '28px';
  avatar.style.borderRadius = (SHAPE_RADIUS[_editProfileShape] || SHAPE_RADIUS.rounded)(80);
  avatar.textContent        = content;

  // Make the whole hero react to the chosen avatar color
  const hero = document.querySelector('#editProfileModal .profile-modal-hero');
  if(hero) {
    const hx = (String(_editProfileGradient).match(/#[0-9a-fA-F]{3,8}/g)) || ['#ff2d87'];
    hero.style.setProperty('--g1', hx[0]);
    hero.style.setProperty('--g2', hx[1] || hx[0]);
  }

  const area   = document.getElementById('profileAreaInput')?.value   || currentUserProfile.area   || '';
  const puesto = document.getElementById('profilePuestoInput')?.value || currentUserProfile.puesto || '';
  if(nameEl) {
    const pron = (document.getElementById('profilePronounsInput')?.value)||currentUserProfile.pronouns||'';
    const sp = _shortPronouns(pron);
    nameEl.textContent = (currentUserProfile.name || currentUserProfile.email) + (sp ? ' ' + sp : '');
  }
  if(subEl)  subEl.textContent  = [puesto, area].filter(Boolean).join(' · ') || 'Think Y.';

  // Status preview
  const statusTxt = document.getElementById('profileStatusInput')?.value || '';
  if(statusP) {
    if(statusTxt) {
      statusP.textContent = _editStatusEmoji + ' ' + statusTxt;
      statusP.style.display = 'inline-flex';
    } else {
      statusP.style.display = 'none';
    }
  }

  // Refresh swatch selection
  _buildColorSwatches();
}

// Status emoji picker
function toggleStatusEmojiPicker(e) {
  e.stopPropagation();
  const dd = document.getElementById('statusEmojiDropdown');
  if(!dd) return;
  dd.style.display = dd.style.display === 'flex' ? 'none' : 'flex';
}
function pickStatusEmoji(em) {
  _editStatusEmoji = em;
  const btn = document.getElementById('statusEmojiBtn');
  if(btn) btn.textContent = em;
  const dd = document.getElementById('statusEmojiDropdown');
  if(dd) dd.style.display = 'none';
  _syncProfilePreview();
}
function onStatusInput() { _syncProfilePreview(); }

// Close status picker when clicking outside
document.addEventListener('click', () => {
  const dd = document.getElementById('statusEmojiDropdown');
  if(dd) dd.style.display = 'none';
});

async function saveMyProfile() {
  if(!currentUser) return;
  const area        = document.getElementById('profileAreaInput').value;
  const puesto      = document.getElementById('profilePuestoInput').value;
  const emoji       = document.getElementById('profileEmojiInput').value.trim();
  const statusEmoji = _editStatusEmoji || '💬';
  const statusText  = (document.getElementById('profileStatusInput')?.value || '').trim();
  const bio         = (document.getElementById('profileBioInput')?.value || '').trim();
  _editProfileEmoji = emoji;
  const pronouns  = (document.getElementById('profilePronounsInput')?.value||'').trim();
  const tagline   = (document.getElementById('profileTaglineInput')?.value||'').trim();
  _syncStickersFromBoard();
  const updates = {
    area, puesto,
    profileEmoji:    emoji,
    profileGradient: _editProfileGradient,
    profileShape:    _editProfileShape,
    cardFoil:        _editCardFoil,
    cardTint:        _editCardTint,
    cardStickers:    _editCardStickers,
    cardCampaigns:   _editCardCampaigns,
    statusEmoji,
    statusText,
    bio,
    pronouns,
    tagline,
  };
  try {
    const ws = db.collection('workspaces').doc(WORKSPACE);
    await Promise.all([
      ws.collection('members').doc(currentUser.uid).set(updates, {merge:true}),
      db.collection('users').doc(currentUser.uid).set(updates, {merge:true})
    ]);
    Object.assign(currentUserProfile, updates);
    updateSidebarAvatar();
    // Refresh sidebar name + short pronouns
    const sidebarNameEl = document.getElementById('userNameSidebar');
    if(sidebarNameEl) {
      const sp = _shortPronouns(pronouns);
      sidebarNameEl.textContent = (currentUserProfile.name || currentUser.email.split('@')[0]) + (sp ? ' ' + sp : '');
    }
    const roleBadge = document.getElementById('userRoleSidebar');
    if(roleBadge) roleBadge.textContent = puesto || (currentUserProfile.role==='admin'?'Admin':'Miembro');
    showToast('Perfil actualizado','success'); try { showSuccessCheck(); } catch(e){}
    closeModal('editProfileModal');
  } catch(e) {
    showToast('Error guardando perfil: '+e.message,'error');
  }
}

// ============================================================
// ONBOARDING (primer login: perfil + suscripción a campañas)
// ============================================================
let _obGradient = 'linear-gradient(135deg,#ff2d87,#2c6dff)';
let _obSelectedCamps = new Set();
window._obAwaitingNewCampaign = false;

function obSyncAvatar() {
  const av = document.getElementById('obAvatar');
  if(!av) return;
  const emoji = (document.getElementById('obEmoji').value||'').trim();
  const name  = (document.getElementById('obName').value||'').trim();
  av.style.background = _obGradient;
  av.textContent = emoji || (name || currentUserProfile?.email || 'A')[0].toUpperCase();
  av.style.fontSize = emoji ? '34px' : '30px';
}

function obPickColor(bg, el) {
  _obGradient = bg;
  document.querySelectorAll('#obSwatches .ob-swatch').forEach(s=>s.classList.remove('sel'));
  if(el) el.classList.add('sel');
  obSyncAvatar();
}

function _obBuildSwatches() {
  const wrap = document.getElementById('obSwatches');
  if(!wrap) return;
  const all = [...SOLID_COLORS, ...GRADIENT_COLORS];
  wrap.innerHTML = all.map(c =>
    `<div class="ob-swatch ${_obGradient===c.bg?'sel':''}" style="background:${c.bg};" title="${c.label}" onclick="obPickColor('${c.bg.replace(/'/g,"\\'")}', this)"></div>`
  ).join('');
}

function _obBuildCampList() {
  const wrap = document.getElementById('obCampList');
  if(!wrap) return;
  const camps = getData('campaigns') || [];
  if(!camps.length) {
    wrap.innerHTML = `<div class="ob-empty">Aún no hay campañas registradas. Crea la primera 👇</div>`;
    return;
  }
  wrap.innerHTML = camps.map(c => {
    const sel = _obSelectedCamps.has(c.id);
    const meta = [c.client, c.status].filter(Boolean).join(' · ') || '—';
    return `<div class="ob-camp ${sel?'sel':''}" onclick="obToggleCamp('${c.id}', this)">
      <div class="ob-camp-check">${sel?'✓':''}</div>
      <div class="ob-camp-info">
        <div class="ob-camp-name">${_esc(c.name||'Sin nombre')}</div>
        <div class="ob-camp-meta">${_esc(meta)}</div>
      </div>
    </div>`;
  }).join('');
}

function obToggleCamp(cid, el) {
  if(_obSelectedCamps.has(cid)) _obSelectedCamps.delete(cid);
  else _obSelectedCamps.add(cid);
  const sel = _obSelectedCamps.has(cid);
  if(el) {
    el.classList.toggle('sel', sel);
    const chk = el.querySelector('.ob-camp-check');
    if(chk) chk.textContent = sel ? '✓' : '';
  }
}

function startOnboarding() {
  if(!currentUserProfile) return;
  const p = currentUserProfile;
  _obGradient = p.profileGradient || 'linear-gradient(135deg,#ff2d87,#2c6dff)';
  _obSelectedCamps = new Set(p.subscribedCampaigns || []);
  document.getElementById('obName').value     = p.name || '';
  document.getElementById('obEmoji').value    = p.profileEmoji || '';
  document.getElementById('obArea').value     = p.area || '';
  const ps = document.getElementById('obPuesto');
  ps.innerHTML = `<option value="">— Sin puesto —</option>` + PUESTOS.map(x=>`<option value="${x}">${x}</option>`).join('');
  ps.value = p.puesto || '';
  document.getElementById('obPronouns').value = p.pronouns || '';
  document.getElementById('obTagline').value  = p.tagline || '';
  document.getElementById('obBio').value      = p.bio || '';
  _obBuildSwatches();
  _obBuildCampList();
  obSyncAvatar();
  document.getElementById('obScreen').classList.add('open');
  obGoStep(1);   // después de .open: obGoStep mide, y oculto todo mide 0
}

function obGoStep(n) {
  const pages = document.getElementById('obPages');
  const p1 = document.getElementById('obPanel1');
  const p2 = document.getElementById('obPanel2');
  if(pages) pages.dataset.page = String(n);
  // El paso que no se ve sigue pintado para poder animar su salida; inert lo
  // saca del tabulador y del árbol de accesibilidad mientras tanto.
  if(p1) p1.inert = n !== 1;
  if(p2) p2.inert = n !== 2;
  document.getElementById('obDot1').classList.toggle('on', n>=1);
  document.getElementById('obDot2').classList.toggle('on', n>=2);
  _obSyncPagesHeight();
}

/* .ob-pages no puede heredar la altura de sus hijos: son absolutos. Se la
   escribimos nosotros y .t-resize la interpola. El estado real es data-page,
   no el final de la transición: si alguien pulsa Continuar y Atrás seguido, el
   paso correcto ya está puesto aunque la animación anterior siga viva. */
function _obSyncPagesHeight() {
  const pages = document.getElementById('obPages');
  if(!pages) return;
  const active = pages.querySelector('.t-page[data-page-id="' + (pages.dataset.page || '1') + '"]');
  if(!active) return;
  const h = active.offsetHeight;
  if(h) pages.style.height = h + 'px';
}

/* La lista de campañas y los selects cambian de alto después de montar; sin
   esto el contenedor se queda con la altura del primer render. */
(function(){
  if(!window.ResizeObserver) return;
  const ro = new ResizeObserver(()=>_obSyncPagesHeight());
  function watch(){
    ['obPanel1','obPanel2'].forEach(id=>{
      const el = document.getElementById(id);
      if(el) ro.observe(el);
    });
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch);
  else watch();
})();

function obNext() {
  const name = (document.getElementById('obName').value||'').trim();
  if(!name) { showToast('Escribe tu nombre','error'); document.getElementById('obName').focus(); return; }
  _obBuildCampList();
  obGoStep(2);
}

function obCreateNewCampaign() {
  window._obAwaitingNewCampaign = true;
  document.getElementById('obScreen').classList.remove('open');
  openNewCampaignModal();
}

// Llamado desde saveCampaign cuando se crea una campaña durante el onboarding
function _obOnCampaignCreated(cid) {
  window._obAwaitingNewCampaign = false;
  if(cid) _obSelectedCamps.add(cid);
  _obBuildCampList();
  document.getElementById('obScreen').classList.add('open');
  obGoStep(2);   // después de .open, por lo mismo que en obStart()
}

async function obFinish() {
  if(!currentUser) return;
  const btn = document.getElementById('obFinishBtn');
  if(btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
  const updates = {
    name:     (document.getElementById('obName').value||'').trim() || currentUserProfile.name,
    area:     document.getElementById('obArea').value,
    puesto:   document.getElementById('obPuesto').value,
    profileEmoji:    (document.getElementById('obEmoji').value||'').trim(),
    profileGradient: _obGradient,
    pronouns: (document.getElementById('obPronouns').value||'').trim(),
    tagline:  (document.getElementById('obTagline').value||'').trim(),
    bio:      (document.getElementById('obBio').value||'').trim(),
    subscribedCampaigns: [..._obSelectedCamps],
    onboardingDone: true,
  };
  try {
    const ws = db.collection('workspaces').doc(WORKSPACE);
    await Promise.all([
      db.collection('users').doc(currentUser.uid).set(updates, {merge:true}),
      // `members` es de donde sale allUsers, y de ahí leen el Equipo, la
      // credencial de los demás y el selector de personas. Faltaba el puesto:
      // recién onboardeado, el equipo te veía sin puesto y tu credencial decía
      // "Think Y." hasta que entraras a editar el perfil.
      ws.collection('members').doc(currentUser.uid).set({
        name: updates.name, area: updates.area, puesto: updates.puesto,
        profileGradient: updates.profileGradient,
        pronouns: updates.pronouns, tagline: updates.tagline,
        ...(updates.profileEmoji ? { profileEmoji: updates.profileEmoji } : {}),
      }, {merge:true}),
    ]);
    Object.assign(currentUserProfile, updates);
    document.getElementById('obScreen').classList.remove('open');
    updateSidebarAvatar();
    const sidebarNameEl = document.getElementById('userNameSidebar');
    if(sidebarNameEl) { const sp=_shortPronouns(updates.pronouns); sidebarNameEl.textContent = updates.name + (sp?' '+sp:''); }
    const roleBadge = document.getElementById('userRoleSidebar');
    if(roleBadge) roleBadge.textContent = updates.puesto || (currentUserProfile.role==='admin'?'Admin':'Miembro');
    renderCampaignGrid();
    if(currentPage==='dashboard') renderDashboard();
    showToast('¡Listo! Bienvenida a Campaign OS 🎉','success'); try { showSuccessCheck(); } catch(e){}
  } catch(e) {
    showToast('Error guardando: '+e.message,'error');
  } finally {
    if(btn) { btn.disabled = false; btn.textContent = 'Entrar a Campaign OS'; }
  }
}

async function obSkip() {
  if(!currentUser) return;
  try {
    await db.collection('users').doc(currentUser.uid).set({onboardingDone:true}, {merge:true});
    currentUserProfile.onboardingDone = true;
  } catch(e){}
  document.getElementById('obScreen').classList.remove('open');
}

// ============================================================
// IN-APP EASTER EGGS & MICRO-ANIMATIONS
// ============================================================

// ---- Shared helpers ----
function showEasterToast(msg) {
  let el = document.getElementById('easterToast');
  if(!el) {
    el = document.createElement('div');
    el.id = 'easterToast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), 3800);
}

function spawnConfetti() {
  const colors = ['#ff2d87','#2c6dff','#c6f24a','#ff7eb0','#fff','#ffd700'];
  for(let i=0; i<90; i++) {
    const p = document.createElement('div');
    p.className = 'confetti-piece';
    const size = 5 + Math.random()*9;
    p.style.width = size+'px';
    p.style.height = size+'px';
    p.style.left = (Math.random()*100)+'vw';
    p.style.background = colors[Math.floor(Math.random()*colors.length)];
    p.style.borderRadius = Math.random()>.5 ? '50%' : '3px';
    p.style.animationDuration = (1.2 + Math.random()*1.8)+'s';
    p.style.animationDelay = (Math.random()*0.7)+'s';
    document.body.appendChild(p);
    setTimeout(()=>p.remove(), 3500);
  }
}

// ---- Task completion: burst + messages ----
let _taskDoneCount = 0;
const _TASK_MSGS = ['¡Tarea completada! 🎉','¡Eso! Una menos 💪','¡Máquina! ✨','¡Dale! 🚀','¡Lo lograste! 🎯','¡Imparable! 💅','¡Pura energía! ⚡','¡Crack total! 🧠','¡Bien hecho! 🌟'];
function _onTaskDone(tid) {
  _taskDoneCount++;
  // Burst from checkbox
  const cb = document.querySelector(`[data-tid="${tid}"] .task-check, [data-task-id="${tid}"] .task-check`)
          || document.querySelector(`.task-check[data-tid="${tid}"]`);
  if(cb) _taskBurst(cb);
  if(_taskDoneCount % 5 === 0) {
    spawnConfetti();
    showEasterToast(`🏆 ¡${_taskDoneCount} tareas! Eres una leyenda.`);
  } else if(Math.random() < .6) {
    showEasterToast(_TASK_MSGS[Math.floor(Math.random()*_TASK_MSGS.length)]);
  }
}
function _taskBurst(anchor) {
  try {
    const r = anchor.getBoundingClientRect();
    const cx = r.left + r.width/2, cy = r.top + r.height/2;
    const colors = ['#ff2d87','#2c6dff','#c6f24a','#ffd700','#ff7eb0'];
    for(let i=0;i<10;i++){
      const piece = document.createElement('span');
      piece.className = 'task-burst-piece';
      const sz = 4 + Math.random()*4;
      piece.style.width = sz+'px'; piece.style.height = sz+'px';
      piece.style.left = cx+'px'; piece.style.top = cy+'px';
      piece.style.background = colors[i%colors.length];
      const ang = Math.random()*Math.PI*2;
      const dist = 22 + Math.random()*28;
      piece.style.setProperty('--dx', Math.cos(ang)*dist+'px');
      piece.style.setProperty('--dy', Math.sin(ang)*dist+'px');
      piece.style.setProperty('--dur', (.35 + Math.random()*.25)+'s');
      document.body.appendChild(piece);
      setTimeout(()=>piece.remove(), 700);
    }
  } catch(e){}
}

// ---- Nav ripple ----
document.addEventListener('click', (e) => {
  const item = e.target.closest('.nav-item');
  if(!item) return;
  const rect = item.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const ripple = document.createElement('span');
  ripple.className = 'nav-ripple';
  ripple.style.width = size+'px'; ripple.style.height = size+'px';
  ripple.style.left = (e.clientX - rect.left - size/2)+'px';
  ripple.style.top  = (e.clientY - rect.top  - size/2)+'px';
  item.appendChild(ripple);
  setTimeout(()=>ripple.remove(), 600);
});

// ---- Stat value pulse on click ----
document.addEventListener('click', (e) => {
  const el = e.target.closest('.stat-value');
  if(!el) return;
  const prevT = el.style.transform, prevC = el.style.color;
  el.style.transform = 'scale(1.18)';
  el.style.color = 'var(--pink)';
  setTimeout(() => { el.style.transform = prevT; el.style.color = prevC; }, 350);
});

// ---- Sidebar avatar rainbow (7 clicks in 1.8s) ----
let _avatarClicks = [];
document.addEventListener('click', (e) => {
  const av = e.target.closest('#sidebarUserAvatar, .sidebar-user .avatar, #userAvatarSidebar');
  if(!av) return;
  const now = Date.now();
  _avatarClicks = _avatarClicks.filter(t => now - t < 1800);
  _avatarClicks.push(now);
  if(_avatarClicks.length >= 7) {
    _avatarClicks = [];
    av.classList.add('rainbow-mode');
    setTimeout(()=>av.classList.remove('rainbow-mode'), 1300);
    showEasterToast('🌈 Modo arcoíris desbloqueado 💅');
  }
});

// ---- Sidebar Y logo (3 clicks in 1.4s) ----
let _sideLogoClicks = [];
const _SIDE_LOGO_MSGS = ['🧠 Think Y., build campaigns.','✨ ¡Hola desde el sidebar!','🚀 ¡Sigamos haciendo magia!','💅 Tres clics. Ya sabías que estaba aquí.'];
document.addEventListener('click', (e) => {
  const logo = e.target.closest('.sidebar-logo, .sidebar-brand img, #sidebarLogo, .sidebar-y-mark');
  if(!logo) return;
  const now = Date.now();
  _sideLogoClicks = _sideLogoClicks.filter(t => now - t < 1400);
  _sideLogoClicks.push(now);
  if(_sideLogoClicks.length >= 3) {
    _sideLogoClicks = [];
    logo.classList.add('logo-3spin');
    setTimeout(()=>logo.classList.remove('logo-3spin'), 950);
    showEasterToast(_SIDE_LOGO_MSGS[Math.floor(Math.random()*_SIDE_LOGO_MSGS.length)]);
  }
});

// ---- Topbar date (4 clicks in 1.2s) ----
let _dateClicks = [];
document.addEventListener('click', (e) => {
  const d = e.target.closest('#topbarDate, .topbar-date');
  if(!d) return;
  const now = Date.now();
  _dateClicks = _dateClicks.filter(t => now - t < 1200);
  _dateClicks.push(now);
  if(_dateClicks.length >= 4) {
    _dateClicks = [];
    const h = new Date().getHours();
    const greet = h < 12 ? '¡Buenos días! ☀️' : h < 19 ? '¡Buenas tardes! 🌤' : '¡Buenas noches! 🌙';
    showEasterToast(greet + ' — hora de ser increíble.');
  }
});

// ---- Konami code ----
let _konami = [];
const _KONAMI_SEQ = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
document.addEventListener('keydown', (e) => {
  _konami.push(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  if(_konami.length > 10) _konami.shift();
  if(_konami.length === 10 && _konami.every((k,i) => k === _KONAMI_SEQ[i])) {
    _konami = [];
    spawnConfetti();
    showEasterToast('🎮 ¡Modo campaña PRO activado! Bienvenide, genie ✨');
  }
});

// ============================================================
// COMMAND PALETTE (Cmd/Ctrl+K) — buscador global
// ============================================================
let _cmdkIndex = 0;
let _cmdkResults = [];
function _ensureCmdkDom() {
  if(document.getElementById('cmdkOverlay')) return;
  const ov = document.createElement('div');
  ov.id = 'cmdkOverlay';
  ov.style.cssText = 'display:none;position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.45);backdrop-filter:blur(2px);align-items:flex-start;justify-content:center;padding-top:12vh;';
  ov.innerHTML = `<div style="width:min(620px,92vw);background:var(--white,#fff);border-radius:16px;box-shadow:0 24px 70px rgba(0,0,0,.35);overflow:hidden;" onclick="event.stopPropagation()">
    <div style="position:relative;border-bottom:1px solid var(--border,#eee);">
      <input id="cmdkInput" type="text" placeholder="Buscar campañas, influencers, tareas, documentos..." autocomplete="off"
        style="width:100%;border:none;outline:none;padding:18px 44px 18px 20px;font-size:16px;background:transparent;color:var(--text,#111);">
      <button type="button" id="cmdkClear" class="tdev-clear-btn" aria-label="Limpiar búsqueda">✕</button>
    </div>
    <div id="cmdkList" style="max-height:50vh;overflow-y:auto;padding:6px;"></div>
    <div style="padding:8px 16px;font-size:11px;color:var(--text-muted,#888);border-top:1px solid var(--border,#eee);display:flex;gap:14px;">
      <span>↑↓ navegar</span><span>↵ abrir</span><span>esc cerrar</span>
    </div>
  </div>`;
  ov.addEventListener('click', closeCmdk);
  document.body.appendChild(ov);
  const _ci = document.getElementById('cmdkInput');
  const _cc = document.getElementById('cmdkClear');
  const _toggleClear = () => _cc.classList.toggle('is-visible', !!_ci.value);
  _ci.addEventListener('input', () => { _toggleClear(); _cmdkRender(); });
  _cc.addEventListener('click', () => {
    if(!_ci.value) return;
    const list = document.getElementById('cmdkList');
    // dissolve current results, then clear
    if(list) { list.classList.add('tdev-dissolving'); }
    _ci.value = '';
    _toggleClear();
    setTimeout(() => {
      if(list) list.classList.remove('tdev-dissolving');
      _cmdkRender();
      _ci.focus();
    }, 260);
  });
}
function openCmdk() {
  if(typeof currentUser !== 'undefined' && !currentUser) return; // not logged in
  _ensureCmdkDom();
  const ov = document.getElementById('cmdkOverlay');
  ov.style.display = 'flex';
  const inp = document.getElementById('cmdkInput');
  inp.value = ''; _cmdkIndex = 0;
  document.getElementById('cmdkClear')?.classList.remove('is-visible');
  _cmdkRender();
  setTimeout(()=>inp.focus(),30);
}
function closeCmdk() {
  const ov = document.getElementById('cmdkOverlay');
  if(ov) ov.style.display = 'none';
}
function _cmdkData() {
  const items = [];
  try { (typeof visibleCampaigns==='function'?visibleCampaigns():getData('campaigns')||[]).forEach(c=>items.push({type:'Campaña', icon:ICN_megaphone, label:c.name, sub:c.client||'', action:()=>{navigate('campannas');setTimeout(()=>openCampaignDetail(c.id),60);}})); } catch(e){}
  try { (getAllInfluencers()||[]).forEach(inf=>items.push({type:'Influencer', icon:ICN_users, label:inf.name, sub:[inf.handle?'@'+inf.handle:'', inf.categoria||'', ...(inf.keywords||[]).slice(0,3)].filter(Boolean).join(' · '), action:()=>{navigate('influencers');setTimeout(()=>openInfluencerDetail(inf.key),60);}})); } catch(e){}
  // Las campañas de arriba ya pasan por visibleCampaigns(); las tareas y los
  // documentos leían la colección entera, así que el buscador enseñaba
  // pendientes y links de campañas que la persona no puede abrir.
  const _visibles = (typeof visibleCampaigns==='function') ? visibleCampaigns() : (getData('campaigns')||[]);
  try {
    (getData('globalTasks')||[]).forEach(t=>{ if(!t.done) items.push({type:'Tarea', icon:ICN_check, label:t.title, sub:'General', action:()=>navigate('pendientes')}); });
    _visibles.forEach(c=>(c.tasks||[]).forEach(t=>{ if(!t.done) items.push({type:'Tarea', icon:ICN_check, label:t.title, sub:c.name, action:()=>{navigate('campannas');setTimeout(()=>openCampaignDetail(c.id),60);}}); }));
  } catch(e){}
  try { _visibles.forEach(c=>(c.documents||[]).forEach(d=>items.push({type:'Documento', icon:ICN_doc, label:d.name||d.title||'Documento', sub:c.name, action:()=>{ if(d.url) window.open(_safeUrl(d.url),'_blank','noopener'); else navigate('documentos'); }}))); } catch(e){}
  return items;
}
function _cmdkRender() {
  const q = (document.getElementById('cmdkInput')?.value||'').toLowerCase().trim();
  let items = _cmdkData();
  if(q) items = items.filter(it => (it.label||'').toLowerCase().includes(q) || (it.sub||'').toLowerCase().includes(q) || it.type.toLowerCase().includes(q));
  items = items.slice(0, 40);
  _cmdkResults = items;
  if(_cmdkIndex >= items.length) _cmdkIndex = Math.max(0, items.length-1);
  const list = document.getElementById('cmdkList');
  if(!items.length) { list.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-muted,#888);font-size:14px;">${q?'Sin resultados':'Empieza a escribir...'}</div>`; return; }
  list.innerHTML = items.map((it,i)=>`<div class="cmdk-row" data-i="${i}" onclick="_cmdkPick(${i})"
    style="display:flex;align-items:center;gap:12px;padding:11px 14px;border-radius:10px;cursor:pointer;${i===_cmdkIndex?'background:var(--pink-pale,#ffe3f0);':''}">
    <span class="cmd-item-icn">${it.icon}</span>
    <div style="flex:1;min-width:0;"><div style="font-size:14px;font-weight:600;color:var(--text,#111);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_esc(it.label)}</div>${it.sub?`<div style="font-size:12px;color:var(--text-muted,#888);">${_esc(it.sub)}</div>`:''}</div>
    <span style="font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted,#999);background:var(--bg,#f3f3f3);padding:2px 8px;border-radius:8px;">${it.type}</span>
  </div>`).join('');
}
function _cmdkPick(i) {
  const it = _cmdkResults[i];
  if(!it) return;
  closeCmdk();
  try { it.action(); } catch(e){ console.warn('cmdk action', e); }
}
document.addEventListener('keydown', (e) => {
  if((e.metaKey || e.ctrlKey) && e.key.toLowerCase()==='k') {
    e.preventDefault();
    const ov = document.getElementById('cmdkOverlay');
    if(ov && ov.style.display==='flex') closeCmdk(); else openCmdk();
    return;
  }
  const ov = document.getElementById('cmdkOverlay');
  if(!ov || ov.style.display!=='flex') return;
  if(e.key==='Escape') { closeCmdk(); }
  else if(e.key==='ArrowDown') { e.preventDefault(); _cmdkIndex = Math.min(_cmdkResults.length-1, _cmdkIndex+1); _cmdkRender(); }
  else if(e.key==='ArrowUp') { e.preventDefault(); _cmdkIndex = Math.max(0, _cmdkIndex-1); _cmdkRender(); }
  else if(e.key==='Enter') { e.preventDefault(); _cmdkPick(_cmdkIndex); }
});

// ── Portada flamingo del login — temporada controlada por admin,
//    sincronizada a TODO el equipo vía Firestore (config/cover) ──
function _coverLayer() { return document.getElementById('flamingoSeason'); }
function _coverDoc() {
  return db.collection('workspaces').doc(WORKSPACE).collection('config').doc('cover');
}
let _coverUnsub = null;
const COVER_GIF_SYNC_LIMIT = 720000; // ~720 KB base64 — bajo el tope de 1 MB por doc de Firestore

// Pinta desde cache local / default por fecha (instantáneo, funciona pre-auth)
function applyLoginCover() {
  const layer = _coverLayer(); if (!layer) return;
  let season = null, gif = null;
  try { season = localStorage.getItem('cos_season'); gif = localStorage.getItem('cos_season_gif'); } catch(e){}
  if (!season) {
    const m = new Date().getMonth(); // default según la fecha
    season = m === 11 ? 'navidad' : (m >= 2 && m <= 4) ? 'primavera' : 'mundial';
  }
  if (gif) {
    layer.style.setProperty('--season-gif', `url("${gif}")`);
    layer.classList.add('has-gif');
  } else {
    layer.classList.remove('has-gif');
    layer.style.removeProperty('--season-gif');
    layer.dataset.season = season;
  }
  syncSeasonAdminUI(season, !!gif);
}

// Aplica el valor autoritativo de Firestore (y lo cachea local)
function applyCoverFromData(data) {
  if (!data) return;
  const layer = _coverLayer();
  if (data.gif) {
    try { localStorage.setItem('cos_season_gif', data.gif); } catch(e){}
    if (layer) { layer.style.setProperty('--season-gif', `url("${data.gif}")`); layer.classList.add('has-gif'); }
  } else {
    try { localStorage.removeItem('cos_season_gif'); if (data.season) localStorage.setItem('cos_season', data.season); } catch(e){}
    if (layer) { layer.classList.remove('has-gif'); layer.style.removeProperty('--season-gif'); if (data.season) layer.dataset.season = data.season; }
  }
  syncSeasonAdminUI(data.season || (layer && layer.dataset.season), !!data.gif);
}

// Escribe la portada global (solo admins)
function persistCover(patch) {
  if (typeof db === 'undefined' || !currentUser) return;
  if (typeof isAdmin === 'function' && !isAdmin()) return;
  _coverDoc().set({ ...patch, updatedAt: Date.now(), updatedBy: currentUser.uid }, { merge: true })
    .catch(e => { console.error('persistCover', e); showToast('No se pudo sincronizar la portada: ' + e.message, 'error'); });
}

// Listener en vivo — cada usuario logueado recibe cambios en tiempo real
function setupCoverSync() {
  if (typeof db === 'undefined') return;
  if (_coverUnsub) { _coverUnsub(); _coverUnsub = null; }
  _coverUnsub = _coverDoc().onSnapshot(d => { if (d.exists) applyCoverFromData(d.data()); }, () => {});
}

// Al cargar: pinta cache, luego lectura global + listener best-effort
function initCoverSync() {
  applyLoginCover();
  if (typeof db === 'undefined') return;
  _coverDoc().get().then(d => { if (d.exists) applyCoverFromData(d.data()); }).catch(() => {});
}

function setLoginSeason(season) {
  try { localStorage.setItem('cos_season', season); localStorage.removeItem('cos_season_gif'); } catch(e){}
  applyLoginCover();
  persistCover({ season, gif: '' });
  showToast('Portada del login actualizada para todo el equipo', 'success');
}

function onAdminGifPick(input) {
  const f = input.files && input.files[0]; if (!f) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const url = ev.target.result;
    try { localStorage.setItem('cos_season_gif', url); } catch(e){}
    applyLoginCover();
    if (url.length > COVER_GIF_SYNC_LIMIT) {
      showToast('GIF aplicado solo en este equipo (muy pesado para sincronizar). Usa uno < 700 KB para que lo vean todos.', 'error');
    } else {
      persistCover({ gif: url });
      showToast('GIF de temporada activado para todo el equipo', 'success');
    }
  };
  reader.readAsDataURL(f);
  input.value = '';
}

function clearLoginGif() {
  try { localStorage.removeItem('cos_season_gif'); } catch(e){}
  applyLoginCover();
  persistCover({ gif: '' });
  showToast('GIF quitado para todo el equipo', 'success');
}

function syncSeasonAdminUI(season, hasGif) {
  const sw = document.getElementById('seasonAdminSwitch');
  if (sw) sw.querySelectorAll('button').forEach(b =>
    b.classList.toggle('active', !hasGif && b.dataset.season === season));
  const lbl = document.getElementById('seasonAdminGifLabel');
  if (lbl) lbl.textContent = hasGif ? '✓ GIF activo · cambiar' : '＋ Subir GIF de temporada';
  const clr = document.getElementById('seasonAdminClear');
  if (clr) clr.style.display = hasGif ? 'inline-flex' : 'none';
}

// ---- Login: rotating taglines ----
let _loginTaglineIdx = 0, _loginTaglineTimer = null;
function _startLoginTaglines() {
  if(_loginTaglineTimer) clearInterval(_loginTaglineTimer);
  const els = document.querySelectorAll('#loginTaglineWrap .login-tagline');
  if(!els.length) return;
  _loginTaglineTimer = setInterval(() => {
    els.forEach(el => el.classList.remove('show'));
    _loginTaglineIdx = (_loginTaglineIdx + 1) % els.length;
    els[_loginTaglineIdx].classList.add('show');
  }, 3200);
}

// ---- Login: dot grid build ----
function _buildLoginDotGrid() {
  const g = document.getElementById('loginDotGrid');
  if(!g || g.childElementCount) return;
  for(let i=0;i<21;i++) g.appendChild(document.createElement('span'));
}

// ---- Login: cursor sparkles ----
let _lastSparkle = 0;
function _initLoginSparkles() {
  const hero = document.getElementById('loginHero');
  if(!hero || hero._sparkInit) return;
  hero._sparkInit = true;
  // El hero es fijo a pantalla completa: su rect solo cambia al redimensionar.
  // Medirlo en cada mousemove forzaba un layout sincrónico por chispa.
  let rect = hero.getBoundingClientRect();
  window.addEventListener('resize', () => { rect = hero.getBoundingClientRect(); }, { passive: true });
  hero.addEventListener('mousemove', (e) => {
    if(Math.random() > .3) return;
    const now = Date.now();
    if(now - _lastSparkle < 80) return;
    _lastSparkle = now;
    const s = document.createElement('span');
    s.className = 'login-sparkle';
    const sz = 3 + Math.random()*5;
    s.style.width = sz+'px'; s.style.height = sz+'px';
    s.style.left = (e.clientX - rect.left)+'px';
    s.style.top  = (e.clientY - rect.top)+'px';
    s.style.background = Math.random() < .6 ? '#ff2d87' : '#c6f24a';
    const ang = Math.random()*Math.PI*2;
    const dist = 18 + Math.random()*32;
    s.style.setProperty('--dx', Math.cos(ang)*dist+'px');
    s.style.setProperty('--dy', Math.sin(ang)*dist+'px');
    hero.appendChild(s);
    setTimeout(()=>s.remove(), 700);
  }, { passive: true });
}

// ---- Login: hero logo (5 clicks) ----
let _heroLogoClicks = 0;
function loginHeroLogoClick() {
  _heroLogoClicks++;
  if(_heroLogoClicks >= 5) {
    _heroLogoClicks = 0;
    spawnConfetti();
    showEasterToast('🧠 ¡5 veces! Energía de campaña desbloqueada 💥');
  }
}

// ---- Login: card logo (7 clicks) ----
let _cardLogoClicks = 0;
function loginCardLogoClick() {
  _cardLogoClicks++;
  const badge = document.getElementById('loginCardLogoBadge');
  const wrap = document.getElementById('loginCardLogo');
  if(badge) { badge.textContent = _cardLogoClicks; badge.style.display = 'flex'; }
  if(wrap) { wrap.classList.add('wiggle'); setTimeout(()=>wrap.classList.remove('wiggle'), 600); }
  if(_cardLogoClicks >= 7) {
    _cardLogoClicks = 0;
    showEasterToast('💅 Siete clics. Talentos ocultos detectados.');
    if(badge) badge.style.display = 'none';
  }
}

// ---- Login: password & email field eggs ----
function loginPasswordEgg(v) {
  const el = document.getElementById('loginPwEaster');
  if(!el) return;
  const t = String(v||'').toLowerCase();
  const map = {
    'thinky':     '🧠 ¿"thinky" de contraseña? Creativa… pero no. 😏',
    '123456':     '😬 En serio… ¿123456? No, amiga.',
    'password':   '🙈 Eso no. Inténtalo de nuevo.',
    'contraseña': '🙈 Eso no. Inténtalo de nuevo.',
    'admin':      '🤖 Admin, ¿eh? Clásic@.'
  };
  el.textContent = map[t] || '';
}
function loginEmailEgg(v) {
  if(String(v||'').toLowerCase() === 'thinky') {
    showEasterToast('🤔 Eso no es un email… pero apreciamos el entusiasmo.');
  }
}

// Boot login interactions when the screen is visible. Idempotent.
function _maybeBootLogin() {
  const scr = document.getElementById('loginScreen');
  if(!scr || scr.classList.contains('hidden')) {
    _stopLoginInteractions();
    return;
  }
  _startLoginTaglines();
  _initLoginSparkles();
  try { initCoverSync(); } catch(e){}
}
function _stopLoginInteractions() {
  if(_loginTaglineTimer) { clearInterval(_loginTaglineTimer); _loginTaglineTimer = null; }
}

// Smooth fade between login screen and the app on successful auth.
function _playLoginToAppTransition() {
  const scr = document.getElementById('loginScreen');
  if(scr && !scr.classList.contains('hidden')) {
    scr.classList.add('fade-out');
  }
  // Brief pink flash + soft fade-in of the main shell
  const shell = document.querySelector('.app-shell') || document.querySelector('.layout') || document.body;
  if(shell) {
    shell.classList.remove('app-fade-in');
    // Force reflow so the class can re-trigger
    void shell.offsetWidth;
    shell.classList.add('app-fade-in');
  }
  const flash = document.createElement('div');
  flash.className = 'app-welcome-flash';
  document.body.appendChild(flash);
  setTimeout(()=>flash.remove(), 1300);
}
_maybeBootLogin();
// Re-check after potential auth flow
setTimeout(_maybeBootLogin, 500);
setTimeout(_maybeBootLogin, 1500);

// ============================================================
// AI COMPANION
// ============================================================
let _agentHistory = []; // [{role:'user'|'assistant', content:string}, ...]

function _agentEsc(s) { return String(s||'').replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c])); }

function _agentRenderThread() {
  const t = document.getElementById('aiThread');
  if(!t) return;
  if(_agentHistory.length === 0) {
    t.innerHTML = `
      <div class="ai-empty">
        <div style="font-size:32px;margin-bottom:8px;">✨</div>
        <div style="font-weight:700;font-size:14px;color:var(--text);margin-bottom:4px;">¿En qué te ayudo?</div>
        <div>Pregúntame sobre campañas, contenidos, influencers, tareas o presupuestos.</div>
        <div class="ai-suggestions">
          <button class="ai-suggestion" onclick="_agentRunSuggestion('¿Cuántos contenidos tenemos planeados en total en el escenario?')">¿Cuántos contenidos tenemos planeados en el escenario?</button>
          <button class="ai-suggestion" onclick="_agentRunSuggestion('¿Qué publicaciones nos quedan pendientes esta semana?')">¿Qué publicaciones nos quedan pendientes esta semana?</button>
          <button class="ai-suggestion" onclick="_agentRunSuggestion('Resume el status de todas mis campañas activas')">Resume el status de todas mis campañas activas</button>
          <button class="ai-suggestion" onclick="_agentRunSuggestion('¿Qué tareas tengo asignadas y para cuándo?')">¿Qué tareas tengo asignadas y para cuándo?</button>
        </div>
      </div>`;
    return;
  }
  t.innerHTML = _agentHistory.map(m => `<div class="ai-msg ${m.role}">${_agentEsc(m.content)}</div>`).join('');
  t.scrollTop = t.scrollHeight;
}

function toggleAgentPanel() {
  const p = document.getElementById('aiPanel');
  const b = document.getElementById('aiFab');
  if(!p) return;
  const willOpen = !p.classList.contains('open');
  p.classList.toggle('open', willOpen);
  b.classList.toggle('is-open', willOpen);
  if(willOpen) {
    _agentRenderThread();
    setTimeout(() => document.getElementById('aiInput')?.focus(), 200);
  }
}

function _agentRunSuggestion(q) {
  const inp = document.getElementById('aiInput');
  if(inp) inp.value = q;
  askAgent();
}

// ---- Build compact context from cached data ----
function _buildAgentContext() {
  const trim = (s, n=200) => { const v = String(s||'').trim(); return v.length>n ? v.slice(0,n)+'…' : v; };
  const fmt = (n) => Number.isFinite(n) ? n : 0;
  const today = new Date().toISOString().split('T')[0];

  const team = (allUsers||[]).map(u => ({
    name: u.name||u.email||'—',
    email: u.email,
    area: u.area||null,
    puesto: u.puesto||null,
    role: u.role||'member',
  }));

  const me = currentUserProfile ? { name: currentUserProfile.name, email: currentUserProfile.email, area: currentUserProfile.area, puesto: currentUserProfile.puesto } : null;

  const uidName = uid => { const u = (allUsers||[]).find(x=>x.uid===uid); return u ? (u.name||u.email) : uid; };

  const campaigns = (_cache.campaigns||[]).map(c => {
    // Escenario summary
    let escenario = null;
    try {
      if(c.escenarioRows && c.escenarioRows.length && typeof parseEscenarioRows === 'function') {
        const p = parseEscenarioRows(c.escenarioRows);
        const creators = (p.creators||[]).slice(0,80).map(cr => ({
          name: cr.name, platform: cr.platform, tier: cr.tier,
          seguidores: fmt(cr.totalSeguidores||cr.seguidores),
          contenidos: fmt(cr.totalContenidos||cr.cantidadContenido),
          contenidoTipo: trim(cr.contenido, 80),
          viewsEst: fmt(cr.viewsEstTotal),
          engagementEst: fmt(cr.engagementEst),
        }));
        const totalContenidos = creators.reduce((a,b)=>a+(b.contenidos||0),0);
        escenario = {
          totalCreators: (p.creators||[]).length,
          totalContenidos,
          goal: p.goal||null,
          creators,
        };
      }
    } catch(e){}

    // Tracker rows summary
    let tracker = null;
    if(c.trackerRows && c.trackerRows.length) {
      const rows = c.trackerRows.slice(0,150).map(r => {
        const pick = (...keys) => { for(const k of keys){ for(const rk of Object.keys(r)){ if(rk.toLowerCase().includes(k.toLowerCase())) return r[rk]; } } return ''; };
        return {
          influencer: pick('influencer','creador','creator','nombre'),
          platform: pick('plataforma','platform','red'),
          formato: pick('formato','format','tipo'),
          fechaPublicacion: pick('fecha publicacion','publish date','fecha post','post date','fecha de publicacion'),
          guion: pick('guion','script','guión'),
          contenido: pick('contenido','asset','status contenido'),
        };
      });
      const pending = rows.filter(r => !/aprobad/i.test(r.contenido) && !/public/i.test(r.contenido)).length;
      const published = rows.length - pending;
      tracker = { total: rows.length, pending, published, rows };
    }

    const tasks = (c.tasks||[]).map(t => ({
      title: trim(t.title, 120),
      done: !!t.done,
      due: t.due||null,
      assignee: t.assigneeUid ? uidName(t.assigneeUid) : (t.assignee||null),
      priority: t.priority||null,
    }));

    return {
      id: c.id,
      name: c.name,
      client: c.client,
      status: c.status,
      objective: trim(c.objective, 200),
      coreMessage: trim(c.coreMessage, 200),
      season: c.season,
      startDate: c.startDate, endDate: c.endDate,
      budgetClient: c.budgetClient || c.budget || null,
      responsables: Object.values(c.responsables||{}).flat().filter(Boolean).map(uidName),
      createdBy: c.createdBy ? uidName(c.createdBy) : null,
      goal: c.goal||null,
      tasksSummary: {
        total: tasks.length,
        pending: tasks.filter(t=>!t.done).length,
        done: tasks.filter(t=>t.done).length,
      },
      tasks,
      escenario,
      tracker,
    };
  });

  const globalTasks = (_cache.globalTasks||[]).map(t => ({
    title: trim(t.title, 120), done: !!t.done, due: t.due||null,
    assignee: t.assigneeUid ? uidName(t.assigneeUid) : null,
    priority: t.priority||null,
  }));

  return { today, me, team, campaigns, globalTasks };
}

async function askAgent() {
  const inp = document.getElementById('aiInput');
  const sendBtn = document.getElementById('aiSendBtn');
  const question = (inp.value||'').trim();
  if(!question) return;
  const s = getSettings();
  const provider = s.aiProvider || 'anthropic';
  const apiKey = provider === 'openai' ? s.openaiApiKey : s.claudeApiKey;
  if(!apiKey) {
    showToast(`Agrega tu ${provider==='openai'?'OpenAI':'Claude'} API Key en Ajustes`, 'error');
    return;
  }

  inp.value = '';
  _agentHistory.push({ role:'user', content: question });
  _agentHistory.push({ role:'assistant', content: '…' });
  _agentRenderThread();
  const lastIdx = _agentHistory.length - 1;
  const t = document.getElementById('aiThread');
  const lastNode = t.lastElementChild;
  if(lastNode) lastNode.classList.add('thinking');
  sendBtn.disabled = true;

  try {
    const ctx = _buildAgentContext();
    const ctxJson = JSON.stringify(ctx);
    const systemPrompt = [
      'Eres un asistente analítico para Campaign Manager OS, una herramienta de gestión de campañas de influencer marketing.',
      'Respondes preguntas del usuario usando ÚNICAMENTE los datos JSON que te paso en cada turno como "DATOS_ACTUALES". No inventes datos.',
      'Si la información no está en los datos, dilo claramente.',
      'Cuando cuentes contenidos o publicaciones, suma los valores explícitos del escenario (campo `escenario.creators[].contenidos` o `escenario.totalContenidos`) o del tracker (campo `tracker.rows`).',
      'Identifica campañas por nombre o cliente de forma flexible (por ejemplo "ABD" = "All Body Deo", "Rexona Men", etc.). Coincide por substring case-insensitive contra `name` y `client`.',
      'Responde en español, conciso, con bullets o números cuando aplique. No expliques el JSON ni cómo lo procesaste.',
    ].join(' ');

    // Trim message history (keep last 8 turns) to control token cost
    const recent = _agentHistory.slice(0, lastIdx).slice(-8);
    const userMessage = `DATOS_ACTUALES:\n\`\`\`json\n${ctxJson}\n\`\`\`\n\nPREGUNTA:\n${question}`;
    const msgsForApi = [
      ...recent.filter(m => m.role !== 'assistant' || m.content !== '…').map(m => ({ role: m.role, content: m.content })),
      { role:'user', content: userMessage }
    ];

    let answer = '';
    if(provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+apiKey},
        body: JSON.stringify({
          model:'gpt-4o-mini',
          max_tokens:900,
          messages:[{role:'system',content:systemPrompt}, ...msgsForApi]
        })
      });
      const data = await res.json();
      if(data.error) throw new Error(data.error.message);
      answer = data.choices[0].message.content;
    } else {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'x-api-key': apiKey,
          'anthropic-version':'2023-06-01',
          'anthropic-dangerous-direct-browser-access':'true'
        },
        body: JSON.stringify({
          model:'claude-haiku-4-5-20251001',
          max_tokens:900,
          system: systemPrompt,
          messages: msgsForApi
        })
      });
      const data = await res.json();
      if(data.error) throw new Error(data.error.message);
      answer = data.content[0].text;
    }

    _agentHistory[lastIdx] = { role:'assistant', content: answer };
  } catch(e) {
    _agentHistory[lastIdx] = { role:'assistant', content: 'Error: '+e.message };
  } finally {
    sendBtn.disabled = false;
    _agentRenderThread();
    inp.focus();
  }
}

function _agentInputKey(e) {
  if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); askAgent(); }
}

function clearAgentChat() {
  _agentHistory = [];
  _agentRenderThread();
}

