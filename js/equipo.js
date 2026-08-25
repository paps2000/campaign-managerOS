/* Campaign OS — Equipo: directorio, organigrama y altas/bajas
   =============================================
   El organigrama se dibuja desde NIVELES + PUESTO_NIVEL (js/core.js): es
   jerarquía por PUESTO, no líneas de reporte persona a persona.
   Script CLÁSICO a propósito (NO type="module"): el HTML llama estas funciones
   desde atributos onclick/onchange, que sólo resuelven contra el scope global,
   y todos los archivos de js/ comparten ese mismo scope. El orden de <script>
   en index.html es el orden real de ejecución. */

// === TEAM MGMT ===
// ============================================================
// EQUIPO PAGE (visible to all users)
// ============================================================
let _equipoAreaFilter = 'todos';
let _equipoView = 'directorio';   // directorio | organigrama

function setEquipoView(v) {
  _equipoView = v;
  document.querySelectorAll('#equipoViewTabs .profile-tab-btn')
    .forEach(b => b.classList.toggle('active', b.dataset.eqtab === v));
  renderEquipo();
}

function renderEquipo() {
  const filterBar = document.getElementById('equipoFilterBar');
  const grid = document.getElementById('equipoGrid');
  const org  = document.getElementById('equipoOrg');
  if(!filterBar || !grid) return;

  // El filtro por área es del directorio: en el organigrama esconder a media
  // empresa deja un árbol con huecos que se lee como si faltara gente.
  const esOrg = _equipoView === 'organigrama';
  filterBar.style.display = esOrg ? 'none' : '';
  grid.style.display      = esOrg ? 'none' : '';
  if(org) org.style.display = esOrg ? '' : 'none';
  if(esOrg) { renderOrganigrama(); return; }

  const areas = ['Todos', ...AREAS];
  filterBar.innerHTML = areas.map(a =>
    `<button class="filter-tab ${_equipoAreaFilter===(a==='Todos'?'todos':a)?'active':''}"
       onclick="_setEquipoFilter('${a==='Todos'?'todos':a}')">${a}</button>`
  ).join('');

  const members = _equipoAreaFilter === 'todos'
    ? allUsers
    : allUsers.filter(u => u.area === _equipoAreaFilter);

  const sorted = [...members].sort((a,b) => {
    if(a.uid === currentUser?.uid) return -1;
    if(b.uid === currentUser?.uid) return 1;
    if(a.role==='admin' && b.role!=='admin') return -1;
    if(b.role==='admin' && a.role!=='admin') return 1;
    return (a.name||'').localeCompare(b.name||'');
  });

  if(!sorted.length) {
    grid.innerHTML = '<div class="empty-state"><p>Nadie en esta área todavía. Cambia el área de alguien desde su perfil para verlo aquí.</p></div>';
    return;
  }

  grid.innerHTML = `<div class="team-grid t-avatar-group" id="equipoAvatarGroup">${sorted.map(u => {
    const activeTasks = [
      ..._cache.campaigns.flatMap(c=>(c.tasks||[]).filter(t=>!t.done&&t.assigneeUid===u.uid)),
      ..._cache.globalTasks.filter(t=>!t.done&&t.assigneeUid===u.uid)
    ];
    const isMe = u.uid === currentUser?.uid;
    const hasStatus = !!u.statusText;
    return `
    <div class="team-card t-avatar" onclick="openProfileModal('${u.uid}')">
      ${isMe ? '<div class="team-card-you">Tú</div>' : ''}
      <div class="team-card-avatar">${memberAvatarHtml(u, 56, '16px')}</div>
      <div class="team-card-name">${_esc(u.name||'—')}</div>
      ${(u.puesto||u.role) ? `<div class="team-card-role">${_esc(u.puesto)||(u.role==='admin'?'Admin':'Miembro')}</div>` : ''}
      <div class="team-card-badges">
        ${u.area ? `<span class="badge badge-area-${u.area}" style="font-size:10px;">${_esc(u.area)}</span>` : ''}
        ${u.role==='admin' ? `<span class="badge" style="background:var(--pink-pale);color:var(--pink-deep);font-size:10px;">Admin</span>` : ''}
      </div>
      ${hasStatus ? `<div class="team-card-status">${u.statusEmoji||''} ${_esc(u.statusText)}</div>` : ''}
      ${activeTasks.length > 0 ? `<div class="team-card-tasks">${activeTasks.length} tarea${activeTasks.length!==1?'s':''}</div>` : ''}
      ${!isMe ? `<button class="kudos-btn" onclick="sendKudos('${u.uid}',event)" style="margin-top:2px;"><span class="icn-inline">${ICN_trophy}</span>Kudos</button>` : ''}
      ${(!isMe && isAdmin()) ? `<button class="team-card-del" onclick="event.stopPropagation();openDeleteUserModal('${u.uid}')" title="Eliminar el perfil de esta persona del workspace">Eliminar perfil</button>` : ''}
    </div>`;
  }).join('')}</div>`;
  try { _wireAvatarGroup(document.getElementById('equipoAvatarGroup')); } catch(e){}
}

