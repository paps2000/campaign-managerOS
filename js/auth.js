/* Campaign OS — Arranque: listeners, login, sesión y permisos
   =============================================
   Entra por aquí todo lo que pasa una vez: los listeners globales del
   documento, el login con Google (sólo @thinkydigital.com), el arranque que
   monta el perfil y engancha Firestore, y las funciones de permiso
   (isAdmin, canSeeCosts, canSeeCampaign) con las suscripciones a campañas.

   OJO con los permisos: son de INTERFAZ. Quien abra la consola del navegador
   lee igual lo que las reglas de Firestore dejen leer — ver firestore.rules.
   Script CLÁSICO a propósito (NO type="module"): el HTML llama estas funciones
   desde atributos onclick/onchange, que sólo resuelven contra el scope global,
   y todos los archivos de js/ comparten ese mismo scope. El orden de <script>
   en index.html es el orden real de ejecución. */

// ============================================================
// EVENT LISTENERS
// ============================================================
document.querySelectorAll('.nav-item').forEach(item=>{
  item.addEventListener('click',()=>navigate(item.dataset.page));
  // Son <div role="link">, no <a>: el navegador no les da Enter gratis.
  item.addEventListener('keydown',e=>{
    if(e.key === 'Enter') { e.preventDefault(); navigate(item.dataset.page); }
  });
});

