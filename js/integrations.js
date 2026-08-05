/* Campaign OS — Google Calendar y Gmail
   Extraído de index.html. Script CLÁSICO a propósito (NO type="module"):
   el HTML llama estas funciones desde atributos onclick/onchange, que solo
   resuelven contra el scope global. El orden de carga en index.html replica
   el orden original de ejecución y no debe alterarse. */

// ============================================================
// GOOGLE CALENDAR
// ============================================================
let calendarEvents = [];
(function(){
  const tok = localStorage.getItem('gcalToken');
  const exp = parseInt(localStorage.getItem('gcalTokenExpiry')||'0');
  if(tok && Date.now() < exp) { window._gcalTok = tok; }
  else { localStorage.removeItem('gcalToken'); localStorage.removeItem('gcalTokenExpiry'); }
})();
let calendarAccessToken = window._gcalTok || null;
let gmailMessages = [];
let _calendarConnecting = false;

function isGoogleUser() {
  return currentUser && currentUser.providerData.some(p => p.providerId === 'google.com');
}

async function connectGoogleCalendar() {
  if(_calendarConnecting) return;
  _calendarConnecting = true;
  const btn = document.querySelector('[onclick="connectGoogleCalendar()"]');
  if(btn) { btn.disabled = true; btn.textContent = 'Conectando...'; }
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/calendar.readonly');
    provider.addScope('https://www.googleapis.com/auth/gmail.modify');
    const result = await currentUser.reauthenticateWithPopup(provider);
    const tok = result.credential.accessToken;
    calendarAccessToken = tok;
    const expiry = Date.now() + 55 * 60 * 1000; // 55 min
    localStorage.setItem('gcalToken', tok);
    localStorage.setItem('gcalTokenExpiry', expiry.toString());
    await loadCalendarEvents();
    await loadGmailMessages();
  } catch(e) {
    if(e.code !== 'auth/popup-closed-by-user') {
      showToast('Error conectando calendario: ' + (traduceFirebaseError(e.code) || e.message), 'error');
    }
    renderCalendarWidget();
  } finally {
    _calendarConnecting = false;
  }
}

async function loadCalendarEvents() {
  if(!calendarAccessToken) { renderCalendarWidget(); return; }
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0).toISOString();
  const end   = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59).toISOString();
  try {
    // First: get list of ALL user calendars (shared, workspace, personal, etc.)
    const calListRes = await fetch(
      'https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=25',
      { headers: { Authorization: `Bearer ${calendarAccessToken}` } }
    );
    if(calListRes.status === 401) {
      calendarAccessToken = null;
      localStorage.removeItem('gcalToken'); localStorage.removeItem('gcalTokenExpiry');
      renderCalendarWidget(); renderGmailWidget(); return;
    }
    const calList = await calListRes.json();
    // Only query calendars the user OWNS — subscribed/shared calendars
    // show other people's events even when user isn't invited
    const calIds = (calList.items || [])
      .filter(c => c.selected !== false && c.accessRole === 'owner')
      .map(c => c.id);
    if(!calIds.length) calIds.push('primary');

    // Fetch events from all calendars in parallel
    const allResults = await Promise.all(calIds.map(cid =>
      fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cid)}/events?timeMin=${encodeURIComponent(start)}&timeMax=${encodeURIComponent(end)}&singleEvents=true&orderBy=startTime&maxResults=25`,
        { headers: { Authorization: `Bearer ${calendarAccessToken}` } }
      ).then(r => r.ok ? r.json() : {items:[]}).catch(()=>({items:[]}))
    ));

    // Merge + deduplicate by event ID
    const seen = new Set();
    const userEmail = (currentUser?.email || '').toLowerCase();
    calendarEvents = allResults
      .flatMap(d => d.items || [])
      .filter(e => {
        if(e.status === 'cancelled') return false;
        if(seen.has(e.id)) return false;
        seen.add(e.id);
        // User organized or created this event (covers personal events with no attendees)
        if(e.organizer?.self === true) return true;
        if(e.creator?.self === true) return true;
        if(e.organizer?.email?.toLowerCase() === userEmail) return true;
        if(e.creator?.email?.toLowerCase() === userEmail) return true;
        // User is explicitly in attendees list
        const attendees = e.attendees || [];
        return attendees.some(a =>
          a.self === true ||
          (a.email || '').toLowerCase() === userEmail
        );
      })
      .sort((a,b) => (a.start?.dateTime||a.start?.date||'').localeCompare(b.start?.dateTime||b.start?.date||''));

    renderCalendarWidget();
    return; // skip old single-calendar fetch below

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(start)}&timeMax=${encodeURIComponent(end)}&singleEvents=true&orderBy=startTime&maxResults=25`,
      { headers: { Authorization: `Bearer ${calendarAccessToken}` } }
    );
    if(res.status === 401) {
      calendarAccessToken = null;
      localStorage.removeItem('gcalToken');
      localStorage.removeItem('gcalTokenExpiry');
      renderCalendarWidget();
      renderGmailWidget();
      return;
    }
    if(res.status === 403) {
      const errData = await res.json().catch(()=>({}));
      const msg = errData?.error?.message || 'Acceso denegado';
      showToast('Calendar API no habilitada: ' + msg, 'error');
      const el = document.getElementById('googleCalendarWidget');
      if(el) el.innerHTML = `<div class="card"><div class="card-header"><span class="card-title">📅 Calendario de hoy</span></div><div style="padding:20px;text-align:center;color:var(--red);font-size:13px;">⚠️ Google Calendar API no está habilitada en tu proyecto de Google Cloud.<br><br><a href="https://console.cloud.google.com/apis/library/calendar-json.googleapis.com" target="_blank" rel="noopener noreferrer" class="btn btn-primary" style="margin-top:8px;">Habilitar Calendar API →</a></div></div>`;
      return;
    }
    const data = await res.json();
    calendarEvents = (data.items || []).filter(e => e.status !== 'cancelled');
    renderCalendarWidget();
  } catch(e) {
    console.error('Calendar fetch error', e);
    showToast('Error cargando calendario: ' + e.message, 'error');
    renderCalendarWidget();
  }
}