// ============================================================
// ORGANIGRAMA
// ============================================================
// Se dibuja desde NIVELES + PUESTO_NIVEL (js/core.js), no desde líneas de
// reporte capturadas a mano: el producto no las tiene. Cada fila es un nivel y
// dentro se agrupa por área, que es como el equipo se organiza en la práctica.
// Cuando existan permisos por nivel, este es el mismo dato que los va a regir.
function renderOrganigrama() {
  const host = document.getElementById('equipoOrg');
  if(!host) return;

  const porNivel = new Map();
  allUsers.forEach(u => {
    const n = nivelDe(u);
    if(!porNivel.has(n)) porNivel.set(n, []);
    porNivel.get(n).push(u);
  });
  const niveles = [...porNivel.keys()].sort((a,b) => a-b);

  if(!niveles.length) {
    host.innerHTML = '<div class="empty-state"><p>Sin equipo cargado. En cuanto alguien entre con su correo de Think Y., aparece aquí.</p></div>';
    return;
  }

  const tarjeta = u => `
    <div class="org-person" onclick="openProfileModal('${u.uid}')" title="${_esc((u.puesto||'Sin puesto') + ' · ' + (u.area||'Sin área'))}">
      ${memberAvatarHtml(u, 38, '12px')}
      <div class="org-person-id">
        <span class="org-person-name">${_esc(u.name || u.email || '—')}</span>
        <span class="org-person-role">${_esc(u.puesto || (u.role==='admin' ? 'Admin' : 'Sin puesto'))}</span>
      </div>
      ${u.area ? `<span class="badge badge-area-${u.area}" style="font-size:9px;">${_esc(u.area)}</span>` : ''}
    </div>`;

  host.innerHTML = niveles.map(n => {
    const gente = porNivel.get(n).slice().sort((a,b) =>
      String(a.area||'').localeCompare(String(b.area||'')) ||
      String(a.name||'').localeCompare(String(b.name||'')));
    const meta = NIVELES.find(v => v.n === n);
    // Por área dentro del nivel, para que se lea la fila como una capa real.
    const porArea = new Map();
    gente.forEach(u => {
      const a = u.area || 'Sin área';
      if(!porArea.has(a)) porArea.set(a, []);
      porArea.get(a).push(u);
    });
    return `
      <section class="org-nivel">
        <header class="org-nivel-head">
          <span class="org-nivel-n">${n === 99 ? '—' : n}</span>
          <div>
            <div class="org-nivel-label">${_esc(nivelLabel(n))}</div>
            <div class="org-nivel-desc">${_esc(meta ? meta.desc : 'Puesto sin nivel asignado en PUESTO_NIVEL.')}</div>
          </div>
          <span class="org-nivel-count">${gente.length}</span>
        </header>
        <div class="org-nivel-body">
          ${[...porArea.entries()].map(([area, us]) => `
            <div class="org-area">
              <div class="org-area-label">${_esc(area)}</div>
              <div class="org-area-people">${us.map(tarjeta).join('')}</div>
            </div>`).join('')}
        </div>
      </section>`;
  }).join('') + `
    <p class="org-nota">
      El orden sale del puesto de cada quien (<code>PUESTO_NIVEL</code> en
      <code>js/core.js</code>). No son líneas de reporte persona a persona: para
      eso hace falta capturarlas. Un puesto que no esté dado de alta ahí aparece
      como <b>Sin nivel</b>.
    </p>`;
}

