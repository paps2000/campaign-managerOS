/* Campaign OS — ThinkyPeso: moneda interna de reconocimiento.
   Script CLÁSICO (NO type="module"): el HTML llama tpBump(), tpSend(), etc.
   desde atributos onclick/oninput, que solo resuelven contra el scope global.

   REGLA DEL JUEGO
   ---------------
   · Cada persona registrada recibe 10 ThinkyPesos al mes.
   · Solo se pueden repartir durante la ÚLTIMA SEMANA del mes (los últimos 7
     días naturales, de las 00:00 del primero de esos días a las 23:59:59.999
     del último día del mes).
   · Lo que no se reparte no se acumula: al cerrar la ventana se pierde.
   · Ninguna moneda viaja sin motivo escrito.

   POR QUÉ NO HAY CRON
   -------------------
   El "abono automático" de los 10 pesos no se escribe en ningún lado: se
   DERIVA del periodo. El saldo es siempre `10 − (lo que mandé este periodo)`,
   así que el abono ocurre solo por el paso del calendario, sin job, sin
   backend y sin riesgo de doble abono o de un mes que se salte porque nadie
   abrió la app. Cambiar de mes basta para que todos amanezcan con 10.

   EL TOPE DE 10 LO COBRA EL SERVIDOR
   ----------------------------------
   Una regla de Firestore no puede contar documentos, así que el tope no se
   verifica contando entregas: se cobra contra un contador con techo, el doc
   `thinkyPesoBalances/{uid}_{periodo}`, que la regla acota a 0–10 y que TIENE
   que moverse en el mismo commit que la entrega. Por eso cada entrega se
   commitea por separado y no en un lote. Detalle en THINKYPESO.md. */

