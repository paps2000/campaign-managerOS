/* Campaign OS — EFFies: pestaña temporal por las 7 nominaciones de Think Y.
   en los Effie® México 2026. Script CLÁSICO (NO type="module"): el HTML llama
   effieBurst() y effieSetDate() desde atributos onclick/onchange, que solo
   resuelven contra el scope global.

   Los datos son constantes de aquí: no hay lectura de Firestore ni del sheet.
   Lo único persistido es la fecha de la premiación (localStorage), porque
   todavía no es oficial y la pone quien la sepa. */

(function(){
'use strict';

const CASES = [
  { name:'Embajadores Coppel',     brand:'Coppel',      cat:'Éxito Sostenido' },
  { name:'Embajadores Coppel UGC', brand:'Coppel',      cat:'Retail' },
  { name:'Hellmanns se puso HOT',  brand:"Hellmann's",  cat:'Introducción de Nuevos Productos o Servicios' },
  { name:'Hellmanns se puso HOT',  brand:"Hellmann's",  cat:'Influencer' },
  { name:'MaliChallenge de Knorr', brand:'Knorr',       cat:'Social Media' },
  { name:'MaliBot de Knorr',       brand:'Knorr',       cat:'Inteligencia Artificial' },
  { name:'Rexona x Belinda',       brand:'Rexona',      cat:'Integraciones de Marca y Partnerships' }
];

const BRANDS = [
  { name:'Coppel',     n:2, w:'67%' },
  { name:"Hellmann's", n:2, w:'67%' },
  { name:'Knorr',      n:2, w:'67%' },
  { name:'Rexona',     n:1, w:'33%' }
];

const DATE_KEY = 'cmos:effieDate';
const COLORS = ['#c8a352','#f0dca8','#7d6129','#ff2d87','#2c6dff','#c6f24a','#ffffff'];

const _reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let _target = null;      // string datetime-local, o null si no hay fecha
let _tick = null;        // interval del contador
let _raf = null;         // loop del confeti
let _parts = [];         // partículas vivas
let _sized = false;      // el canvas ya escuchó el resize

function _esc(s){ return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function _pad(x){ return String(x).padStart(2,'0'); }

// ---------- confeti ----------
function _canvas(){ return document.getElementById('effieConfetti'); }

function _resize(){
  const cv = _canvas(); if(!cv) return;
  const dpr = window.devicePixelRatio || 1;
  cv.width = cv.clientWidth * dpr;
  cv.height = cv.clientHeight * dpr;
  cv.getContext('2d').setTransform(dpr,0,0,dpr,0,0);
}

function _spawn(n){
  const cv = _canvas(); if(!cv) return;
  const W = cv.clientWidth;
  for(let i=0;i<n;i++) _parts.push({
    x: Math.random()*W, y: -20 - Math.random()*220,
    vx: (Math.random()-.5)*1.6, vy: 1.6 + Math.random()*2.8,
    w: 5 + Math.random()*6, h: 8 + Math.random()*8,
    rot: Math.random()*Math.PI, vr: (Math.random()-.5)*.24,
    c: COLORS[(Math.random()*COLORS.length)|0], sway: Math.random()*Math.PI*2
  });
}

function _loop(){
  const cv = _canvas(); if(!cv) return;
  const ctx = cv.getContext('2d');
  const W = cv.clientWidth, H = cv.clientHeight;
  ctx.clearRect(0,0,W,H);
  for(let i=_parts.length-1;i>=0;i--){
    const p = _parts[i];
    p.sway += .05; p.x += p.vx + Math.sin(p.sway)*.7; p.y += p.vy; p.rot += p.vr;
    if(p.y > H + 30){ _parts.splice(i,1); continue; }
    ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rot);
    ctx.fillStyle = p.c; ctx.globalAlpha = .95;
    ctx.fillRect(-p.w/2,-p.h/2,p.w,p.h);
    ctx.restore();
  }
  // lluvia continua; quien pide menos movimiento solo ve las ráfagas que lanza
  if(!_reduceMotion && _parts.length < 60) _spawn(2);
  _raf = requestAnimationFrame(_loop);
}

function _startConfetti(){
  const cv = _canvas(); if(!cv || _raf) return;
  _resize();
  if(!_sized){ window.addEventListener('resize', _resize); _sized = true; }
  _loop();
}

function _stopConfetti(){
  if(_raf){ cancelAnimationFrame(_raf); _raf = null; }
  _parts = [];
  const cv = _canvas();
  if(cv) cv.getContext('2d').clearRect(0,0,cv.clientWidth,cv.clientHeight);
}

window.effieBurst = function(n){
  _startConfetti();
  _spawn(typeof n === 'number' ? n : 180);
};

// ---------- contador ----------
function _renderCountdown(){
  const body = document.getElementById('effieCdBody');
  const status = document.getElementById('effieCdStatus');
  if(!body) return;

  const ms = _target ? new Date(_target).getTime() - Date.now() : 0;
  const live = !!_target && ms > 0;
  if(status) status.textContent = live ? 'Contador activo' : 'Octubre TBD';

  if(!live){
    body.innerHTML = '<div class="effie-tbd"><div class="effie-tbd-txt">Octubre TBD</div></div>';
    return;
  }

  const cell = (v,l) => `<div class="effie-cd-cell"><div class="effie-cd-num">${v}</div><div class="effie-cd-lab">${l}</div></div>`;
  const fecha = new Date(_target).toLocaleString('es-MX',{ dateStyle:'full', timeStyle:'short' });
  body.innerHTML =
    '<div class="effie-cd-grid">' +
      cell(Math.floor(ms/86400000),'Días') +
      cell(_pad(Math.floor(ms/3600000)%24),'Horas') +
      cell(_pad(Math.floor(ms/60000)%60),'Min') +
      cell(_pad(Math.floor(ms/1000)%60),'Seg') +
    '</div>' +
    `<div class="effie-cd-date">${_esc(fecha)}</div>`;
}

window.effieSetDate = function(v){
  _target = v || null;
  try {
    if(_target) localStorage.setItem(DATE_KEY, _target);
    else localStorage.removeItem(DATE_KEY);
  } catch(e){}
  _renderCountdown();
};

// ---------- render ----------
window.renderEffies = function(){
  try { _target = localStorage.getItem(DATE_KEY) || null; } catch(e){ _target = null; }
  const input = document.getElementById('effieDateInput');
  if(input) input.value = _target || '';

  const cases = document.getElementById('effieCases');
  if(cases && !cases.childElementCount){
    cases.innerHTML = CASES.map((c,i) => `
      <div class="effie-case" style="animation-delay:${(i*0.05).toFixed(2)}s">
        <img src="assets/effie-trophy.png" alt="" aria-hidden="true">
        <div class="effie-case-body">
          <div class="effie-case-name">${_esc(c.name)}</div>
          <div class="effie-chips">
            <span class="effie-chip">${_esc(c.brand)}</span>
            <span class="effie-chip effie-chip-cat">Categoría ${_esc(c.cat)}</span>
          </div>
        </div>
      </div>`).join('');
  }

  const count = document.getElementById('effieCasesCount');
  if(count){
    const cats = new Set(CASES.map(c=>c.cat)).size;
    count.textContent = `${CASES.length} casos · ${cats} categorías`;
  }

  const brands = document.getElementById('effieBrands');
  if(brands && !brands.childElementCount){
    brands.innerHTML = BRANDS.map(b => `
      <div class="effie-brand-row">
        <span class="effie-brand-name">${_esc(b.name)}</span>
        <span class="effie-bar"><span class="effie-bar-fill" style="width:${b.w}"></span></span>
        <span class="effie-brand-n">${b.n}</span>
      </div>`).join('');
  }

  _renderCountdown();
  if(!_tick) _tick = setInterval(_renderCountdown, 1000);

  document.querySelector('.main')?.classList.add('effie-on');
  _startConfetti();
  if(!_reduceMotion) setTimeout(()=>window.effieBurst(220), 400);
};

// Al salir de la pestaña se apagan el rAF y el interval: es una vista de
// adorno, no debe seguir pintando detrás de las demás páginas.
window.effiesTeardown = function(){
  document.querySelector('.main')?.classList.remove('effie-on');
  _stopConfetti();
  if(_tick){ clearInterval(_tick); _tick = null; }
};

})();