// Hook .t-avatar items inside a .t-avatar-group: hovering one lifts
// neighbours with an exponential falloff and pops the active one.
function _wireAvatarGroup(root) {
  if(!root || root._wired) return;
  root._wired = true;
  const items = Array.from(root.querySelectorAll('.t-avatar'));
  if(!items.length) return;
  const lift = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--avatar-lift')) || -4;
  const scale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--avatar-scale')) || 1.05;
  const falloff = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--avatar-falloff')) || 0.45;
  const easeIn  = getComputedStyle(document.documentElement).getPropertyValue('--avatar-ease-in')  || '';
  const easeOut = getComputedStyle(document.documentElement).getPropertyValue('--avatar-ease-out') || '';
  items.forEach((el, idx) => {
    el.addEventListener('mouseenter', () => {
      items.forEach((other, j) => {
        other.style.transitionTimingFunction = easeIn;
        const dist = Math.abs(j - idx);
        other.style.setProperty('--shift',  (lift * Math.pow(falloff, dist)).toFixed(3) + 'px');
        other.style.setProperty('--scale-active', j === idx ? scale : 1);
      });
    });
  });
  root.addEventListener('mouseleave', () => {
    items.forEach(other => {
      other.style.transitionTimingFunction = easeOut;
      other.style.setProperty('--shift', '0px');
      other.style.setProperty('--scale-active', 1);
    });
  });
}

function _setEquipoFilter(area) {
  _equipoAreaFilter = area;
  renderEquipo();
}