(function(){
'use strict';

const GRANT = 10;            // pesos por persona por mes
const WINDOW_DAYS = 7;       // últimos N días naturales del mes
const REASON_MIN = 12;       // caracteres mínimos del motivo
const REASON_MAX = 280;

const MONTHS = ['enero','febrero','marzo','abril','mayo','junio','julio',
                'agosto','septiembre','octubre','noviembre','diciembre'];

let _draft = {};             // { uid: {amount, reason} } — borrador sin enviar
let _query = '';             // filtro del buscador
let _confirming = false;     // el pie del panel está pidiendo confirmación
let _tick = null;            // interval del contador
let _ledgerTab = 'recibidos';

function esc(s){
  if(s == null) return '';
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function _pad(x){ return String(x).padStart(2,'0'); }

// ============================================================
// CALENDARIO — periodo y ventana
// ============================================================

// 'YYYY-MM' del mes de la fecha dada. Es la llave de todo: saldo, ranking e
// historial se cortan por aquí.
function periodOf(d){ return d.getFullYear() + '-' + _pad(d.getMonth()+1); }
function currentPeriod(){ return periodOf(new Date()); }

function periodLabel(p){
  const [y,m] = String(p||'').split('-');
  const i = parseInt(m,10) - 1;
  return (MONTHS[i] ? MONTHS[i][0].toUpperCase()+MONTHS[i].slice(1) : m) + ' ' + y;
}

// Ventana de reparto del mes al que pertenece `ref`.
function windowOf(ref){
  const d = ref || new Date();
  const last = new Date(d.getFullYear(), d.getMonth()+1, 0); // día 0 del mes siguiente = último de este
  const start = new Date(d.getFullYear(), d.getMonth(), last.getDate() - (WINDOW_DAYS-1), 0,0,0,0);
  const end   = new Date(d.getFullYear(), d.getMonth(), last.getDate(), 23,59,59,999);
  return {start, end};
}

// Estado del reparto AHORA. Si la ventana no está abierta, `next` apunta al
// arranque de la siguiente (este mes si aún no llega, el que viene si ya pasó).
function windowState(){
  const now = new Date();
  const w = windowOf(now);
  if(now >= w.start && now <= w.end) return {open:true, start:w.start, end:w.end, next:null};
  const nx = now < w.start ? w : windowOf(new Date(now.getFullYear(), now.getMonth()+1, 1));
  return {open:false, start:w.start, end:w.end, next:nx.start};
}

function fmtDay(d){ return d.getDate() + ' de ' + MONTHS[d.getMonth()]; }

// "2 días 04:15:30" — el contador que le dice a la gente cuánto le queda.
function fmtLeft(ms){
  if(ms < 0) ms = 0;
  const s = Math.floor(ms/1000);
  const d = Math.floor(s/86400), h = Math.floor((s%86400)/3600),
        m = Math.floor((s%3600)/60), sec = s%60;
  const clock = _pad(h)+':'+_pad(m)+':'+_pad(sec);
  if(d > 0) return d + (d===1?' día ':' días ') + clock;
  return clock;
}

// ============================================================
// DATOS
// ============================================================

function _txs(){ return (typeof _cache!=='undefined' && Array.isArray(_cache.thinkyPesos)) ? _cache.thinkyPesos : []; }
function _period(p){ return _txs().filter(t => t.period === p); }
function _me(){ return (typeof currentUser!=='undefined' && currentUser) ? currentUser.uid : null; }

// Todo el que puede recibir: los miembros del workspace, sin mí.
function _members(){
  const list = (typeof allUsers!=='undefined' && Array.isArray(allUsers)) ? allUsers : [];
  return list.filter(u => u.uid && u.uid !== _me());
}

function sentThisPeriod(uid, p){
  return _period(p || currentPeriod())
    .filter(t => t.fromUid === uid)
    .reduce((a,t) => a + (parseInt(t.amount)||0), 0);
}

function myBalance(){
  const me = _me();
  if(!me) return 0;
  return Math.max(0, GRANT - sentThisPeriod(me));
}

function draftTotal(){
  return Object.values(_draft).reduce((a,d) => a + (d.amount||0), 0);
}
function draftPeople(){
  return Object.values(_draft).filter(d => d.amount > 0).length;
}
function freeNow(){ return myBalance() - draftTotal(); }

// Recibido por persona en un periodo → para el ranking.
function receivedMap(p){
  const map = new Map();
  _period(p).forEach(t => map.set(t.toUid, (map.get(t.toUid)||0) + (parseInt(t.amount)||0)));
  return map;
}

function userOf(uid){
  const list = (typeof allUsers!=='undefined' && Array.isArray(allUsers)) ? allUsers : [];
  return list.find(u => u.uid === uid) || null;
}
function nameOf(uid, fallback){
  const u = userOf(uid);
  return (u && (u.name || u.email)) || fallback || 'Alguien';
}
function avatar(uid, size){
  const u = userOf(uid);
  if(u && typeof memberAvatarHtml === 'function') return memberAvatarHtml(u, size||28, '50%');
  const letter = esc((nameOf(uid)||'?')[0].toUpperCase());
  return `<span class="tp-av-fallback" style="width:${size||28}px;height:${size||28}px;">${letter}</span>`;
}

// Periodos con movimientos, del más nuevo al más viejo.
function periodsWithData(){
  return [...new Set(_txs().map(t => t.period))].filter(Boolean).sort().reverse();
}

// ============================================================
// BORRADOR
// ============================================================

function _d(uid){
  if(!_draft[uid]) _draft[uid] = {amount:0, reason:''};
  return _draft[uid];
}

window.tpBump = function(uid, delta){
  const d = _d(uid);
  const next = d.amount + delta;
  if(next < 0) return;
  if(delta > 0 && freeNow() <= 0){
    showToast('Ya repartiste tus ' + GRANT + ' ThinkyPesos de este mes', 'warning');
    return;
  }
  d.amount = Math.min(next, d.amount + Math.max(0, freeNow()));
  _confirming = false;
  renderAssign();
};

window.tpSetAmount = function(uid, val){
  const d = _d(uid);
  let n = parseInt(val, 10);
  if(isNaN(n) || n < 0) n = 0;
  const cap = d.amount + Math.max(0, freeNow());
  d.amount = Math.min(n, cap);
  _confirming = false;
  renderAssign();
};

// El motivo NO re-renderiza: escribir y perder el cursor en cada tecla sería
// insufrimible. Solo se refresca el contador y el estado del botón.
window.tpReason = function(uid, val){
  _d(uid).reason = String(val||'').slice(0, REASON_MAX);
  const c = document.getElementById('tpRc-'+uid);
  if(c){
    const len = _d(uid).reason.trim().length;
    c.textContent = len < REASON_MIN ? (REASON_MIN - len) + ' caracteres más' : len + '/' + REASON_MAX;
    c.classList.toggle('tp-rc-warn', len > 0 && len < REASON_MIN);
  }
  _confirming = false;
  renderFooter();
};

window.tpSearch = function(v){
  _query = String(v||'').trim().toLowerCase();
  renderMembers();
};

window.tpClearDraft = function(){
  _draft = {};
  _confirming = false;
  renderAssign();
};

// Lo que impide mandar. Devuelve null si todo está en orden.
function draftBlocker(){
  const st = windowState();
  if(!st.open) return 'La ventana de reparto está cerrada.';
  if(draftTotal() <= 0) return 'Asigna al menos 1 ThinkyPeso.';
  if(draftTotal() > myBalance()) return 'Estás repartiendo más de lo que tienes.';
  const sinMotivo = Object.entries(_draft)
    .filter(([,d]) => d.amount > 0 && d.reason.trim().length < REASON_MIN)
    .map(([uid]) => nameOf(uid));
  if(sinMotivo.length) return 'Falta el motivo de ' + sinMotivo.join(', ') + '.';
  return null;
}

// ============================================================
// ENVÍO
// ============================================================

window.tpAskSend = function(){
  const blocker = draftBlocker();
  if(blocker){ showToast(blocker, 'warning'); return; }
  _confirming = true;
  renderFooter();
};

window.tpCancelSend = function(){
  _confirming = false;
  renderFooter();
};

// El saldo del mes como documento. Existe para que la REGLA de Firestore pueda
// hacer cumplir el tope de 10: contar entregas no se puede desde una regla, así
// que el tope se cobra contra este contador, que tiene techo de 10 y que ningún
// commit de entrega puede dejar quieto. Ver firestore.rules y THINKYPESO.md.
function _balRef(){
  return db.collection('workspaces').doc(WORKSPACE)
           .collection('thinkyPesoBalances').doc(_me() + '_' + currentPeriod());
}
function _txCol(){
  return db.collection('workspaces').doc(WORKSPACE).collection('thinkyPesos');
}

window.tpSend = async function(){
  const blocker = draftBlocker();
  if(blocker){ showToast(blocker, 'warning'); _confirming = false; renderFooter(); return; }
  const me = _me();
  if(!me){ showToast('Inicia sesión para repartir', 'warning'); return; }

  const btn = document.getElementById('tpSendBtn');
  if(btn){ btn.disabled = true; btn.textContent = 'Enviando…'; }
  const reactivar = () => { const b = document.getElementById('tpSendBtn'); if(b){ b.disabled = false; b.textContent = 'Sí, entregar'; } };

  const p = currentPeriod();
  const now = Date.now();
  const entries = Object.entries(_draft).filter(([,d]) => d.amount > 0);
  const fromName = (typeof currentUserProfile!=='undefined' && currentUserProfile)
    ? (currentUserProfile.name || currentUserProfile.email) : (currentUser.email || '');

  const col = _txCol();
  const balRef = _balRef();

  // El contador del servidor manda. La regla compara contra LO QUE HAY ALLÁ,
  // no contra lo que la UI dedujo de la lista de entregas.
  let spent;
  try {
    const snap = await balRef.get();
    spent = snap.exists ? (parseInt(snap.data().spent) || 0) : 0;
  } catch(err){
    console.error('tpSend saldo', err);
    showToast('No se pudo leer tu saldo. Intenta otra vez.', 'error');
    reactivar();
    return;
  }
  // Puede haber entregas de este mes anteriores al contador (el mes en que se
  // estrenó). Se toma la cuenta más alta para no regalar saldo de más.
  spent = Math.max(spent, sentThisPeriod(me, p));

  // Cada entrega va en su PROPIO commit. La regla verifica que el contador suba
  // exactamente lo que vale la entrega que viene en ese commit; un lote con
  // varias no se puede verificar documento por documento.
  let hechas = 0, dados = 0, personas = 0;
  let fallo = null;
  for(const [uid, d] of entries){
    if(spent + d.amount > GRANT){ fallo = new Error('Te pasarías de tus ' + GRANT + ' ThinkyPesos del mes.'); break; }
    const tid = (typeof id === 'function' ? id() : String(now) + '-' + hechas);
    try {
      const batch = db.batch();
      batch.set(col.doc(tid), {
        id: tid,
        period: p,
        fromUid: me,
        fromName: fromName,
        toUid: uid,
        toName: nameOf(uid),
        amount: d.amount,
        reason: d.reason.trim(),
        createdAt: now + hechas     // +hechas mantiene el orden dentro del mismo envío
      });
      // Sin merge: el overwrite limpia el `undoTx` de una devolución anterior,
      // que si no se quedaría autorizando el borrado de esa entrega.
      batch.set(balRef, { uid: me, period: p, spent: spent + d.amount, undoTx: '' });
      await batch.commit();
    } catch(err){
      console.error('tpSend', err);
      fallo = err;
      break;
    }
    spent += d.amount;
    dados += d.amount;
    personas++;
    hechas++;
    delete _draft[uid];   // lo ya entregado sale del borrador aunque lo demás falle
  }

  _confirming = false;

  if(dados > 0){
    showToast('🎉 ' + dados + (dados===1?' ThinkyPeso entregado':' ThinkyPesos entregados') +
              ' a ' + personas + (personas===1?' persona':' personas'), 'success');
    tpCelebrate();
  }
  if(fallo){
    // Se dice qué SÍ salió: callarlo haría que la gente reintentara el envío
    // completo y duplicara lo que ya se entregó.
    showToast(dados > 0
      ? 'Lo demás no se pudo entregar y se quedó en el borrador.'
      : 'No se pudo entregar. Revisa tu conexión e intenta otra vez.', 'error');
    reactivar();
  }
  renderThinkyPeso();
};

// Devolver un envío propio mientras la ventana siga abierta: el peso regresa
// al saldo. Cerrada la ventana ya no se toca — el mes quedó como quedó.
// El borrado y la baja del contador van en el MISMO commit: la regla no deja
// borrar una entrega si el saldo del commit no la nombra en `undoTx`.
window.tpUndo = async function(txId){
  const tx = _txs().find(t => t.id === txId);
  if(!tx) return;
  if(tx.fromUid !== _me()) return;
  const st = windowState();
  if(!st.open || tx.period !== currentPeriod()){
    showToast('Ese mes ya cerró: los ThinkyPesos entregados no se devuelven', 'warning');
    return;
  }
  const amount = parseInt(tx.amount) || 0;
  try {
    const balRef = _balRef();
    const snap = await balRef.get();
    const before = snap.exists ? (parseInt(snap.data().spent) || 0) : 0;
    const batch = db.batch();
    batch.delete(_txCol().doc(txId));
    batch.set(balRef, {
      uid: _me(), period: currentPeriod(),
      spent: Math.max(0, before - amount),
      undoTx: txId,
    });
    await batch.commit();
    showToast('Devolvimos ' + amount + (amount===1?' ThinkyPeso':' ThinkyPesos') + ' a tu saldo', 'success');
  } catch(err){
    console.error('tpUndo', err);
    showToast('No se pudo deshacer. Intenta otra vez.', 'error');
  }
};

window.tpLedgerTab = function(tab){
  _ledgerTab = tab;
  renderLedger();
};

window.tpHistoryPeriod = function(p){
  const host = document.getElementById('tpRanking');
  if(host) host.dataset.period = p;
  renderRanking();
};

// ============================================================
// RENDER — cabecera
// ============================================================

function renderHero(){
  const st = windowState();
  const bal = myBalance();
  const given = GRANT - bal;
  const p = currentPeriod();

  // Con la ventana cerrada el número grande es la MESADA que viene, no el
  // sobrante: lo que no repartiste ya se perdió, y anunciarlo como saldo
  // haría creer que se acumula.
  const num = document.getElementById('tpHeroBalance');
  if(num) num.textContent = st.open ? bal : GRANT;

  const lead = document.getElementById('tpHeroLead');
  if(lead){
    if(!st.open) lead.textContent = 'ThinkyPesos te esperan el ' + fmtDay(st.next);
    else if(bal === 0) lead.textContent = 'Repartiste todo. Bien ahí.';
    else lead.textContent = bal === 1 ? 'Te queda 1 ThinkyPeso por repartir' : 'Te quedan ' + bal + ' ThinkyPesos por repartir';
  }

  const sub = document.getElementById('tpHeroSub');
  if(sub){
    sub.textContent = st.open
      ? 'La ventana cierra el ' + fmtDay(st.end) + ' a medianoche. Lo que no repartas se pierde.'
      : 'El reparto abre el ' + fmtDay(st.next) + '. Ese día todos amanecen con ' + GRANT + '.';
  }

  const chip = document.getElementById('tpHeroChip');
  if(chip){
    chip.className = 'tp-chip ' + (st.open ? 'tp-chip-open' : 'tp-chip-shut');
    chip.textContent = st.open ? 'Reparto abierto' : 'Reparto cerrado';
  }

  const greet = document.getElementById('tpHeroGreet');
  if(greet){
    const first = (nameOf(_me(), '') || '').split(' ')[0];
    greet.textContent = first ? '· Hola, ' + first + ' 👋' : '';
  }

  const cd = document.getElementById('tpCountdown');
  if(cd){
    const target = st.open ? st.end.getTime() : st.next.getTime();
    cd.textContent = fmtLeft(target - Date.now());
  }
  const cdl = document.getElementById('tpCountdownLabel');
  if(cdl) cdl.textContent = st.open ? 'para que cierre' : 'para que abra';

  const bar = document.getElementById('tpHeroBar');
  if(bar) bar.style.width = Math.round((given/GRANT)*100) + '%';
  const barTxt = document.getElementById('tpHeroBarTxt');
  if(barTxt) barTxt.textContent = given + ' de ' + GRANT + ' repartidos en ' + periodLabel(p);

  const gotMap = receivedMap(p);
  const got = gotMap.get(_me()) || 0;
  const gotEl = document.getElementById('tpHeroGot');
  if(gotEl) gotEl.textContent = got;
}

// ============================================================
// RENDER — panel de reparto
// ============================================================

function renderMembers(){
  const host = document.getElementById('tpMembers');
  if(!host) return;
  const st = windowState();
  const p = currentPeriod();
  const got = receivedMap(p);

  let people = _members();
  if(_query){
    people = people.filter(u =>
      String(u.name||'').toLowerCase().includes(_query) ||
      String(u.email||'').toLowerCase().includes(_query) ||
      String(u.puesto||'').toLowerCase().includes(_query) ||
      String(u.area||'').toLowerCase().includes(_query));
  }
  // Primero quien ya tiene pesos asignados en el borrador: no se pierde de
  // vista lo que llevas armado cuando la lista es larga.
  people.sort((a,b) => {
    const da = (_draft[a.uid]?.amount||0), dbb = (_draft[b.uid]?.amount||0);
    if(da !== dbb) return dbb - da;
    return String(a.name||a.email||'').localeCompare(String(b.name||b.email||''));
  });

  if(!people.length){
    host.innerHTML = _query
      ? `<div class="tp-empty"><div class="tp-empty-t">Nadie con ese nombre</div><div class="tp-empty-s">Prueba con el correo o el puesto.</div></div>`
      : `<div class="tp-empty"><div class="tp-empty-t">Todavía no hay a quién darle</div><div class="tp-empty-s">Cuando el equipo se registre aparece aquí.</div></div>`;
    return;
  }

  host.innerHTML = people.map(u => {
    const d = _draft[u.uid] || {amount:0, reason:''};
    const on = d.amount > 0;
    const len = d.reason.trim().length;
    const recibio = got.get(u.uid) || 0;
    const sub = [u.puesto, u.area].filter(Boolean).join(' · ');
    return `
    <div class="tp-row ${on?'tp-row-on':''}" data-uid="${esc(u.uid)}">
      <div class="tp-row-head">
        <span class="tp-row-av">${avatar(u.uid, 34)}</span>
        <div class="tp-row-id">
          <div class="tp-row-name">${esc(u.name || u.email)}</div>
          <div class="tp-row-sub">${esc(sub) || esc(u.email||'')}</div>
        </div>
        ${recibio ? `<span class="tp-row-got" title="Lo que lleva recibido este mes">🪙 ${recibio}</span>` : ''}
        <div class="tp-stepper ${st.open?'':'tp-stepper-off'}">
          <button type="button" class="tp-step" onclick="tpBump('${esc(u.uid)}',-1)" ${!st.open||d.amount<=0?'disabled':''} aria-label="Quitar un ThinkyPeso a ${esc(u.name||u.email)}">−</button>
          <input class="tp-amt" inputmode="numeric" value="${d.amount}" ${st.open?'':'disabled'}
                 onchange="tpSetAmount('${esc(u.uid)}',this.value)" aria-label="ThinkyPesos para ${esc(u.name||u.email)}">
          <button type="button" class="tp-step" onclick="tpBump('${esc(u.uid)}',1)" ${!st.open||freeNow()<=0?'disabled':''} aria-label="Dar un ThinkyPeso a ${esc(u.name||u.email)}">+</button>
        </div>
      </div>
      ${on ? `
      <div class="tp-why">
        <label class="tp-why-lab" for="tpR-${esc(u.uid)}">¿Por qué ${esc((u.name||u.email||'').split(' ')[0])}?</label>
        <textarea id="tpR-${esc(u.uid)}" class="tp-why-input" rows="2" maxlength="${REASON_MAX}"
          placeholder="Se quedó a cerrar el reporte de Coppel conmigo un viernes a las 9."
          oninput="tpReason('${esc(u.uid)}',this.value)">${esc(d.reason)}</textarea>
        <div class="tp-why-foot">
          <span class="tp-why-hint">Sin motivo no se entrega. Sé específico: se lo van a leer.</span>
          <span class="tp-rc ${len>0&&len<REASON_MIN?'tp-rc-warn':''}" id="tpRc-${esc(u.uid)}">${len < REASON_MIN ? (REASON_MIN-len)+' caracteres más' : len+'/'+REASON_MAX}</span>
        </div>
      </div>` : ''}
    </div>`;
  }).join('');
}

function renderFooter(){
  const foot = document.getElementById('tpFooter');
  if(!foot) return;
  const st = windowState();
  const total = draftTotal(), people = draftPeople();

  if(!st.open){
    foot.innerHTML = `
      <div class="tp-foot-shut">
        <span class="tp-foot-shut-t">El reparto abre el ${fmtDay(st.next)}</span>
        <span class="tp-foot-shut-s">Te vamos a dar ${GRANT} ThinkyPesos y una semana para repartirlos.</span>
      </div>`;
    return;
  }

  if(_confirming){
    foot.innerHTML = `
      <div class="tp-confirm">
        <div class="tp-confirm-txt">
          <strong>¿Entregar ${total} ${total===1?'ThinkyPeso':'ThinkyPesos'} a ${people} ${people===1?'persona':'personas'}?</strong>
          <span>Van a ver tu nombre y tu motivo. Puedes deshacerlo mientras la ventana siga abierta.</span>
        </div>
        <div class="tp-confirm-btns">
          <button type="button" class="tp-btn-ghost" onclick="tpCancelSend()">Volver</button>
          <button type="button" class="tp-btn-go" id="tpSendBtn" onclick="tpSend()">Sí, entregar</button>
        </div>
      </div>`;
    return;
  }

  const blocker = draftBlocker();
  const free = freeNow();
  foot.innerHTML = `
    <div class="tp-foot-state">
      <span class="tp-foot-num">${total}</span>
      <div class="tp-foot-copy">
        <span class="tp-foot-t">${total===0 ? 'Nada asignado todavía' : 'Listos para entregar a ' + people + (people===1?' persona':' personas')}</span>
        <span class="tp-foot-s">${free === 0 ? 'Ya asignaste todo tu saldo' : 'Te sobran ' + free + ' sin asignar'}</span>
      </div>
    </div>
    <div class="tp-foot-btns">
      ${total>0?`<button type="button" class="tp-btn-ghost" onclick="tpClearDraft()">Empezar de nuevo</button>`:''}
      <button type="button" class="tp-btn-go" onclick="tpAskSend()" ${blocker?'disabled':''} title="${esc(blocker||'')}">
        ${total>0 ? 'Entregar ' + total + (total===1?' ThinkyPeso':' ThinkyPesos') : 'Entregar ThinkyPesos'}
      </button>
    </div>`;
}

function renderAssign(){
  renderHero();
  renderMembers();
  renderFooter();
}

// ============================================================
// RENDER — movimientos y ranking
// ============================================================

function txCard(t, mode){
  const st = windowState();
  const mine = t.fromUid === _me();
  const canUndo = mine && st.open && t.period === currentPeriod();
  // En "recibidos" y "enviados" el otro lado siempre soy yo: repetir mi nombre
  // en cada renglón no dice nada. Solo el feed del equipo necesita los dos.
  const who = mode === 'enviados' ? t.toUid : t.fromUid;
  const label = mode === 'recibidos' ? 'de ' + esc(nameOf(t.fromUid, t.fromName))
              : mode === 'enviados'  ? 'a ' + esc(nameOf(t.toUid, t.toName))
              : esc(nameOf(t.fromUid, t.fromName)) + ' → ' + esc(nameOf(t.toUid, t.toName));
  return `
    <div class="tp-tx">
      <span class="tp-tx-av">${avatar(who, 30)}</span>
      <div class="tp-tx-body">
        <div class="tp-tx-top">
          <span class="tp-tx-who">${label}</span>
          <span class="tp-tx-amt">🪙 ${parseInt(t.amount)||0}</span>
        </div>
        <div class="tp-tx-why">${esc(t.reason)}</div>
        ${canUndo ? `<button type="button" class="tp-tx-undo" onclick="tpUndo('${esc(t.id)}')">Deshacer</button>` : ''}
      </div>
    </div>`;
}

function renderLedger(){
  const host = document.getElementById('tpLedger');
  if(!host) return;
  document.querySelectorAll('.tp-tab').forEach(b =>
    b.classList.toggle('active', b.dataset.tptab === _ledgerTab));

  const p = currentPeriod();
  const me = _me();
  let list, empty;

  if(_ledgerTab === 'recibidos'){
    list = _period(p).filter(t => t.toUid === me);
    empty = {t:'Nadie te ha dado ThinkyPesos este mes', s:'Se ven aquí en cuanto alguien te reconozca. Tú también puedes empezar.'};
  } else if(_ledgerTab === 'enviados'){
    list = _period(p).filter(t => t.fromUid === me);
    empty = {t:'No has repartido nada este mes', s:'Tienes ' + myBalance() + ' ThinkyPesos esperando a alguien.'};
  } else {
    list = _period(p);
    empty = {t:'El mes va en blanco', s:'Aquí aparece lo que se reparte el equipo, con motivo y todo.'};
  }

  list = list.slice().sort((a,b) => (b.createdAt||0) - (a.createdAt||0));
  host.innerHTML = list.length
    ? list.map(t => txCard(t, _ledgerTab)).join('')
    : `<div class="tp-empty"><div class="tp-empty-t">${esc(empty.t)}</div><div class="tp-empty-s">${esc(empty.s)}</div></div>`;
}

// Solo el lugar, nunca el monto: el ranking es un reconocimiento, no un
// marcador de cuánto le dieron a cada quien. Por eso se corta en 5 y las
// filas no cargan ni número de pesos ni barra proporcional (delataría montos).
const RANK_SIZE = 5;
const MEDALS = ['🥇','🥈','🥉'];

function renderRanking(){
  const host = document.getElementById('tpRanking');
  if(!host) return;
  const p = host.dataset.period || currentPeriod();
  const map = receivedMap(p);
  const rows = [...map.entries()].sort((a,b) => b[1]-a[1]).slice(0, RANK_SIZE);

  const sel = document.getElementById('tpRankPeriod');
  if(sel){
    const opts = periodsWithData();
    if(!opts.includes(currentPeriod())) opts.unshift(currentPeriod());
    sel.innerHTML = opts.map(o => `<option value="${esc(o)}" ${o===p?'selected':''}>${esc(periodLabel(o))}</option>`).join('');
  }

  host.innerHTML = rows.length ? rows.map(([uid], i) => `
    <div class="tp-rank-row">
      <span class="tp-rank-n ${MEDALS[i]?'tp-rank-medal':''}">${MEDALS[i] || (i+1)}</span>
      <span class="tp-rank-av">${avatar(uid, 28)}</span>
      <span class="tp-rank-name">${esc(nameOf(uid))}</span>
    </div>`).join('')
    : `<div class="tp-empty"><div class="tp-empty-t">Nadie ha recibido nada</div><div class="tp-empty-s">${periodLabel(p)} sigue sin movimientos.</div></div>`;
}

// ============================================================
// TUTORIAL — mini onboarding la primera vez que alguien entra
// ============================================================
// Se guarda por uid en localStorage: cada quien lo ve una sola vez, en SU
// navegador. No es un dato del workspace (no vale la pena una escritura a
// Firestore por un flag de UI), así que si cambia de dispositivo lo vuelve
// a ver — más vale eso que molestar a todo el equipo por un registro que a
// nadie más le importa.

const ONB_STEPS = [
  { emoji:'🪙', title:'¡Bienvenido a ThinkyPeso!',
    body:'Es la moneda con la que el equipo se dice "gracias" en público. Nada de dinero real: es reconocimiento con nombre y con motivo.' },
  { emoji:'💸', title:'Cada mes te tocan 10',
    body:'Se abonan solos, sin que nadie los pida. Repártelos como quieras: todo a una persona o de uno en uno entre varias.' },
  { emoji:'⏳', title:'Una semana para repartirlos',
    body:'El reparto solo abre en la última semana del mes. Lo que no repartas en esos días se pierde: no se acumula para el siguiente.' },
  { emoji:'📝', title:'Sin motivo no hay ThinkyPeso',
    body:'Cuenta qué pasó de verdad: "se quedó a cerrar el reporte conmigo un viernes a las 9" dice mucho más que "buen trabajo".' },
  { emoji:'🏆', title:'El Top 5 del mes',
    body:'Los más reconocidos aparecen en un ranking — pero solo su lugar, nunca cuántos pesos llevan. Aquí se reconoce, no se compite por número.' },
];

let _onbStep = 0;

function tpOnboardKey(){ return 'cmos:tpOnboardSeen:' + (_me() || 'anon'); }
function tpOnboardSeen(){
  try { return localStorage.getItem(tpOnboardKey()) === '1'; } catch(e){ return true; }
}
function tpOnboardMarkSeen(){
  try { localStorage.setItem(tpOnboardKey(), '1'); } catch(e){}
}

function renderOnboard(){
  const dots = document.getElementById('tpOnbDots');
  const body = document.getElementById('tpOnbBody');
  if(!dots || !body) return;
  dots.innerHTML = ONB_STEPS.map((_, i) =>
    `<span class="tp-onb-dot ${i===_onbStep?'active':''} ${i<_onbStep?'done':''}"></span>`).join('');
  const s = ONB_STEPS[_onbStep];
  const last = _onbStep === ONB_STEPS.length - 1;
  body.innerHTML = `
    <div class="tp-onb-emoji">${s.emoji}</div>
    <div class="tp-onb-title">${esc(s.title)}</div>
    <div class="tp-onb-text">${esc(s.body)}</div>
    <div class="tp-onb-nav">
      ${_onbStep>0 ? `<button type="button" class="tp-btn-ghost" onclick="tpOnboardBack()">Atrás</button>` : `<span></span>`}
      <button type="button" class="tp-btn-go" onclick="tpOnboardNext()">${last ? '¡Vamos a repartir! 🎉' : 'Siguiente'}</button>
    </div>`;
}

// Sin botón de cerrar ni click-fuera: son 5 pantallas de un renglón, y que
// alguien lo cierre a la mitad sin enterarse de la ventana o del motivo es
// justo lo que este tutorial existe para evitar.
window.tpOnboardOpen = function(){
  _onbStep = 0;
  renderOnboard();
  openModal('tpOnboardModal');
};

window.tpOnboardNext = function(){
  if(_onbStep >= ONB_STEPS.length - 1){
    tpOnboardMarkSeen();
    closeModal('tpOnboardModal');
    return;
  }
  _onbStep++;
  renderOnboard();
};

window.tpOnboardBack = function(){
  if(_onbStep <= 0) return;
  _onbStep--;
  renderOnboard();
};

// Chispa de fiesta al entregar: la misma moneda del hero rebota y el confeti
// de fondo vuelve a arrancar. Puramente decorativo, nunca bloquea nada.
window.tpCelebrate = function(){
  const coin = document.getElementById('tpHeroCoin');
  if(coin){ coin.classList.remove('tp-coin-cheer'); void coin.offsetWidth; coin.classList.add('tp-coin-cheer'); }
  const hero = document.querySelector('.tp-hero');
  if(hero){
    hero.classList.remove('tp-hero-cheer'); void hero.offsetWidth; hero.classList.add('tp-hero-cheer');
    setTimeout(() => hero.classList.remove('tp-hero-cheer'), 1200);
  }
};

// ============================================================
// ENTRADA / SALIDA DE LA PESTAÑA
// ============================================================

window.renderThinkyPeso = function(){
  renderAssign();
  renderLedger();
  renderRanking();
  if(!_tick) _tick = setInterval(() => { renderHero(); tpSidebarBadge(); }, 1000);
  tpSidebarBadge();
  if(_me() && !tpOnboardSeen()) tpOnboardOpen();
};

window.tpTeardown = function(){
  if(_tick){ clearInterval(_tick); _tick = null; }
  // El tutorial se abre al entrar a la pestaña, pero nada lo cerraba al salir:
  // como es obligatorio y bloquea lo de atrás, quedaba flotando sobre Equipo o
  // Campañas — un tutorial de ThinkyPesos encima de una página que no es
  // ThinkyPesos, tapando lo que la persona vino a ver.
  // No se marca como visto: no lo terminó, así que vuelve a salir la próxima
  // vez que entre a la pestaña, que es justo lo que el tutorial busca.
  const onb = document.getElementById('tpOnboardModal');
  if(onb && onb.classList.contains('open')) closeModal('tpOnboardModal');
};

// El listener de Firestore entra por aquí. NO se re-renderiza el panel de
// reparto: si alguien más manda un peso mientras yo escribo un motivo, no me
// va a borrar el texto ni a sacarme del textarea.
window.tpOnData = function(){
  tpSidebarBadge();
  if(typeof currentPage!=='undefined' && currentPage !== 'thinkypeso') return;
  renderHero();
  // La lista sí se refresca (alguien nuevo en el equipo, o el contador de lo
  // que lleva recibido), pero solo si nadie está escribiendo: repintar con un
  // textarea enfocado se lleva el cursor a otra parte.
  const typing = document.activeElement && document.activeElement.classList
              && document.activeElement.classList.contains('tp-why-input');
  if(!typing) renderMembers();
  renderFooter();
  renderLedger();
  renderRanking();
};

// El riel muestra cuántos pesos te quedan, y solo durante la ventana: fuera
// de ella el número sería ruido permanente.
window.tpSidebarBadge = function(){
  const item = document.querySelector('.nav-item[data-page="thinkypeso"]');
  if(!item) return;
  let badge = item.querySelector('.tp-nav-badge');
  const st = windowState();
  const bal = myBalance();
  const show = st.open && bal > 0 && !!_me();
  if(!show){ if(badge) badge.remove(); item.classList.remove('tp-nav-live'); return; }
  if(!badge){
    badge = document.createElement('span');
    badge.className = 'nav-badge tp-nav-badge';
    item.appendChild(badge);
  }
  badge.textContent = bal;
  item.classList.add('tp-nav-live');
};

// Se expone lo mínimo para que otras vistas (dashboard, perfil) puedan leer
// el estado sin duplicar el calendario.
window.thinkyPeso = {
  GRANT, currentPeriod, windowState, myBalance,
  receivedIn: (uid, p) => receivedMap(p || currentPeriod()).get(uid) || 0
};

})();