// ============================================================
// GMAIL
// ============================================================
async function loadGmailMessages() {
  if(!calendarAccessToken) { renderGmailWidget(); return; }
  try {
    // Fetch list of unread messages
    const listRes = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=12&q=is:unread&labelIds=INBOX',
      { headers: { Authorization: `Bearer ${calendarAccessToken}` } }
    );
    if(listRes.status === 401) {
      calendarAccessToken = null;
      localStorage.removeItem('gcalToken');
      localStorage.removeItem('gcalTokenExpiry');
      renderGmailWidget();
      return;
    }
    const listData = await listRes.json();
    const ids = (listData.messages || []).slice(0, 10).map(m => m.id);
    if(!ids.length) { gmailMessages = []; renderGmailWidget(); return; }
    // Fetch metadata for each message in parallel
    const msgResults = await Promise.all(ids.map(id =>
      fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${calendarAccessToken}` } }
      ).then(r => r.json())
    ));
    gmailMessages = msgResults.map(m => {
      const headers = m.payload?.headers || [];
      const get = name => (headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '');
      const from = get('From');
      // Parse "Name <email>" format
      const nameMatch = from.match(/^"?([^"<]+)"?\s*</);
      const emailMatch = from.match(/<([^>]+)>/);
      return {
        id: m.id,
        threadId: m.threadId,
        subject: get('Subject') || '(Sin asunto)',
        from: nameMatch ? nameMatch[1].trim() : (emailMatch ? emailMatch[1] : from),
        fromEmail: emailMatch ? emailMatch[1] : from,
        date: get('Date'),
        snippet: m.snippet || '',
        unread: (m.labelIds || []).includes('UNREAD'),
      };
    });
    renderGmailWidget();
  } catch(e) {
    console.error('Gmail fetch error', e);
    renderGmailWidget();
  }
}

function _gmailTimeAgo(dateStr) {
  if(!dateStr) return '';
  const d = new Date(dateStr);
  if(isNaN(d)) return '';
  const diff = Date.now() - d.getTime();
  const h = Math.floor(diff / 3600000);
  const m = Math.floor(diff / 60000);
  if(m < 1) return 'Ahora';
  if(m < 60) return `${m}m`;
  if(h < 24) return `${h}h`;
  const days = Math.floor(h/24);
  return `${days}d`;
}

function renderGmailWidget() {
  const el = document.getElementById('googleGmailWidget');
  if(!el) return;
  if(!calendarAccessToken) {
    el.innerHTML = `<div class="card">
      <div class="card-header"><span class="card-title">📧 Correos recientes</span></div>
      <div style="padding:24px;text-align:center;">
        <p style="color:var(--text-muted);font-size:13px;margin-bottom:14px;">Conecta tu cuenta de Google para ver tus correos no leídos aquí.</p>
        <button class="btn btn-primary" onclick="connectGoogleCalendar()">Conectar Google</button>
      </div>
    </div>`;
    return;
  }
  const unreadCount = gmailMessages.filter(m => m.unread).length;
  const msgs = gmailMessages.slice(0, 4);
  el.innerHTML = `<div class="card">
    <div class="card-header">
      <span class="card-title">📧 Correos <span style="font-size:12px;font-weight:600;padding:2px 8px;border-radius:10px;background:var(--pink-pale);color:var(--pink-deep);margin-left:4px;">${unreadCount} no leídos</span></span>
      <button class="btn btn-ghost btn-sm" onclick="loadGmailMessages()" title="Actualizar">↻</button>
    </div>
    ${msgs.length === 0
      ? '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px;">¡Bandeja limpia! 🎉</div>'
      : `<div style="display:flex;flex-direction:column;gap:0;">
          ${msgs.map(m => `
            <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);cursor:pointer;transition:background .15s;position:relative;"
                 onmouseover="this.style.background='var(--bg)';this.querySelector('.gmail-trash-btn').style.opacity='1'" onmouseout="this.style.background='';this.querySelector('.gmail-trash-btn').style.opacity='0'"
                 onclick="window.open('https://mail.google.com/mail/u/0/#inbox/${m.threadId}','_blank')">
              <div style="width:32px;height:32px;border-radius:10px;background:var(--pink-pale);color:var(--pink-deep);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0;">
                ${(m.from[0]||'?').toUpperCase()}
              </div>
              <div style="flex:1;min-width:0;">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;">
                  <span style="font-size:12px;font-weight:${m.unread?'700':'500'};color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${m.from}</span>
                  <span style="font-size:10px;color:var(--text-muted);flex-shrink:0;">${_gmailTimeAgo(m.date)}</span>
                </div>
                <div style="font-size:12px;font-weight:${m.unread?'600':'400'};color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:1px;">${m.subject}</div>
                <div style="font-size:11px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px;">${m.snippet}</div>
              </div>
              ${m.unread ? '<div style="width:7px;height:7px;border-radius:50%;background:var(--pink);flex-shrink:0;margin-top:4px;"></div>' : ''}
              <button class="gmail-trash-btn" onclick="trashGmailMessage('${m.id}',event)" title="Borrar correo"
                style="opacity:0;transition:opacity .15s;background:none;border:none;cursor:pointer;padding:2px 4px;color:var(--text-muted);font-size:14px;flex-shrink:0;line-height:1;border-radius:6px;"
                onmouseover="this.style.color='var(--red)'" onmouseout="this.style.color='var(--text-muted)'">🗑</button>
            </div>
          `).join('')}
        </div>
        <div style="padding-top:10px;">
          <a href="https://mail.google.com" target="_blank" rel="noopener noreferrer" style="font-size:12px;color:var(--blue);font-weight:600;">Abrir Gmail →</a>
        </div>`
    }
  </div>`;
}

async function trashGmailMessage(id, e) {
  e.stopPropagation();
  if(!calendarAccessToken) return;
  try {
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}/trash`,
      { method:'POST', headers:{ Authorization:`Bearer ${calendarAccessToken}` } }
    );
    if(res.status === 403) {
      // Token lacks gmail.modify scope — force reconnect to get new scopes
      calendarAccessToken = null;
      localStorage.removeItem('gcalToken'); localStorage.removeItem('gcalTokenExpiry');
      renderGmailWidget(); renderCalendarWidget();
      showToast('Reconecta Google para habilitar borrar correos','error');
      return;
    }
    if(!res.ok) throw new Error('HTTP ' + res.status);
    gmailMessages = gmailMessages.filter(m => m.id !== id);
    renderGmailWidget();
    showToast('Correo movido a papelera','success');
  } catch(err) {
    showToast('Error al borrar: ' + err.message,'error');
  }
}