function renderTeam() {
  // Sección de portada del login: solo admins
  const seasonSec = document.getElementById('seasonAdminSection');
  if(seasonSec) seasonSec.style.display = (typeof isAdmin==='function' && isAdmin()) ? '' : 'none';
  const list = document.getElementById('teamList');
  if(!list) return;

  if(allUsers.length === 0) {
    list.innerHTML = '<div class="empty-state"><p>Sin miembros todavía. En cuanto alguien entre con su correo de Think Y., aparece aquí.</p></div>';
    return;
  }

  const sorted = [...allUsers].sort((a,b) => {
    if(a.uid === currentUser?.uid) return -1;
    if(b.uid === currentUser?.uid) return 1;
    if(a.role === 'admin' && b.role !== 'admin') return -1;
    if(b.role === 'admin' && a.role !== 'admin') return 1;
    return (a.name||'').localeCompare(b.name||'');
  });

  list.innerHTML = `<div class="team-grid">${sorted.map(u => {
    const activeTasks = [
      ..._cache.campaigns.flatMap(c=>(c.tasks||[]).filter(t=>!t.done&&t.assigneeUid===u.uid)),
      ..._cache.globalTasks.filter(t=>!t.done&&t.assigneeUid===u.uid)
    ];
    const isMe = u.uid === currentUser?.uid;
    const hasStatus = !!u.statusText;
    const avatarHtml = memberAvatarHtml(u, 56, '16px');

    const adminSelects = isAdmin() && !isMe ? `
      <div style="display:flex;flex-direction:column;gap:5px;width:100%;margin-top:4px;" onclick="event.stopPropagation()">
        <select onchange="changeArea('${u.uid}',this.value)" style="width:100%;padding:5px 8px;border:1.5px solid var(--border);border-radius:8px;font-size:11px;font-family:inherit;background:var(--white);color:var(--text);cursor:pointer;">
          <option value="">Sin área</option>
          ${AREAS.map(a=>`<option value="${a}" ${u.area===a?'selected':''}>${a}</option>`).join('')}
        </select>
        <select onchange="changePuesto('${u.uid}',this.value)" style="width:100%;padding:5px 8px;border:1.5px solid var(--border);border-radius:8px;font-size:11px;font-family:inherit;background:var(--white);color:var(--text);cursor:pointer;">
          <option value="">Sin puesto</option>
          ${PUESTOS.map(p=>`<option value="${p}" ${u.puesto===p?'selected':''}>${p}</option>`).join('')}
        </select>
        <select onchange="changeRole('${u.uid}',this.value)" style="width:100%;padding:5px 8px;border:1.5px solid var(--border);border-radius:8px;font-size:11px;font-family:inherit;background:var(--white);color:var(--text);cursor:pointer;">
          <option value="member" ${u.role==='member'?'selected':''}>Miembro</option>
          <option value="admin" ${u.role==='admin'?'selected':''}>Admin</option>
        </select>
        <button onclick="event.stopPropagation();openDeleteUserModal('${u.uid}')" style="width:100%;padding:5px 8px;border:1.5px solid var(--red);border-radius:8px;font-size:11px;font-weight:700;background:var(--white);color:var(--red);cursor:pointer;margin-top:2px;">Eliminar perfil</button>
      </div>` : '';

    return `
    <div class="team-card" onclick="openProfileModal('${u.uid}')">
      ${isMe ? '<div class="team-card-you">Tú</div>' : ''}
      <div class="team-card-avatar">${avatarHtml}</div>
      <div class="team-card-name">${_esc(u.name||'—')}</div>
      ${(u.puesto||u.role) ? `<div class="team-card-role">${_esc(u.puesto) || (u.role==='admin'?'Admin':'Miembro')}</div>` : ''}
      <div class="team-card-badges">
        ${u.area ? `<span class="badge badge-area-${u.area}" style="font-size:10px;">${_esc(u.area)}</span>` : ''}
        ${u.role==='admin' ? `<span class="badge" style="background:var(--pink-pale);color:var(--pink-deep);font-size:10px;">Admin</span>` : ''}
      </div>
      ${hasStatus ? `<div class="team-card-status">${u.statusEmoji||''} ${_esc(u.statusText)}</div>` : ''}
      ${activeTasks.length > 0 ? `<div class="team-card-tasks">${activeTasks.length} tarea${activeTasks.length!==1?'s':''}</div>` : ''}
      ${!isMe ? `<button class="kudos-btn" onclick="sendKudos('${u.uid}',event)" style="margin-top:2px;"><span class="icn-inline">${ICN_trophy}</span>Kudos</button>` : ''}
      ${adminSelects}
    </div>`;
  }).join('')}</div>`;
}

async function changeArea(uid, newArea) {
  if(!isAdmin()) { showToast('Cambiar el área es cosa de admins. Pídeselo a alguien con ese rol.','error'); return; }
  try {
    const ws = db.collection('workspaces').doc(WORKSPACE);
    await Promise.all([
      db.collection('users').doc(uid).update({area: newArea}),
      ws.collection('members').doc(uid).set({area: newArea}, {merge:true})
    ]);
    const u = allUsers.find(x=>x.uid===uid);
    if(u) u.area = newArea;
    showToast('Área actualizada','success');
    renderTeam();
  } catch(e) { avisarError(e, 'cambiar el área', 'changeArea'); }
}

async function changeRole(uid, newRole) {
  if(!isAdmin()) { showToast('Cambiar roles es cosa de admins. Pídeselo a alguien con ese rol.','error'); return; }
  try {
    const ws = db.collection('workspaces').doc(WORKSPACE);
    await Promise.all([
      db.collection('users').doc(uid).update({role: newRole}),
      ws.collection('members').doc(uid).set({role: newRole}, {merge:true})
    ]);
    const u = allUsers.find(x=>x.uid===uid); if(u) u.role = newRole;
    showToast('Rol actualizado','success');
    renderTeam();
  } catch(e) { avisarError(e, 'cambiar el rol', 'changeRole'); }
}