document.querySelectorAll('.detail-tab').forEach(tab=>{
  tab.addEventListener('click',()=>{
    document.querySelectorAll('.detail-tab').forEach(t=>t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t=>t.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-'+tab.dataset.tab).classList.add('active');
    try { localStorage.setItem('cmos:lastCampaignTab', tab.dataset.tab); } catch(e){}
    // If we land on tracker or escenario and rows were already fetched while
    // the tab was hidden, force a render so the user sees them.
    if(currentCampaignId) {
      const c = (_cache.campaigns||[]).find(x => x.id === currentCampaignId);
      if(!c) return;
      if(tab.dataset.tab === 'tracker' && c.trackerRows && c.trackerRows.length) {
        try { renderCampaignTracker(c); } catch(e){}
      } else if(tab.dataset.tab === 'influencers') {
        try { renderEscenarioBlock(c); } catch(e){}
      }
    }
  });
});

// Close modals on overlay click (vía closeModal para limpiar z-index/contador)
document.querySelectorAll('.modal-overlay').forEach(overlay=>{
  overlay.addEventListener('click',e=>{
    if(e.target===overlay) closeModal(overlay.id);
  });
});

// ============================================================
// AUTH
// ============================================================
async function loginGoogle() {
  const errEl = document.getElementById('loginError');
  try {
    // capture chosen area so onAuthStateChanged can seed it for new profiles
    // El login v3 ya no tiene selector de área (se captura en el onboarding).
    window._pendingArea = document.getElementById('loginAreaInput')?.value || '';
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({hd:'thinkydigital.com'});
    provider.addScope('https://www.googleapis.com/auth/calendar.readonly');
    provider.addScope('https://www.googleapis.com/auth/gmail.modify');
    const result = await auth.signInWithPopup(provider);
    if(!isAllowedEmail(result.user.email)) {
      await auth.signOut();
      errEl.textContent='Solo se permiten correos @thinkydigital.com';
      return;
    }
    // Store token with expiry for persistence
    if(result.credential && result.credential.accessToken) {
      calendarAccessToken = result.credential.accessToken;
      const expiry = Date.now() + 55 * 60 * 1000;
      localStorage.setItem('gcalToken', calendarAccessToken);
      localStorage.setItem('gcalTokenExpiry', expiry.toString());
    }
    // user profile is created/merged in onAuthStateChanged
  } catch(e) {
    errEl.textContent = traduceFirebaseError(e.code) || e.message;
  }
}

function traduceFirebaseError(code) {
  const map = {
    'auth/invalid-email':'Email inválido',
    'auth/user-not-found':'Usuario no existe',
    'auth/wrong-password':'Contraseña incorrecta',
    'auth/invalid-credential':'Credenciales inválidas',
    'auth/email-already-in-use':'Este email ya tiene cuenta',
    'auth/weak-password':'Contraseña muy débil (mínimo 6 caracteres)',
    'auth/popup-closed-by-user':'Cancelaste el login',
  };
  return map[code];
}

async function logout() {
  unsubscribers.forEach(u=>u()); unsubscribers=[];
  await auth.signOut();
  location.reload();
}

// ============================================================
// INIT
// ============================================================
auth.onAuthStateChanged(async (user) => {
  // Modo cliente (?client=TOKEN): vista pública de solo lectura — nunca
  // mostramos login ni inicializamos el app shell interno.
  if(new URLSearchParams(location.search).get('client')) return;
  if(!user) {
    document.getElementById('loginScreen').classList.remove('hidden');
    return;
  }
  // Domain enforcement
  if(!isAllowedEmail(user.email)) {
    await auth.signOut();
    document.getElementById('loginError').textContent = 'Solo se permiten correos @thinkydigital.com';
    document.getElementById('loginScreen').classList.remove('hidden');
    return;
  }
  currentUser = user;
  // Smooth fade-out of login + fade-in of app shell
  try { _playLoginToAppTransition(); } catch(e){}
  document.getElementById('loginScreen').classList.add('hidden');
  // Stop login screen timers / listeners now that it's hidden
  try { _stopLoginInteractions(); } catch(e){}

  // Get/create user profile with role
  const ws = db.collection('workspaces').doc(WORKSPACE);
  const userDocRef = db.collection('users').doc(user.uid);
  const userSnap = await userDocRef.get();
  if(!userSnap.exists) {
    currentUserProfile = {
      uid: user.uid,
      name: user.displayName || user.email.split('@')[0],
      email: user.email,
      role: INITIAL_ADMINS.includes(user.email.toLowerCase()) ? 'admin' : 'member',
      area: window._pendingArea || '',
      photoURL: user.photoURL || null,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    window._pendingArea = null;
    await userDocRef.set(currentUserProfile);
  } else {
    currentUserProfile = {uid: user.uid, ...userSnap.data()};
    // First user ever becomes admin if no admins exist
    if(currentUserProfile.role !== 'admin' && INITIAL_ADMINS.includes(user.email.toLowerCase())) {
      await userDocRef.update({role:'admin'});
      currentUserProfile.role = 'admin';
    }
  }
  // Mirror display profile into workspace/members so all workspace users can read it
  const memberRef = ws.collection('members').doc(user.uid);
  const memberProfile = {
    uid: currentUserProfile.uid,
    name: currentUserProfile.name,
    email: currentUserProfile.email,
    role: currentUserProfile.role,
    area: currentUserProfile.area || '',
    photoURL: currentUserProfile.photoURL || null,
    // Only write emoji/gradient if they exist — never overwrite with empty string
    ...(currentUserProfile.profileEmoji    ? { profileEmoji:    currentUserProfile.profileEmoji    } : {}),
    ...(currentUserProfile.profileGradient ? { profileGradient: currentUserProfile.profileGradient } : {}),
  };
  await memberRef.set(memberProfile, {merge:true});

  // Initial fetch (members from workspace — readable by all workspace members)
  const [campaignsSnap, tasksSnap, settingsDoc, membersSnap] = await Promise.all([
    ws.collection('campaigns').get(),
    ws.collection('globalTasks').get(),
    ws.collection('config').doc('settings').get(),
    ws.collection('members').get()
  ]);
  _cache.campaigns = campaignsSnap.docs.map(d => (typeof _normalizarCampana==='function' ? _normalizarCampana(d.data()) : d.data()));
  _cache.globalTasks = tasksSnap.docs.map(d=>d.data());
  _cache.settings = settingsDoc.exists ? settingsDoc.data() : {};
  // Los datos ya están aquí: nada de esqueletos de carga a partir de este
  // punto. El listener también lo pone, pero su primer snapshot puede llegar
  // después de que navigate() restaure la última página, y entonces la lista de
  // campañas se pintaba un instante como "cargando" teniendo los datos ya en
  // memoria. Ver renderCampaignGrid.
  _cache._initialized = true;
  allUsers = membersSnap.docs.map(d => ({uid:d.id, ...d.data()}));
  // Ensure current user is always in allUsers even if fetch missed them
  if(!allUsers.find(u=>u.uid===user.uid)) allUsers.push(memberProfile);

  // Render sidebar team strip early
  renderSidebarTeam();

  // Aquí vivía un seed de campañas de demostración (Mundial/Coppel, Hanna,
  // "PRESS MUNDIAL_v3.pdf"). Sólo podía dispararse en un workspace recién
  // creado y sin el doc config/seeded — o sea, nunca más en este proyecto, que
  // lleva datos reales desde hace tiempo. Lo que sí podía pasar es lo malo: que
  // alguien limpiara el workspace y se encontrara tres campañas inventadas
  // mezcladas con las suyas, sin forma de saber cuáles eran de verdad.
  // Un workspace vacío ahora se queda vacío, y los estados vacíos de la app ya
  // dicen qué hacer ("No hay campañas. ¡Crea la primera!").

  // Borra pendientes tachados con más de una semana antes de pintar
  try { _purgeOldDoneTasks(); } catch(e){ console.warn('purge done tasks failed', e); }

  // Una sola verdad para "sigo esta campaña" antes de pintar nada: si no, el
  // primer render usa la lista vieja y la credencial vuelve a mentir.
  try { await migrarSuscripciones(); } catch(e) { console.warn('migrar suscripciones', e); }

  // Los contactos que ya vivían dentro de las campañas entran a la base de
  // clientes. No bloquea el arranque: si tarda, la pestaña se llena sola en
  // cuanto el listener reciba lo escrito.
  try { if(typeof rellenarClientesDesdeCampanas === 'function') rellenarClientesDesdeCampanas(); }
  catch(e) { console.warn('rellenar clientes', e); }

  // Realtime listeners
  attachListeners();

  // Update UI with user info
  const displayName = currentUserProfile.name || user.email.split('@')[0];
  const shortPron = (typeof _shortPronouns==='function') ? _shortPronouns(currentUserProfile.pronouns) : '';
  const sidebarNameEl = document.getElementById('userNameSidebar');
  sidebarNameEl.textContent = displayName + (shortPron ? ' ' + shortPron : '');
  updateSidebarAvatar();
  loadTheme(currentUserProfile);
  // Las preferencias de vista del servidor mandan sobre lo que había guardado
  // en este navegador: cambiar de compu no debe resetear tu acomodo.
  if(typeof prefsHydrateFromProfile === 'function') prefsHydrateFromProfile(currentUserProfile);
  initNotifications();
  if(calendarAccessToken) { loadCalendarEvents(); loadGmailMessages(); }
  else { renderCalendarWidget(); renderGmailWidget(); }
  const roleBadge = document.getElementById('userRoleSidebar');
  if(roleBadge) roleBadge.textContent = currentUserProfile.puesto || (currentUserProfile.role === 'admin' ? 'Admin' : 'Miembro');

  // Date
  const now = new Date();
  document.getElementById('topbarDate').textContent = now.toLocaleDateString('es-MX',{weekday:'long',day:'numeric',month:'long',year:'numeric'});

  populateCampaignSelects();
  // Calendar y Gmail ya se pidieron doce líneas más arriba, junto a
  // initNotifications(). Repetirlo aquí eran dos fetches de más a Google y dos
  // repintados de los widgets en el mismo arranque.

  // Restore last page + campaign detail across reload
  let _navegado = false;   // ¿ya pintó navigate() una vista? (ver más abajo)
  try {
    // Si llegaste por un link con ruta (#/campannas/abc), esa manda sobre lo
    // último que viste: alguien te mandó el link justamente para llevarte ahí.
    const _porRuta = aplicarRuta();
    if(_porRuta) _navegado = true;
    const _ctab = localStorage.getItem('cmos:lastCampaignTab');
    if(_porRuta) {
      if(currentCampaignId && _ctab) {
        setTimeout(() => { try { _switchCampaignTab(_ctab); } catch(e){} }, 50);
      }
    } else {
    const lastPage = localStorage.getItem('cmos:lastPage');
    const lastCid  = localStorage.getItem('cmos:lastCampaignId');
    const lastCtab = localStorage.getItem('cmos:lastCampaignTab');
    // Misma lista que _PAGINAS_VALIDAS (core.js): si aquí falta una página,
    // recargar te devuelve al dashboard en vez de a donde estabas.
    const validPages = new Set(['dashboard','campannas','metricas','influencers','clientes',
      'documentos','calendario','generador','pendientes','equipo','ajustes','thinkypeso','effies']);
    const validTabs  = new Set(['resumen','influencers','tracker','pendientes','documentos','flujo']);
    if(lastPage && validPages.has(lastPage) && lastPage !== 'dashboard') {
      navigate(lastPage);
    }
    if(lastCid && (lastPage === 'campannas' || !lastPage)) {
      const c = (_cache.campaigns||[]).find(x => x.id === lastCid);
      if(c && (typeof canSeeCampaign !== 'function' || canSeeCampaign(c))) {
        // Si lastPage ya era 'campannas' acabamos de navegar ahí: repetirlo
        // reconstruye la rejilla entera para tirarla en el mismo tick.
        if(currentPage !== 'campannas') navigate('campannas');
        openCampaignDetail(lastCid);
        if(lastCtab && validTabs.has(lastCtab)) setTimeout(() => { try { _switchCampaignTab(lastCtab); } catch(e){} }, 50);
      } else {
        // Stale id (deleted / lost access) — clear so we don't loop next reload
        try { localStorage.removeItem('cmos:lastCampaignId'); localStorage.removeItem('cmos:lastCampaignTab'); } catch(e){}
      }
    }
    }
  } catch(e){ console.warn('restore last view failed', e); }
  /* El Resumen es la vista por defecto, pero pintarlo ANTES de restaurar la
     última vista significaba construirlo entero para tirarlo un tick después:
     al arrancar se veía aparecer el Resumen y saltar a otra página. Se pinta
     al final y sólo si de verdad nos quedamos en él y nadie lo pintó ya:
     navigate() pinta la página a la que lleva, y una ruta #/dashboard entra
     justamente por ahí. */
  if(currentPage === 'dashboard' && !_navegado) renderDashboard();
  // La primera vista no debe dejar una entrada de historial anterior a ella:
  // con pushState, el primer Atrás no haría nada visible.
  try { escribirRuta(true); } catch(e){}

  // Onboarding en el primer login: completar perfil + elegir campañas a seguir
  if(!currentUserProfile.onboardingDone) {
    try { startOnboarding(); } catch(e){ console.warn('onboarding failed', e); }
  }
});

function isAdmin() { return currentUserProfile && currentUserProfile.role === 'admin'; }
function canSeeCosts() {
  if(isAdmin()) return true;
  return currentUserProfile && COST_ACCESS_PUESTOS.has(currentUserProfile.puesto);
}
// Operaciones gate — controls access to private creator info
// (phone / agency / contact email / ops notes).
function isOperaciones() {
  if(!currentUserProfile) return false;
  const a = String(currentUserProfile.area||'').toLowerCase();
  return a === 'operaciones' || a.includes('operaciones');
}
function canSeeCreatorPrivateInfo() {
  return isAdmin() || isOperaciones();
}
/* Seguir una campaña es una PREFERENCIA, no un permiso. Antes esta función
   devolvía true para cualquier admin, mezclando las dos cosas: como los admins
   ven todo, se daba por hecho que también seguían todo. El efecto era que un
   admin no podía dejar de seguir nada — el botón ni se dibujaba — y su
   credencial arrastraba para siempre lo que hubiera elegido en el onboarding.
   Quién PUEDE VER una campaña lo sigue decidiendo canSeeCampaign(), que abajo
   corta por isAdmin() antes de llegar acá. */
function isSubscribed(cid) {
  return (currentUserProfile?.subscribedCampaigns || []).includes(cid);
}
function canSeeCampaign(c) {
  if(!c) return false;
  if(isAdmin()) return true;
  if(c.createdBy === currentUser.uid) return true;
  // Ser responsable de un área es el vínculo MÁS fuerte que hay con una
  // campaña, y era el único que no daba acceso: se podía ser responsable de
  // Creativo en una campaña y no verla en la lista, ni abrirla desde el aviso
  // que anunciaba justamente que te habían puesto ahí.
  if(esResponsableDe(c, currentUser.uid)) return true;
  if(isSubscribed(c.id)) return true;
  return false;
}
/* Seguir / dejar de seguir. Es el ÚNICO camino: la campanita del detalle
   también entra por aquí.

   Antes había dos sistemas que no se hablaban. Este escribía
   `users/{uid}.subscribedCampaigns`; la campanita escribía
   `campaign.subscribers`. Ninguno limpiaba al otro, así que seguir por un lado
   y dejar de seguir por el otro dejaba la campaña colgada — y como la
   credencial sumaba los dos con un OR, ahí se quedaba a la vista.

   Se escribe en `users` (que es la copia autoritativa: las reglas sólo dejan
   escribirla a su dueño) y se refleja en `members`, que es de donde sale
   `allUsers` y por lo tanto lo que ven el Equipo y las credenciales de los
   demás. Mismo patrón que ya usan área, rol y puesto.

   De paso se borra el rastro en `campaign.subscribers`: mientras queden datos
   viejos ahí, hay dos verdades. */
async function toggleSubscribeCampaign(cid, e) {
  if(e && e.stopPropagation) e.stopPropagation();
  if(!currentUser || !currentUserProfile) return;
  const subs = currentUserProfile.subscribedCampaigns || [];
  const yaSeguia = subs.includes(cid);
  const newSubs = yaSeguia ? subs.filter(x=>x!==cid) : [...subs, cid];
  currentUserProfile.subscribedCampaigns = newSubs;

  // Que la lista en memoria del equipo también lo sepa, sin esperar al listener.
  const yo = allUsers.find(u => u.uid === currentUser.uid);
  if(yo) yo.subscribedCampaigns = newSubs;

  try {
    const ws = db.collection('workspaces').doc(WORKSPACE);
    await Promise.all([
      db.collection('users').doc(currentUser.uid).set({subscribedCampaigns: newSubs}, {merge:true}),
      ws.collection('members').doc(currentUser.uid).set({subscribedCampaigns: newSubs}, {merge:true}),
    ]);
    await _limpiarSubscriberViejo(cid);
  } catch(err) {
    // Se revierte lo local: dejar la pantalla diciendo que sigues algo que el
    // servidor no registró es peor que no haber hecho nada.
    currentUserProfile.subscribedCampaigns = subs;
    if(yo) yo.subscribedCampaigns = subs;
    if(typeof avisarError === 'function') avisarError(err, 'cambiar la suscripción', 'toggleSubscribeCampaign');
    else showToast('No se pudo cambiar la suscripción', 'error');
    renderCampaignGrid();
    return;
  }

  renderCampaignGrid();
  if(currentPage==='dashboard') renderDashboard();
  if(currentCampaignId === cid && typeof openCampaignDetail === 'function') openCampaignDetail(cid);
  try { if(typeof refreshHoloCamps === 'function') refreshHoloCamps(); } catch(err){}
  try { if(typeof refreshHoloStickers === 'function') refreshHoloStickers(); } catch(err){}
  showToast(yaSeguia ? 'Dejaste de seguir esta campaña' : 'Ahora sigues esta campaña', 'success');
}

/* Migración de una sola vez, por persona.
   Hasta ahora seguir una campaña se guardaba en `campaign.subscribers`, y esa
   lista es la única que alimentaba la tira de la credencial: `members` —de
   donde sale allUsers— nunca llegó a tener `subscribedCampaigns`, así que la
   otra rama estaba muerta.

   Al entrar se hace lo mínimo para dejar una sola verdad:
     · lo que la campaña dice que sigo se suma a mi perfil,
     · mi perfil se refleja en `members`, que es lo que ven los demás,
     · y mi rastro se borra de las campañas.

   Es idempotente y silenciosa: si no hay nada que mover, no escribe nada.
   Cada quien migra lo suyo, que es además lo único que las reglas le dejan
   escribir de `users`. */
async function migrarSuscripciones() {
  if(!currentUser || !currentUserProfile) return;
  const uid = currentUser.uid;
  const actuales = Array.isArray(currentUserProfile.subscribedCampaigns)
    ? currentUserProfile.subscribedCampaigns : [];

  const campaigns = getData('campaigns') || [];
  // Dos herencias: la lista vieja de suscriptores dentro de la campaña, y
  // Participantes, que se retira. A quien era participante se le convierte en
  // seguidor para que NO pierda el acceso a una campaña en curso; sigue siendo
  // suyo dejar de seguirla cuando quiera.
  const heredadas = campaigns
    .filter(c => (Array.isArray(c.subscribers) && c.subscribers.includes(uid)) ||
                 (Array.isArray(c.assignedTo)  && c.assignedTo.includes(uid)))
    .map(c => c.id);

  const yo = (allUsers || []).find(u => u.uid === uid);
  const faltaEspejo = !yo || !Array.isArray(yo.subscribedCampaigns);

  if(!heredadas.length && !faltaEspejo) return;

  const unidas = [...new Set([...actuales, ...heredadas])];
  currentUserProfile.subscribedCampaigns = unidas;
  if(yo) yo.subscribedCampaigns = unidas;

  try {
    const ws = db.collection('workspaces').doc(WORKSPACE);
    await Promise.all([
      db.collection('users').doc(uid).set({subscribedCampaigns: unidas}, {merge:true}),
      ws.collection('members').doc(uid).set({subscribedCampaigns: unidas}, {merge:true}),
    ]);
    // Sólo ahora se borra el rastro: si lo de arriba falla, la lista vieja
    // sigue siendo la única copia y no hay que perderla.
    for(const cid of heredadas) {
      try { await _limpiarSubscriberViejo(cid); } catch(e) { console.warn('migrar suscripción', cid, e); }
    }
  } catch(e) {
    currentUserProfile.subscribedCampaigns = actuales;
    if(yo) yo.subscribedCampaigns = actuales;
    console.warn('migrarSuscripciones', e);
  }
}

/* El sistema viejo guardaba la suscripción dentro de la campaña. Se saca de ahí
   en cuanto se toca la campaña, para que no queden dos listas discrepando.
   Silencioso a propósito: es limpieza, no una acción que la persona pidió. */
async function _limpiarSubscriberViejo(cid) {
  const campaigns = getData('campaigns');
  const c = campaigns.find(x => x.id === cid);
  if(!c || !Array.isArray(c.subscribers) || !c.subscribers.includes(currentUser.uid)) return;
  c.subscribers = c.subscribers.filter(x => x !== currentUser.uid);
  setDataLocal('campaigns', campaigns);
  try {
    await db.collection('workspaces').doc(WORKSPACE).collection('campaigns').doc(String(cid))
      .set({ subscribers: c.subscribers }, { merge:true });
  } catch(err) { console.warn('limpiar subscribers', err); }
}