function renderCalendarWidget() {
  const el = document.getElementById('googleCalendarWidget');
  if(!el) return;

  if(!calendarAccessToken) {
    el.innerHTML = `<div class="card">
      <div class="card-header"><span class="card-title">📅 Calendario de hoy</span></div>
      <div style="padding:24px;text-align:center;">
        <p style="color:var(--text-muted);font-size:13px;margin-bottom:14px;">Conecta tu Google Calendar para ver tus reuniones y eventos del día aquí.</p>
        <button class="btn btn-primary" onclick="connectGoogleCalendar()">Conectar Google</button>
      </div>
    </div>`;
    return;
  }

  const getMeetLink = (ev) => {
    if(ev.hangoutLink) return ev.hangoutLink;
    const ep = (ev.conferenceData?.entryPoints || []).find(p => p.entryPointType === 'video');
    return ep?.uri || null;
  };

  const fmtTime = (dt) => {
    if(!dt) return '';
    if(dt.dateTime) return new Date(dt.dateTime).toLocaleTimeString('es-MX', {hour:'2-digit', minute:'2-digit'});
    return 'Todo el día';
  };

  const fmtRange = (ev) => {
    const s = fmtTime(ev.start), e = fmtTime(ev.end);
    return (s && e && s !== 'Todo el día') ? `${s} – ${e}` : (s || 'Todo el día');
  };

  const total = calendarEvents.length;
  const meetCount = calendarEvents.filter(e => getMeetLink(e)).length;

  const now = new Date();
  const evtStart = ev => ev.start?.dateTime ? new Date(ev.start.dateTime) : null;
  const evtEnd   = ev => ev.end?.dateTime   ? new Date(ev.end.dateTime)   : null;
  const isPastEv    = ev => { const e = evtEnd(ev);   return e && e < now; };
  const isOngoingEv = ev => { const s = evtStart(ev), e = evtEnd(ev); return s && e && s <= now && now < e; };

  const renderEvt = (ev, status) => {
    const meetLink = getMeetLink(ev);
    const attendees = (ev.attendees || []).filter(a => !a.self).slice(0,6).map(a => a.displayName || a.email).join(', ');
    const organizer = ev.organizer?.displayName || ev.organizer?.email || '';
    const rawDesc = ev.description || '';
    const desc = rawDesc.replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').trim().substring(0,220);
    const hasMeet = !!meetLink;
    const safeLink = meetLink ? meetLink.replace(/'/g,"\\'") : '';
    const past = status === 'past';
    const ongoing = status === 'ongoing';
    return `
      <div class="cal-event ${hasMeet?'has-meet':'no-meet'} ${past?'cal-past':''} ${ongoing?'cal-ongoing':''}"
           ${hasMeet && !past ? `onclick="window.open('${safeLink}','_blank')"` : ''}>
        <div class="cal-dot"></div>
        <div class="cal-time">${fmtRange(ev)}</div>
        <div class="cal-title">${ev.summary || '(Sin título)'}</div>
        ${ongoing ? '<span class="cal-ongoing-badge">En curso</span>' : ''}
        ${hasMeet && !past ? '<span class="cal-meet-badge">Meet</span>' : ''}
        <div class="cal-tooltip-box">
          <div class="cal-tooltip-title">${ev.summary || 'Sin título'}</div>
          <div class="cal-tooltip-row">🕐 ${fmtRange(ev)}</div>
          ${organizer ? `<div class="cal-tooltip-row">👤 Organiza: ${organizer}</div>` : ''}
          ${attendees ? `<div class="cal-tooltip-row">👥 ${attendees}</div>` : ''}
          ${desc ? `<div class="cal-tooltip-row" style="margin-top:8px;border-top:1px solid rgba(255,255,255,.15);padding-top:8px;">${desc}</div>` : ''}
          ${hasMeet && !past ? `<div class="cal-tooltip-meet">→ Clic para abrir Google Meet</div>` : ''}
        </div>
      </div>`;
  };

  const pastEvs     = calendarEvents.filter(ev => isPastEv(ev));
  const ongoingEvs  = calendarEvents.filter(ev => isOngoingEv(ev));
  const upcomingEvs = calendarEvents.filter(ev => !isPastEv(ev) && !isOngoingEv(ev));

  let eventsHtml;
  if(total === 0) {
    eventsHtml = `<div class="cal-connect-empty" style="padding:12px 0"><p style="margin:0">¡Sin reuniones hoy! 🎉</p></div>`;
  } else {
    const hasFuture = ongoingEvs.length > 0 || upcomingEvs.length > 0;
    eventsHtml =
      pastEvs.map(ev => renderEvt(ev,'past')).join('') +
      (pastEvs.length > 0 && hasFuture ? `<div class="cal-divider"><span>${ongoingEvs.length > 0 ? 'En curso' : 'Próximas'}</span></div>` : '') +
      ongoingEvs.map(ev => renderEvt(ev,'ongoing')).join('') +
      upcomingEvs.map(ev => renderEvt(ev,'upcoming')).join('');
  }

  // Classify events: internal = all attendees @thinkydigital.com, external = has outside attendees
  const domain = (currentUser?.email||'').split('@')[1] || 'thinkydigital.com';
  let internalCount = 0, externalCount = 0;
  calendarEvents.forEach(ev => {
    const attendees = ev.attendees || [];
    const hasExternal = attendees.some(a => !a.self && !a.email?.endsWith('@'+domain));
    if(attendees.length > 0) {
      if(hasExternal) externalCount++;
      else internalCount++;
    }
  });
  const summaryParts = [];
  if(internalCount > 0) summaryParts.push(`${internalCount} interna${internalCount!==1?'s':''}`);
  if(externalCount > 0) summaryParts.push(`${externalCount} externa${externalCount!==1?'s':''}`);
  const callSummary = summaryParts.length > 0
    ? `📊 ${summaryParts.join(' · ')}`
    : calendarEvents.length > 0 ? `${calendarEvents.length} evento${calendarEvents.length!==1?'s':''}` : '';

  el.innerHTML = `<div class="card">
    <div class="card-header">
      <div>
        <span class="card-title">📅 Calendario de hoy</span>
        ${callSummary ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${callSummary}</div>` : ''}
      </div>
      <button class="btn btn-ghost btn-sm" onclick="loadCalendarEvents()" title="Actualizar">↻</button>
    </div>
    <div class="cal-events">${eventsHtml}</div>
  </div>`;
}

async function seedSampleData() {
  const today = new Date();
  const fmt = (d) => d.toISOString().split('T')[0];
  const add = (d,days) => { const r=new Date(d); r.setDate(r.getDate()+days); return r; };
  // Reuse the data builder from initSampleData by calling it but route to Firestore
  const campaigns = [
    {
      id:'c1', name:'Mundial', client:'Coppel', status:'En proceso',
      season:'Abril - Junio 2024', objective:'Awareness', coreMessage:'Vive la pasión',
      budget:'$250,000 MXN', responsible:'Génesis', deadline: fmt(add(today,22)),
      flowSteps: FLOW_STEPS.map((s,i)=>({step:s, status: i<4?'Completado': i===4?'Pendiente aprobación': i===5?'En proceso':'Pendiente'})),
      influencers:[
        {id:id(),name:'Hanna',handle:'@hannamx',platform:'Instagram',format:'Reel',publishDate:fmt(add(today,1)),status:'Aprobado',reach:235678,impressions:456789,interactions:18765,er:'7.96%'},
        {id:id(),name:'Fer Jalil',handle:'@ferjalil',platform:'Instagram',format:'Story',publishDate:fmt(add(today,3)),status:'En producción',reach:0,impressions:0,interactions:0,er:'—'},
        {id:id(),name:'Mariana C.',handle:'@marianac',platform:'Instagram',format:'Story',publishDate:fmt(add(today,-3)),status:'Publicado',reach:92345,impressions:145678,interactions:5678,er:'6.15%'}
      ],
      documents:[
        {id:id(),name:'PRESS MUNDIAL_v3.pdf',type:'PDF',date:fmt(add(today,-1)),url:''},
        {id:id(),name:'BRIEF MUNDIAL.pdf',type:'PDF',date:fmt(add(today,-5)),url:''}
      ],
      tasks:[
        {id:id(),title:'Enviar follow up a César por SKUs Mundial',dueDate:fmt(today),priority:'high',done:false,assignee:'Génesis'},
        {id:id(),title:'Confirmar publicación de Hanna',dueDate:fmt(today),priority:'medium',done:false,assignee:'Génesis'},
        {id:id(),title:'Falta aprobar SKUs de 3 perfiles',dueDate:fmt(today),priority:'high',done:false,assignee:'Génesis'}
      ]
    },
    {
      id:'c2', name:'AON', client:'Sportline', status:'Ajustes',
      season:'Mayo 2024', objective:'Ventas', coreMessage:'Tu equipo, tu look',
      budget:'$180,000 MXN', responsible:'Génesis', deadline: fmt(add(today,21)),
      flowSteps: FLOW_STEPS.map((s,i)=>({step:s, status: i<3?'Completado': i===3?'Aprobado':'Pendiente'})),
      influencers:[
        {id:id(),name:'Fer Jalil',handle:'@ferjalil',platform:'Instagram',format:'Story',publishDate:fmt(add(today,-1)),status:'Publicado',reach:78245,impressions:120456,interactions:4321,er:'5.52%'},
        {id:id(),name:'Pao',handle:'@paorojas',platform:'Instagram',format:'Post',publishDate:fmt(add(today,4)),status:'Pendiente',reach:0,impressions:0,interactions:0,er:'—'}
      ],
      documents:[{id:id(),name:'BUDGET AON.xlsx',type:'Sheets',date:fmt(add(today,-2)),url:''}],
      tasks:[
        {id:id(),title:'Revisar ajustes de costo en budget AON',dueDate:fmt(today),priority:'high',done:false,assignee:'Génesis'},
        {id:id(),title:'Falta enviar brief a 2 influencers',dueDate:fmt(today),priority:'medium',done:false,assignee:'Génesis'}
      ]
    },
    {
      id:'c3', name:'Semana Santa', client:'Avène', status:'En reporte',
      season:'Abril 2024', objective:'Awareness', coreMessage:'Tu piel, tu ritual',
      budget:'$120,000 MXN', responsible:'Génesis', deadline: fmt(add(today,25)),
      flowSteps: FLOW_STEPS.map((s,i)=>({step:s, status: i<8?'Completado': i===8?'En proceso':'Pendiente'})),
      influencers:[
        {id:id(),name:'Pao',handle:'@paorojas',platform:'Instagram',format:'Post',publishDate:fmt(add(today,-2)),status:'Publicado',reach:156789,impressions:289456,interactions:12345,er:'7.87%'},
        {id:id(),name:'Alex Tienda',handle:'@alextienda',platform:'TikTok',format:'Reel',publishDate:fmt(add(today,-2)),status:'Publicado',reach:344567,impressions:612345,interactions:28765,er:'8.33%'}
      ],
      documents:[
        {id:id(),name:'BRIEF SEMANA SANTA.pdf',type:'PDF',date:fmt(add(today,-2)),url:''},
        {id:id(),name:'REPORTE ABRIL.pdf',type:'PDF',date:fmt(add(today,-3)),url:''}
      ],
      tasks:[
        {id:id(),title:'Pedir métricas a Pao (Semana Santa)',dueDate:fmt(today),priority:'medium',done:false,assignee:'Génesis'},
        {id:id(),title:'Consolidar métricas',dueDate:fmt(add(today,5)),priority:'low',done:false,assignee:'Génesis'}
      ]
    }
  ];
  const globalTasks = [
    {id:id(),title:'Actualizar minuta del weekly',campaignId:'',campaignName:'Interno',dueDate:fmt(today),priority:'medium',done:false,assignee:'Génesis'}
  ];
  // Stamp creator/assignee so seeded campaigns are visible to the seeding user
  campaigns.forEach(c => { c.createdBy = currentUser.uid; c.assignedTo = [currentUser.uid]; });
  _cache.campaigns = campaigns;
  _cache.globalTasks = globalTasks;
  await persistCampaigns(campaigns);
  await persistGlobalTasks(globalTasks);
}


// Resolve placeholder ph-icons via data-ic
(function(){
  const map={...SIDEBAR_ICN, users:ICN_users,folder:ICN_doc,calendar:ICN_calendar,chart:ICN_chart};
  document.querySelectorAll('[data-ic]').forEach(el=>{el.innerHTML=map[el.dataset.ic]||'';});
  // Inject inline icons in static buttons
  document.querySelectorAll('.icn-inline').forEach(el=>{if(!el.innerHTML)el.innerHTML=ICN_sparkle;});
  document.querySelectorAll('.icn-copy').forEach(el=>{if(!el.innerHTML)el.innerHTML=ICN_copy;});
  document.querySelectorAll('.icn-mail').forEach(el=>{if(!el.innerHTML)el.innerHTML=ICN_mail;});
  document.querySelectorAll('.icn-edit').forEach(el=>{if(!el.innerHTML)el.innerHTML=ICN_edit;});
  document.querySelectorAll('.icn-trash').forEach(el=>{if(!el.innerHTML)el.innerHTML=ICN_trash;});
  document.querySelectorAll('.icn-close').forEach(el=>{if(!el.innerHTML)el.innerHTML=ICN_close;});
})();

// init() now triggered by auth.onAuthStateChanged above

// Close area dropdowns when clicking outside
document.addEventListener('click', () => {
  ['operaciones','cuentas','creativo','data'].forEach(k => {
    const d = document.getElementById('areaDD_' + k);
    if(d) d.style.display = 'none';
  });
});