// ---- Eliminar perfil (admin) ----
function _countUserRefs(uid) {
  let campCreated=0, campSubs=0, campResp=0, tasksCamp=0, tasksGlobal=0;
  const perfil = (allUsers||[]).find(u => u.uid === uid);
  const seguidas = new Set(Array.isArray(perfil && perfil.subscribedCampaigns) ? perfil.subscribedCampaigns : []);
  (_cache.campaigns||[]).forEach(c => {
    if(c.createdBy === uid) campCreated++;
    // La suscripción vive en el perfil; en la campaña sólo puede quedar rastro
    // viejo de quien todavía no haya migrado. Cuenta si está en cualquiera de
    // las dos, pero una sola vez: si no, la que está en ambas suma doble.
    if(seguidas.has(c.id) || (Array.isArray(c.subscribers) && c.subscribers.includes(uid))) campSubs++;
    if(c.responsables) {
      AREA_KEY_LIST.forEach(k => { if(getAreaUids(c.responsables, k).includes(uid)) campResp++; });
    }
    (c.tasks||[]).forEach(t => { if(t.assigneeUid===uid) tasksCamp++; });
  });
  (_cache.globalTasks||[]).forEach(t => { if(t.assigneeUid===uid) tasksGlobal++; });
  return { campCreated, campSubs, campResp, tasksCamp, tasksGlobal };
}

function openDeleteUserModal(uid) {
  if(!isAdmin()) { showToast('Eliminar perfiles es cosa de admins. Pídeselo a alguien con ese rol.','error'); return; }
  if(uid === currentUser?.uid) { showToast('No puedes eliminar tu propio perfil. Pídele a otro admin que lo haga.','error'); return; }
  const target = allUsers.find(u=>u.uid===uid);
  if(!target) { showToast('Usuario no encontrado','error'); return; }
  const refs = _countUserRefs(uid);
  const totalRefs = refs.campCreated+refs.campSubs+refs.campResp+refs.tasksCamp+refs.tasksGlobal;
  const others = allUsers.filter(u=>u.uid!==uid).sort((a,b)=>(a.name||'').localeCompare(b.name||''));
  const body = document.getElementById('deleteUserBody');
  body.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
      ${memberAvatarHtml(target, 44, '14px')}
      <div>
        <div style="font-weight:700;font-size:15px;">${_esc(target.name||target.email||'—')}</div>
        <div style="font-size:11px;color:var(--text-muted);">${_esc(target.email||'')}</div>
      </div>
    </div>
    <div style="background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:12px;font-size:12px;line-height:1.6;">
      <div style="font-weight:700;margin-bottom:4px;">Referencias actuales:</div>
      <div>• Campañas creadas: <b>${refs.campCreated}</b></div>
      <div>• Suscripciones: <b>${refs.campSubs}</b></div>
      <div>• Responsable de área: <b>${refs.campResp}</b></div>
      <div>• Tareas de campaña: <b>${refs.tasksCamp}</b></div>
      <div>• Tareas globales: <b>${refs.tasksGlobal}</b></div>
    </div>
    ${totalRefs > 0 ? `
      <label style="display:block;font-size:12px;font-weight:700;margin-bottom:6px;">Reasignar tareas y proyectos a:</label>
      <select id="deleteUserReassignSelect" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;background:var(--white);color:var(--text);">
        <option value="">— Dejar sin asignar —</option>
        ${others.map(o=>`<option value="${o.uid}">${_esc(o.name||o.email||'—')}${o.puesto?' · '+_esc(o.puesto):''}</option>`).join('')}
      </select>
      <div style="font-size:11px;color:var(--text-muted);margin-top:6px;">Todo lo etiquetado a esta persona pasará al usuario elegido. Si dejas sin asignar, se removerá la referencia.</div>
    ` : '<div style="font-size:12px;color:var(--text-muted);">Sin referencias — eliminación directa.</div>'}
    <div style="margin-top:12px;padding:8px 10px;background:#fff4f4;border:1px solid #f5c2c2;border-radius:8px;font-size:11px;color:#a13a3a;">
      <b>Atención:</b> esta acción borra el perfil del usuario y su membresía del workspace. Las credenciales de Firebase Auth deben revocarse por separado.
    </div>
  `;
  const btn = document.getElementById('deleteUserConfirmBtn');
  btn.onclick = () => {
    const sel = document.getElementById('deleteUserReassignSelect');
    const newUid = sel ? (sel.value||null) : null;
    confirmDeleteUser(uid, newUid);
  };
  openModal('deleteUserModal');
}

async function confirmDeleteUser(uid, newUid) {
  if(!isAdmin()) { showToast('Eliminar perfiles es cosa de admins. Pídeselo a alguien con ese rol.','error'); return; }
  if(uid === currentUser?.uid) { showToast('No puedes eliminar tu propio perfil. Pídele a otro admin que lo haga.','error'); return; }
  const btn = document.getElementById('deleteUserConfirmBtn');
  if(btn) { btn.disabled = true; btn.textContent = 'Eliminando…'; }
  try {
    // 1) Reassign campaign-level fields
    const campaigns = getData('campaigns');
    campaigns.forEach(c => {
      if(c.createdBy === uid) c.createdBy = newUid || null;
      // Sólo se borra el rastro: las suscripciones no se heredan. Seguir una
      // campaña es una preferencia de quien la sigue, no un pendiente que
      // alguien tenga que recoger — a diferencia de estar asignado o ser
      // responsable, que sí dejan trabajo sin dueño.
      if(Array.isArray(c.subscribers)) {
        c.subscribers = c.subscribers.filter(x => x !== uid);
      }
      if(c.responsables) {
        AREA_KEY_LIST.forEach(k => {
          const v = c.responsables[k];
          if(Array.isArray(v)) {
            const set = new Set(v.filter(x=>x!==uid));
            if(newUid) set.add(newUid);
            c.responsables[k] = [...set];
          } else if(v === uid) {
            c.responsables[k] = newUid || '';
          }
        });
      }
      (c.tasks||[]).forEach(t => {
        if(t.assigneeUid === uid) t.assigneeUid = newUid || '';
        if(t.reactions) {
          Object.keys(t.reactions).forEach(emo => {
            t.reactions[emo] = (t.reactions[emo]||[]).filter(x=>x!==uid);
          });
        }
      });
    });
    // Colección entera a propósito: quitar a alguien del equipo lo despega de
    // TODAS las campañas a la vez, así que aquí sí cambian varias.
    setData('campaigns', campaigns);

    // 2) Global tasks
    const gtasks = getData('globalTasks');
    gtasks.forEach(t => {
      if(t.assigneeUid === uid) t.assigneeUid = newUid || '';
      if(t.reactions) {
        Object.keys(t.reactions).forEach(emo => {
          t.reactions[emo] = (t.reactions[emo]||[]).filter(x=>x!==uid);
        });
      }
    });
    setData('globalTasks', gtasks);

    // 3) Delete workspace member + user doc
    const ws = db.collection('workspaces').doc(WORKSPACE);
    await Promise.all([
      ws.collection('members').doc(uid).delete().catch(()=>{}),
      db.collection('users').doc(uid).delete().catch(()=>{}),
    ]);

    allUsers = allUsers.filter(u=>u.uid!==uid);
    closeModal('deleteUserModal');
    showToast('Perfil eliminado'+(newUid?' y reasignado':''),'success');
    if(typeof renderTeam==='function') renderTeam();
    if(typeof renderCampaignGrid==='function') renderCampaignGrid();
    if(typeof renderDashboard==='function') renderDashboard();
  } catch(e) {
    avisarError(e, 'eliminar el perfil', 'confirmDeleteUser');
  } finally {
    if(btn) { btn.disabled = false; btn.textContent = 'Eliminar perfil'; }
  }
}

async function changePuesto(uid, newPuesto) {
  if(!isAdmin()) { showToast('Cambiar puestos es cosa de admins. Pídeselo a alguien con ese rol.','error'); return; }
  try {
    const ws = db.collection('workspaces').doc(WORKSPACE);
    await Promise.all([
      db.collection('users').doc(uid).update({puesto: newPuesto}),
      ws.collection('members').doc(uid).set({puesto: newPuesto}, {merge:true})
    ]);
    const u = allUsers.find(x=>x.uid===uid); if(u) u.puesto = newPuesto;
    showToast('Puesto actualizado','success');
    renderTeam();
  } catch(e) { avisarError(e, 'cambiar el puesto', 'changePuesto'); }
}
