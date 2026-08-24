/* Campaign OS — Firebase, capa de datos/caché, datos de ejemplo, navegación, tema
   Extraído de index.html. Script CLÁSICO a propósito (NO type="module"):
   el HTML llama estas funciones desde atributos onclick/onchange, que solo
   resuelven contra el scope global. El orden de carga en index.html replica
   el orden original de ejecución y no debe alterarse. */

const SIDEBAR_ICN = {
  influencers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M15 16c2-1 5-1 6 1"/></svg>',
  documentos:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/></svg>',
  calendario:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>'
};

const ICN_chart = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg>';
const ICN_close = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6l-12 12"/></svg>';
const ICN_copy = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>';
const ICN_mail = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 7 9-7"/></svg>';
const ICN_edit = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4l6 6-11 11H3v-6L14 4z"/></svg>';
const ICN_trash = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M5 6l1 14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-14"/></svg>';
const ICN_sparkle = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 4.5L18 9l-4.2 1.5L12 15l-1.8-4.5L6 9l4.2-1.5z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/></svg>';
const ICN_alert = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4l10 17H2L12 4z"/><path d="M12 10v5M12 18v.5"/></svg>';
/* Iconos que faltaban en el set y que hasta ahora se cubrían con emoji.
   Mismo trazo que los de arriba (24x24, currentColor, 1.8, puntas redondas)
   para que convivan sin desentonar. */
const ICN_trophy = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h10v6a5 5 0 0 1-10 0z"/><path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3"/><path d="M12 15v3M9 21h6M10 18h4"/></svg>';
const ICN_coin = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M14.5 9.5c0-1-1.1-1.5-2.5-1.5s-2.5.6-2.5 1.7c0 2.4 5 1.3 5 3.6 0 1.1-1.1 1.7-2.5 1.7s-2.5-.5-2.5-1.5"/></svg>';
const ICN_refresh = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 1-15.5 6.2M3 12a9 9 0 0 1 15.5-6.2"/><path d="M18.5 3v3h-3M5.5 21v-3h3"/></svg>';
const ICN_link = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.5 1.5"/><path d="M14 11a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.5-1.5"/></svg>';
const ICN_bookmark = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h12a1 1 0 0 1 1 1v15l-7-4-7 4V5a1 1 0 0 1 1-1z"/></svg>';
const ICN_unlock = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.5-2"/></svg>';
const ICN_org = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="5" rx="1"/><rect x="2" y="16" width="6" height="5" rx="1"/><rect x="16" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M5 16v-2h14v2"/></svg>';
const ICN_badge = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5" width="19" height="14" rx="2"/><circle cx="8.5" cy="11" r="2"/><path d="M5 16c.6-1.5 2-2.2 3.5-2.2S11.4 14.5 12 16M14.5 10h4M14.5 13.5h4"/></svg>';
const ICN_user = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg>';
const ICN_megaphone = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11v2a1 1 0 0 0 1 1h3l7 4V6L7 10H4a1 1 0 0 0-1 1z"/><path d="M18 9a4 4 0 0 1 0 6"/><path d="M7 14v4a1 1 0 0 0 1 1h1"/></svg>';
const ICN_target = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/></svg>';
const ICN_search = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>';
const ICN_moon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/></svg>';
const ICN_sun = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg>';
const ICN_bell = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z"/><path d="M10 19a2 2 0 0 0 4 0"/></svg>';
const ICN_bellOff = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 4.7A6 6 0 0 1 18 9c0 5 2 6 2 6h-9"/><path d="M6.3 6.3C6.1 7.1 6 8 6 9c0 5-2 6-2 6h11"/><path d="M10 19a2 2 0 0 0 4 0M3 3l18 18"/></svg>';
const ICN_eye = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="2.7"/></svg>';
const ICN_eyeOff = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10.6 6.2A9.9 9.9 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3.3 3.9M6.4 8.2A17 17 0 0 0 2 12s3.5 6 10 6c1.6 0 3-.4 4.3-.9"/><path d="M9.9 9.9a2.7 2.7 0 0 0 3.8 3.8M3 3l18 18"/></svg>';
const ICN_play = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M10 8.5l6 3.5-6 3.5z"/></svg>';


const ICN_users = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M15 16c2-1 5-1 6 1"/></svg>';
const ICN_calendar = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>';
const ICN_doc = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5"/></svg>';
const ICN_sheet = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 10h16M4 16h16M10 4v16"/></svg>';
const ICN_paperclip = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11l-9 9a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8"/></svg>';
const ICN_clipboard = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4h6v3H9z"/></svg>';
const ICN_check = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/></svg>';
// Social platform icons — colored filled
const ICN_insta = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="ig-g" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" stop-color="#FFDC80"/><stop offset="30%" stop-color="#F77737"/><stop offset="65%" stop-color="#C13584"/><stop offset="100%" stop-color="#833AB4"/></linearGradient></defs><rect x="1" y="1" width="22" height="22" rx="6" fill="url(#ig-g)"/><circle cx="12" cy="12" r="5" fill="none" stroke="white" stroke-width="2"/><circle cx="17.5" cy="6.5" r="1.2" fill="white"/></svg>`;
const ICN_tiktok = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect width="24" height="24" rx="6" fill="#010101"/><path d="M19.1 8.7a5.1 5.1 0 0 1-3.1-1V14a4.3 4.3 0 1 1-3.5-4.2v2.6a1.8 1.8 0 1 0 1.2 1.7V4h2.4a3.1 3.1 0 0 0 3 2.7v2z" fill="white"/><path d="M18.8 8.4a5.1 5.1 0 0 1-2.8-2.4A3.1 3.1 0 0 0 18.8 8.4z" fill="#69C9D0"/></svg>`;
const ICN_youtube = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect width="24" height="24" rx="6" fill="#FF0000"/><path d="M20.2 8.6s-.2-1.2-.7-1.7c-.7-.7-1.4-.7-1.8-.8C15.4 6 12 6 12 6s-3.4 0-5.7.1c-.4.1-1.1.1-1.8.8-.5.5-.7 1.7-.7 1.7S3.6 10 3.6 11.4v1.2c0 1.4.2 2.8.2 2.8s.2 1.2.7 1.7c.7.7 1.6.7 2 .8 1.5.1 5.5.1 5.5.1s3.4 0 5.7-.2c.4 0 1.1-.1 1.8-.8.5-.5.7-1.7.7-1.7s.2-1.4.2-2.8v-1.2C20.4 10 20.2 8.6 20.2 8.6zM10.2 14V9.8l4.7 2.1-4.7 2.1z" fill="white"/></svg>`;
const ICN_twitter = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect width="24" height="24" rx="6" fill="#000000"/><path d="M17.8 4.5h2.3l-5 5.7 5.9 7.8h-4.6l-3.6-4.7-4.2 4.7H5.3l5.4-6.1L5 4.5h4.7l3.2 4.3 3.9-4.3zm-.8 12h1.3L7.1 5.7H5.7L17 16.5z" fill="white"/></svg>`;
const ICN_facebook = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect width="24" height="24" rx="6" fill="#1877F2"/><path d="M15.9 13.5l.4-2.9h-2.8v-1.9c0-.8.4-1.6 1.6-1.6h1.2V4.6S15.3 4.4 14 4.4c-2.3 0-3.8 1.4-3.8 3.9v2.3H7.7v2.9h2.5V21c.5.1 1 .1 1.5.1s1 0 1.5-.1v-7.5h2.7z" fill="white"/></svg>`;
const ICN_twitch = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect width="24" height="24" rx="6" fill="#9146FF"/><path d="M7 4L5 8v10h3v2h2l2-2h3l4-4V4H7zm11 9.5L15.5 16H12l-2 2v-2H7.5V5.5H18v8z" fill="white"/><rect x="11" y="8" width="1.6" height="4.5" fill="white"/><rect x="14.5" y="8" width="1.6" height="4.5" fill="white"/></svg>`;
const ICN_thumbsUp = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10v10H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z"/><path d="M7 10l4-7a2 2 0 0 1 3 1.8V9h4.5a2 2 0 0 1 2 2.4l-1.3 6A2 2 0 0 1 17.2 19H7"/></svg>';
const ICN_clock = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5.5l3.5 2"/></svg>';
const ICN_ban = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg>';
const ICN_pin = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s6-5.7 6-10a6 6 0 0 0-12 0c0 4.3 6 10 6 10z"/><circle cx="12" cy="11" r="2.2"/></svg>';
const ICN_rocket = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20V5"/><path d="M6 11l6-6 6 6"/></svg>';
const ICN_flag = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4"/><path d="M5 5h11l-1.6 3.5L16 12H5z"/></svg>';
const ICN_star = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.6l2.6 5.3 5.8.85-4.2 4.1 1 5.75L12 16.9l-5.2 2.7 1-5.75-4.2-4.1 5.8-.85z"/></svg>';

/* Un solo lugar de donde salen todos. El HTML estático no puede interpolar las
   constantes de arriba, así que en index.html los iconos se escriben como
   <span class="icn-inline" data-icn="refresh"></span> y este mapa los rellena
   al cargar. Así el SVG no se copia veinte veces dentro del HTML. */
const ICONS = {
  alert:ICN_alert, calendar:ICN_calendar, chart:ICN_chart, check:ICN_check,
  clipboard:ICN_clipboard, close:ICN_close, copy:ICN_copy, doc:ICN_doc,
  edit:ICN_edit, mail:ICN_mail, paperclip:ICN_paperclip, sheet:ICN_sheet,
  sparkle:ICN_sparkle, trash:ICN_trash, users:ICN_users,
  trophy:ICN_trophy, coin:ICN_coin, refresh:ICN_refresh, link:ICN_link,
  bookmark:ICN_bookmark, unlock:ICN_unlock, org:ICN_org, badge:ICN_badge,
  user:ICN_user, megaphone:ICN_megaphone, target:ICN_target, search:ICN_search,
  moon:ICN_moon, sun:ICN_sun, bell:ICN_bell, bellOff:ICN_bellOff,
  eye:ICN_eye, eyeOff:ICN_eyeOff, play:ICN_play,
  thumbsUp:ICN_thumbsUp, clock:ICN_clock, ban:ICN_ban, pin:ICN_pin,
  rocket:ICN_rocket, flag:ICN_flag, star:ICN_star,
};

function hydrateIcons(root) {
  (root || document).querySelectorAll('[data-icn]:empty').forEach(el => {
    const svg = ICONS[el.getAttribute('data-icn')];
    if (svg) el.innerHTML = svg;
  });
}
document.addEventListener('DOMContentLoaded', () => hydrateIcons());


// Normalize any platform string (IG, tiktok, YT, X, "FB REEL", etc.) → canonical key.
function _normalizePlatform(pf) {
  const raw = String(pf||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  const k = raw.replace(/[^a-z0-9]/g,'').trim();
  if(!k) return null;
  // 1) Exact alias match
  const map = {
    instagram:'Instagram', ig:'Instagram', insta:'Instagram', reel:'Instagram', reels:'Instagram', story:'Instagram', stories:'Instagram', post:'Instagram',
    tiktok:'TikTok', tt:'TikTok', tik:'TikTok',
    youtube:'YouTube', yt:'YouTube', shorts:'YouTube', short:'YouTube', ytshorts:'YouTube',
    twitter:'Twitter/X', x:'Twitter/X', tweet:'Twitter/X', twitterx:'Twitter/X',
    facebook:'Facebook', fb:'Facebook', face:'Facebook', fbreel:'Facebook',
    twitch:'Twitch', stream:'Twitch',
  };
  if(map[k]) return map[k];
  if(/twitch|stream/.test(raw)) return 'Twitch';
  // 2) Substring detection (handles "FB REEL", "TIKTOK ORGÁNICO", "SHORT (REPLICA)").
  //    Order matters: most specific / brand-named first so "FB REEL" → Facebook.
  if(/tiktok|tik\b|\btt\b/.test(raw)) return 'TikTok';
  if(/youtube|\byt\b|short/.test(raw)) return 'YouTube';
  if(/facebook|\bfb\b/.test(raw)) return 'Facebook';
  if(/twitter|tweet|\bx\b/.test(raw)) return 'Twitter/X';
  if(/instagram|\big\b|insta|reel|story|stories/.test(raw)) return 'Instagram';
  return null;
}

// Platform badge — colored pill with brand icon. Accepts any alias.
function platformBadge(pf) {
  const icons = {Instagram:ICN_insta,TikTok:ICN_tiktok,YouTube:ICN_youtube,'Twitter/X':ICN_twitter,Facebook:ICN_facebook,Twitch:ICN_twitch};
  const colors = {Instagram:'#C13584',TikTok:'#010101',YouTube:'#FF0000','Twitter/X':'#000000',Facebook:'#1877F2',Twitch:'#9146FF'};
  const key = _normalizePlatform(pf);
  const icon = key ? icons[key] : null;
  if(!icon) { const t = String(pf||'').trim(); return `<span style="font-size:11px;color:var(--text-muted);">${t?_esc(t):'—'}</span>`; }
  return `<span class="plat-badge" data-plat="${key}" style="display:inline-flex;align-items:center;gap:5px;padding:2px 8px 2px 3px;border-radius:20px;background:${colors[key]}18;font-size:11px;font-weight:700;color:${colors[key]};white-space:nowrap;"><span style="width:18px;height:18px;display:inline-flex;flex-shrink:0;">${icon}</span>${key}</span>`;
}

// Render every platform a creator is active on (array or comma string).
function platformBadges(platforms) {
  const arr = Array.isArray(platforms) ? platforms : String(platforms||'').split(',');
  const seen = new Set(); const out = [];
  arr.forEach(p => { const k = _normalizePlatform(p) || String(p||'').trim(); if(k && !seen.has(k)) { seen.add(k); out.push(platformBadge(p)); } });
  return out.join(' ');
}

// ============================================================
// FIREBASE INIT
// ============================================================
const firebaseConfig = {
  apiKey: "AIzaSyB912pnQWSyFeRI5yuuyIZwhys_pIycBjs",
  authDomain: "campaign-manager-os.firebaseapp.com",
  projectId: "campaign-manager-os",
  storageBucket: "campaign-manager-os.firebasestorage.app",
  messagingSenderId: "144199511389",
  appId: "1:144199511389:web:03d9c6d6b641517c570cb4",
  measurementId: "G-9MEPFG29Z3"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const WORKSPACE = 'default'; // shared workspace for all users

// === ACCESS CONTROL ===
const ALLOWED_DOMAINS = ['thinkydigital.com'];
const INITIAL_ADMINS = ['paulo@thinkydigital.com'];

function isAllowedEmail(email) {
  if(!email) return false;
  return ALLOWED_DOMAINS.some(d => email.toLowerCase().endsWith('@'+d));
}

let currentUser = null;
let currentUserProfile = null; // {name, email, role, ...}
let allUsers = []; // cached list of users
let unsubscribers = [];

// ============================================================
// DATA MANAGEMENT (cache layer + Firestore sync)
// ============================================================
const FLOW_STEPS = ['Propuesta','Perfiles','Presupuesto','Brief','SKUs','Producción','Revisión cliente','Publicación','Métricas','Reporte','Cierre'];
const STATUS_OPTIONS_FLOW = ['Pendiente','En proceso','Completado','Aprobado','Enviado','Pendiente aprobación','No aplica'];
const PUESTOS = [
  // Cuentas
  'Account Director','Head Account','Account Manager','Account Executive',
  // Operaciones
  'Operations Manager','Operaciones Senior','Account Lead','Account Junior',
  // Creativo
  'Creative Director','Art Director','Content Creative Head','Content Creative Senior','Content Creative','Content Creative Junior','Content Design',
];
const COST_ACCESS_PUESTOS = new Set(['Account Director','Head Account','Account Manager','Operations Manager','Creative Director','Art Director']);

// ============================================================
// NIVELES — la jerarquía, como dato
// ============================================================
// El organigrama de la pestaña Equipo se dibuja desde aquí, y es la base sobre
// la que van a colgar los permisos por nivel. Un puesto sin nivel cae en 99
// ("Sin nivel") y sale al final: es señal de que hay que darlo de alta aquí, no
// un error que valga romper la vista.
//
// OJO: esto es jerarquía por PUESTO, no líneas de reporte persona a persona.
// Quién le reporta a quién en concreto no está en ningún lado del producto; si
// hace falta esa precisión, va un campo `reportsTo` en el doc de cada miembro.
const NIVELES = [
  { n:1, label:'Dirección',  desc:'Deciden sobre la cuenta y el presupuesto.' },
  { n:2, label:'Jefatura',   desc:'Llevan un área completa.' },
  { n:3, label:'Coordinación', desc:'Coordinan ejecución y equipo.' },
  { n:4, label:'Ejecución',  desc:'Operan el día a día de la campaña.' },
  { n:5, label:'Junior',     desc:'En formación, con acompañamiento.' },
];
const PUESTO_NIVEL = {
  'Account Director':1, 'Creative Director':1,
  'Head Account':2, 'Operations Manager':2, 'Art Director':2, 'Content Creative Head':2,
  'Account Manager':3, 'Operaciones Senior':3, 'Account Lead':3, 'Content Creative Senior':3,
  'Account Executive':4, 'Account Junior':4, 'Content Creative':4, 'Content Design':4,
  'Content Creative Junior':5,
};
function nivelDe(u) {
  if(!u) return 99;
  // Admin sin puesto capturado no debería caer al fondo del organigrama.
  const n = PUESTO_NIVEL[u.puesto];
  if(n) return n;
  return u.role === 'admin' ? 1 : 99;
}
function nivelLabel(n) {
  const x = NIVELES.find(v => v.n === n);
  return x ? x.label : 'Sin nivel';
}
const STATUS_OPTIONS = STATUS_OPTIONS_FLOW;

// In-memory cache backed by Firestore. Reads = sync (cache). Writes = sync cache + async Firestore.
const _cache = { campaigns:[], globalTasks:[], settings:{}, influencerRatings:[], creators:[], thinkyPesos:[], events:[], _initialized:false };

function getData(key, def) {
  if(key in _cache) return _cache[key];
  // fallback for any leftover localStorage usage (claudeApiKey stays local)
  try { return JSON.parse(localStorage.getItem(key)) || (def!==undefined?def:[]); } catch { return def!==undefined?def:[]; }
}

// Solo caché. Para cuando el llamador se encarga él mismo de la escritura
// (persistCampaignNow): pasar por setData dispararía además persistCampaigns y
// el mismo documento se escribiría dos veces en paralelo.
function setDataLocal(key, val) { _cache[key] = val; }

function setData(key, val) {
  _cache[key] = val;
  // Persist to Firestore based on key
  if(key === 'campaigns') {
    // Sync entire campaigns list — write each one
    persistCampaigns(val);
  } else if(key === 'globalTasks') {
    persistGlobalTasks(val);
  } else if(key === 'settings') {
    persistSettings(val);
  } else if(key === '_initialized') {
    // local-only flag
    localStorage.setItem('_initialized', JSON.stringify(val));
  }
}

function getSettings() {
  const local = {};
  try {
    const ck = localStorage.getItem('claudeApiKey');
    if(ck) local.claudeApiKey = ck;
    const ok = localStorage.getItem('openaiApiKey');
    if(ok) local.openaiApiKey = ok;
    const ap = localStorage.getItem('aiProvider');
    if(ap) local.aiProvider = ap;
  } catch{}
  return {..._cache.settings, ...local};
}

function saveSettingsData(s) {
  const {claudeApiKey, openaiApiKey, aiProvider, ...rest} = s;
  if(claudeApiKey !== undefined) localStorage.setItem('claudeApiKey', claudeApiKey);
  if(openaiApiKey !== undefined) localStorage.setItem('openaiApiKey', openaiApiKey);
  if(aiProvider !== undefined) localStorage.setItem('aiProvider', aiProvider);
  if(Object.keys(rest).length > 0) {
    _cache.settings = {..._cache.settings, ...rest};
    persistSettings(_cache.settings);
  }
}

// ============================================================
// ERRORES EN CASTELLANO
// ============================================================
// Firestore devuelve mensajes en inglés escritos para quien programa
// ("Missing or insufficient permissions"). Volcarlos en un toast no le sirve a
// nadie: el detalle técnico va a la consola y en pantalla va qué pasó y cómo
// salir. `accion` es lo que se estaba intentando, en infinitivo y en minúscula
// ("guardar el puesto"), para que el aviso empiece diciendo qué falló.
const _ERRORES_FIRESTORE = {
  'permission-denied':  'no tienes permiso para hacerlo. Si crees que sí deberías, pídele a un admin que lo revise.',
  'unauthenticated':    'tu sesión caducó. Vuelve a entrar y reintenta.',
  'unavailable':        'parece que estás sin conexión. Revisa tu internet y reintenta.',
  'deadline-exceeded':  'el servidor tardó demasiado en responder. Reintenta en un momento.',
  'not-found':          'ya no existe en el servidor. Recarga la página para ver el estado real.',
  'already-exists':     'ya existe algo con ese identificador.',
  'resource-exhausted': 'se agotó la cuota de Firestore por hoy. Avísale a quien administra el proyecto.',
  'invalid-argument':   'hay un dato con un formato que el servidor no acepta.',
  'failed-precondition':'falta un índice o una condición del servidor. Revisa la consola para el detalle.',
  'cancelled':          'la operación se canceló antes de terminar.',
};
function errorHumano(e, accion) {
  const cod = e && (e.code || '');
  const clave = String(cod).replace(/^firestore\//, '');
  const cola = _ERRORES_FIRESTORE[clave]
    || (e && e.message ? 'falló con: ' + e.message : 'falló por una razón que no supimos leer.');
  return 'No se pudo ' + (accion || 'completar la acción') + ': ' + cola;
}
// Atajo: registra el detalle técnico y avisa en pantalla en un solo paso.
function avisarError(e, accion, etiqueta) {
  try { console.error(etiqueta || accion || 'error', e); } catch(_){}
  try { showToast(errorHumano(e, accion), 'error'); } catch(_){}
}

function id() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

// --- Firestore persistence helpers ---
// Keys that hold large fetched sheet data — kept in memory but stripped
// from Firestore writes because they can blow past the 1MB doc limit.
const _CAMPAIGN_LARGE_KEYS = ['trackerRows','escenarioRows','ugcRows','cachedMetrics'];
function _stripLargeFields(c) {
  const out = {...c};
  _CAMPAIGN_LARGE_KEYS.forEach(k => { delete out[k]; });
  return out;
}
// Huella del contenido que sabemos que está en el servidor, por campaña.
// Sirve para no reescribir documentos que no cambiaron: antes cada
// setData('campaigns') —hay 47 puntos que lo llaman— leía la colección
// entera y reescribía TODAS las campañas, así que un solo click costaba N
// lecturas + N escrituras y disparaba N eventos del listener.
const _persistedFp = new Map();
// Serializa con las claves ordenadas EN TODOS LOS NIVELES. Ojo: no se puede
// usar el replacer de JSON.stringify (el array de claves) porque ese array
// filtra por nombre en todo el árbol, así que los objetos anidados
// —responsables, goal, cada fila de influencers— salían vacíos y dos campañas
// que solo diferían ahí daban la misma huella: la escritura se saltaba y el
// cambio (p. ej. quitarte de Cuentas) nunca llegaba a Firestore.
function _stableStringify(v) {
  if(v === undefined || typeof v === 'function') return 'null';
  if(v === null || typeof v !== 'object') return JSON.stringify(v);
  if(Array.isArray(v)) return '[' + v.map(_stableStringify).join(',') + ']';
  // undefined se omite igual que en JSON.stringify: el doc que vuelve del
  // servidor tampoco lo trae, y así la huella local y la remota coinciden.
  const keys = Object.keys(v).filter(k => v[k] !== undefined && typeof v[k] !== 'function').sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + _stableStringify(v[k])).join(',') + '}';
}
function _campaignFingerprint(c) {
  const o = _stripLargeFields(c);
  delete o._updatedAt; delete o._updatedBy;   // metadatos, no contenido
  return _stableStringify(o);
}
// Llamado desde el listener: el servidor es la fuente de verdad.
function _seedPersistedFp(docs) {
  _persistedFp.clear();
  docs.forEach(d => { try { _persistedFp.set(d.id, _campaignFingerprint(d)); } catch(e){} });
}

// Firestore rechaza `undefined` con un throw SÍNCRONO en batch.set(): un solo
// campo así reventaba el lote entero antes de llegar al try/catch del commit,
// y la escritura se perdía sin que nadie se enterara.
function _sanitizeForFirestore(v) {
  if(v === null || typeof v !== 'object') return v;
  if(Array.isArray(v)) return v.map(x => x === undefined ? null : _sanitizeForFirestore(x));
  if(typeof v.toDate === 'function' || v instanceof Date) return v;   // Timestamp/Date: se pasan tal cual
  const out = {};
  Object.keys(v).forEach(k => {
    const val = v[k];
    if(val === undefined || typeof val === 'function') return;
    out[k] = _sanitizeForFirestore(val);
  });
  return out;
}

function _campaignPayload(c) {
  return {
    ..._sanitizeForFirestore(_stripLargeFields(c)),
    _updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    _updatedBy: currentUser.uid,
  };
}

// Guardado explícito de UNA campaña. No pasa por la huella —cuando el usuario
// le da a Guardar la escritura va sí o sí— y si el servidor la rechaza
// (permisos, doc >1MB, red) se ve en pantalla en vez de morir en la consola.
async function persistCampaignNow(campaign) {
  if(!currentUser || !campaign || !campaign.id) return false;
  try {
    const payload = _campaignPayload(campaign);
    // Firestore corta en 1MB por documento y el error que devuelve no dice
    // cuál campaña fue. Se avisa antes, con nombre y peso.
    const bytes = new Blob([JSON.stringify(_stripLargeFields(campaign))]).size;
    if(bytes > 950000) {
      showToast(`"${campaign.name}" pesa ${(bytes/1024/1024).toFixed(2)}MB y Firestore corta en 1MB. No se guardó.`, 'error');
      return false;
    }
    await db.collection('workspaces').doc(WORKSPACE).collection('campaigns')
      .doc(campaign.id).set(payload);
    _persistedFp.set(campaign.id, _campaignFingerprint(campaign));
    // El republish del Modo cliente vive en persistCampaigns; por esta vía
    // también tiene que correr, si no el link del cliente se queda viejo.
    try {
      if(typeof _scheduleClientShareRepublish === 'function')
        _scheduleClientShareRepublish(_cache.campaigns || [campaign]);
    } catch(e){}
    return true;
  } catch(e) {
    console.error('persistCampaignNow', e);
    _persistedFp.delete(campaign.id);   // que el siguiente intento no lo salte
    try { showToast('No se pudo guardar en el servidor: ' + (e.message||e), 'error'); } catch(_){}
    return false;
  }
}

async function persistCampaigns(campaigns) {
  if(!currentUser) return;
  const col = db.collection('workspaces').doc(WORKSPACE).collection('campaigns');
  const batch = db.batch();
  const escritas = [];
  let ops = 0;

  campaigns.forEach(c => {
    const fp = _campaignFingerprint(c);
    if(_persistedFp.get(c.id) === fp) return;   // idéntico: escribirlo sería no-op
    try {
      batch.set(col.doc(c.id), _campaignPayload(c));
    } catch(e) {
      // Una campaña con datos que Firestore no acepta no puede tumbar el resto.
      console.error('persistCampaigns: campaña inválida', c.id, e);
      return;
    }
    escritas.push([c.id, fp]);
    ops++;
  });

  // Borrados: ids que teníamos registrados y ya no están en memoria.
  const vivos = new Set(campaigns.map(c=>c.id));
  const borradas = [];
  _persistedFp.forEach((_, id) => {
    if(!vivos.has(id)) { batch.delete(col.doc(id)); borradas.push(id); ops++; }
  });

  if(ops === 0) return;   // nada cambió: ni siquiera se abre conexión
  try {
    await batch.commit();
    // Solo tras confirmar la escritura se da por persistido; si falla, la
    // próxima llamada vuelve a intentarlo en vez de saltárselo.
    escritas.forEach(([id, fp]) => _persistedFp.set(id, fp));
    borradas.forEach(id => _persistedFp.delete(id));
  } catch(e) {
    console.error('persistCampaigns error',e);
    try { showToast('No se pudieron guardar los cambios: ' + (e.message||e), 'error'); } catch(_){}
  }

  // Si alguna campaña tiene Modo cliente activo, refresca su snapshot público
  // (debounced) para que el link del cliente refleje el estado actual.
  try { if(typeof _scheduleClientShareRepublish === 'function') _scheduleClientShareRepublish(campaigns); } catch(e){}
}

// Mismo agujero que tenía persistCampaigns: batch.set() lanza de forma
// SÍNCRONA ante un `undefined` —y `recurringDay` queda undefined en cuanto una
// tarea deja de ser recurrente, que es el caso normal—. El throw se escapaba
// del try, que solo envolvía el commit, así que la promesa se rompía entera:
// ninguna tarea global llegaba al servidor y la app seguía diciendo "Tarea
// actualizada". Se sanea antes de escribir y cada doc va en su propio try.
// Huella de lo último confirmado por el servidor para cada pendiente suelto.
// Mismo papel que _persistedFp con las campañas: marcar UNA tarea como hecha
// reescribía las CIEN, y cada escritura vuelve como snapshot y como repintado.
// Esa tormenta era buena parte del parpadeo de la app.
const _tareasFp = new Map();
function _tareaFingerprint(t) { return _stableStringify(_sanitizeForFirestore(t)); }

async function persistGlobalTasks(tasks) {
  if(!currentUser) return;
  const col = db.collection('workspaces').doc(WORKSPACE).collection('globalTasks');
  let existingIds;
  try {
    const snap = await col.get();
    existingIds = new Set(snap.docs.map(d=>d.id));
  } catch(e) {
    console.error('persistGlobalTasks read error',e);
    try { showToast('No se pudieron leer los pendientes del servidor: ' + (e.message||e), 'error'); } catch(_){}
    return;
  }
  const newIds = new Set(tasks.map(t=>t.id));
  const batch = db.batch();
  const escritas = [];
  let ops = 0;
  tasks.forEach(t => {
    if(!t || !t.id) return;
    let fp;
    try { fp = _tareaFingerprint(t); } catch(e) { fp = null; }
    // Ya está así en el servidor y el doc existe: reescribirlo es un no-op caro.
    if(fp && _tareasFp.get(t.id) === fp && existingIds.has(t.id)) return;
    try { batch.set(col.doc(t.id), _sanitizeForFirestore(t)); ops++; escritas.push([t.id, fp]); }
    catch(e) { console.error('persistGlobalTasks: tarea inválida', t.id, e); }
  });
  existingIds.forEach(eid => { if(!newIds.has(eid)) { batch.delete(col.doc(eid)); _tareasFp.delete(eid); ops++; } });
  if(ops === 0) return;
  try {
    await batch.commit();
    escritas.forEach(([tid, fp]) => { if(fp) _tareasFp.set(tid, fp); });
  } catch(e) {
    console.error('persistGlobalTasks error',e);
    try { showToast('No se pudieron guardar los pendientes: ' + (e.message||e), 'error'); } catch(_){}
  }
}

async function persistSettings(settings) {
  if(!currentUser) return;
  try {
    await db.collection('workspaces').doc(WORKSPACE).collection('config').doc('settings').set(settings, {merge:true});
  } catch(e) { console.error('persistSettings error',e); }
}

// Escenario load/fetch guards keyed by campaign id (NOT on the campaign object,
// because the realtime listener rebuilds those objects on every snapshot — a
// per-object flag would reset and cause an infinite render→load→render flash).
const _escenarioStoreChecked = new Set();
const _escenarioLoading = new Set();
const _escenarioFetching = new Set();
function _rerenderEscenarioIfActive(campaignId) {
  if(currentCampaignId !== campaignId) return;
  const c = (_cache.campaigns||[]).find(x=>x.id===campaignId);
  if(c) { try { renderEscenarioBlock(c); } catch(e){} }
}

// --- Escenario sheet persistence (separate doc so the big rows array survives
//     reloads without bloating the campaign doc). Stored under
//     workspaces/<ws>/escenarios/<campaignId>. ---
async function persistEscenario(campaignId, rows, url, lastSync) {
  if(!currentUser || !campaignId) return;
  try {
    await db.collection('workspaces').doc(WORKSPACE).collection('escenarios').doc(campaignId)
      .set({ rows: rows||[], url: url||'', lastSync: lastSync||Date.now(), _by: currentUser.uid }, {merge:true});
  } catch(e) { console.error('persistEscenario error', e); }
}
async function loadEscenarioFromStore(campaign) {
  if(!campaign || !campaign.id) return false;
  try {
    const doc = await db.collection('workspaces').doc(WORKSPACE).collection('escenarios').doc(campaign.id).get();
    if(!doc.exists) return false;
    const data = doc.data();
    if(!data || !Array.isArray(data.rows) || !data.rows.length) return false;
    campaign.escenarioRows = data.rows;
    if(data.url && !campaign.escenarioSheetUrl) campaign.escenarioSheetUrl = data.url;
    if(data.lastSync) campaign.escenarioLastSync = data.lastSync;
    // mirror into cache entry
    const cached = (_cache.campaigns||[]).find(x=>x.id===campaign.id);
    if(cached && cached !== campaign) { cached.escenarioRows = data.rows; cached.escenarioLastSync = data.lastSync; if(data.url && !cached.escenarioSheetUrl) cached.escenarioSheetUrl = data.url; }
    return true;
  } catch(e) { console.error('loadEscenarioFromStore error', e); return false; }
}

// --- Realtime listeners ---
function attachListeners() {
  // Detach any previous
  unsubscribers.forEach(u=>u());
  unsubscribers = [];

  const ws = db.collection('workspaces').doc(WORKSPACE);

  unsubscribers.push(ws.collection('campaigns').onSnapshot(snap => {
    // Firestore docs no longer hold the large fetched-sheet arrays (we strip
    // them in persistCampaigns). When a snapshot arrives, preserve those
    // fields from the in-memory cache so the UI doesn't loop:
    //   strip → persist → snapshot → empty rows → re-fetch → write → snapshot...
    if(!Array.isArray(_cache.campaigns)) _cache.campaigns = [];
    const prev = new Map(_cache.campaigns.map(c => [c.id, c]));
    _cache.campaigns = snap.docs.map(d => {
      const incoming = _normalizarCampana(d.data());
      const existing = prev.get(incoming.id);
      if(!existing) return incoming;
      const merged = _normalizarCampana({...incoming});
      ['trackerRows','escenarioRows','ugcRows','cachedMetrics',
       'trackerLastSync','escenarioLastSync','ugcLastSync'].forEach(k => {
        if(existing[k] !== undefined && incoming[k] === undefined) merged[k] = existing[k];
      });
      return merged;
    });
    // El servidor acaba de decirnos qué hay: se re-siembran las huellas para
    // que persistCampaigns sepa qué NO necesita reescribir. Se normaliza el doc
    // del servidor con la MISMA función que la copia en memoria: si no,
    // _normalizarCampana añade `tasks: []` (o `clientContacts: []`, que es más
    // nuevo que muchos documentos) sólo del lado del cliente, las dos huellas
    // salen distintas y el primer setData('campaigns') del arranque reescribe
    // TODAS las campañas — con su tanda de snapshots y repintados detrás.
    // Rellenar un array vacío no es un cambio de contenido y no debe contar.
    try { _seedPersistedFp(snap.docs.map(d => _normalizarCampana(d.data()))); } catch(e){}
    if(typeof _invalidateInfMemo==='function') _invalidateInfMemo();
    rerenderCurrent();
  }, err => console.error('campaigns listener',err)));

  unsubscribers.push(ws.collection('globalTasks').onSnapshot(snap => {
    _cache.globalTasks = snap.docs.map(d => d.data());
    // El servidor acaba de decir qué hay: se re-siembran las huellas para que
    // el próximo setData('globalTasks') sepa qué NO necesita reescribir.
    try {
      _tareasFp.clear();
      snap.docs.forEach(d => { try { _tareasFp.set(d.id, _tareaFingerprint(d.data())); } catch(e){} });
    } catch(e){}
    rerenderCurrent();
  }, err => console.error('globalTasks listener',err)));

  unsubscribers.push(ws.collection('config').doc('settings').onSnapshot(doc => {
    _cache.settings = doc.exists ? doc.data() : {};
    rerenderCurrent();
  }, err => console.error('settings listener',err)));

  // Members listener — workspace-scoped so Firestore rules allow all workspace users to read
  unsubscribers.push(ws.collection('members').onSnapshot(snap => {
    allUsers = snap.docs.map(d => ({uid:d.id, ...d.data()}));
    if(currentPage==='ajustes') renderTeam();
    renderSidebarTeam();
    rerenderCurrent();
  }, err => console.error('members listener',err)));

  // Influencer ratings listener
  unsubscribers.push(ws.collection('influencerRatings').onSnapshot(snap => {
    _cache.influencerRatings = snap.docs.map(d => d.data());
    if(typeof _invalidateInfMemo==='function') _invalidateInfMemo();
    if(currentPage==='influencers') renderInfluencers();
  }, err => console.error('influencerRatings listener',err)));

  // Portada del login: listener global (se aplica a todos los usuarios)
  try { setupCoverSync(); } catch(e){}

  // ThinkyPesos — cada doc es UNA entrega (de quién, a quién, cuánto, por qué).
  // El abono mensual de 10 no se guarda: se deriva del periodo en thinky-peso.js.
  unsubscribers.push(ws.collection('thinkyPesos').onSnapshot(snap => {
    _cache.thinkyPesos = snap.docs.map(d => d.data());
    if(typeof tpOnData==='function') tpOnData();
  }, err => console.error('thinkyPesos listener',err)));

  // Base de clientes: la gente del lado del cliente. Vive aparte de las
  // campañas porque tiene que sobrevivir a que la saquen de una.
  unsubscribers.push(ws.collection('clients').onSnapshot(snap => {
    _cache.clients = snap.docs.map(d => d.data());
    if(currentPage === 'clientes' && typeof renderClientes === 'function') renderClientes();
  }, err => console.error('clients listener', err)));

  /* Eventos. Una campaña se ata a fechas que no ponemos nosotros (activaciones,
     premieres, el evento del cliente) y eso no es un pendiente: no se marca
     como hecho ni tiene quien lo entregue. Ver js/events.js. */
  unsubscribers.push(ws.collection('events').onSnapshot(snap => {
    _cache.events = snap.docs.map(d => d.data());
    try { if(typeof renderEventos === 'function' && currentPage === 'pendientes') renderEventos(); } catch(e){}
    try {
      if(typeof renderCampaignEventos === 'function' && currentPage === 'campannas' && currentCampaignId) {
        const c = (_cache.campaigns||[]).find(x => x.id === currentCampaignId);
        if(c) renderCampaignEventos(c);
      }
    } catch(e){}
  }, err => console.error('events listener',err)));

  // Master creators DB listener (base de datos de talento)
  unsubscribers.push(ws.collection('creators').onSnapshot(snap => {
    _cache.creators = snap.docs.map(d => d.data());
    _cache._creatorsLoaded = true;
    if(typeof _invalidateInfMemo==='function') _invalidateInfMemo();
    if(currentPage==='influencers') renderInfluencers();
  }, err => console.error('creators listener',err)));
}

// Una campaña que llega sin `tasks`, `influencers` o `documents` tumbaba el
// tablero entero: renderDashboard hace `c.tasks.forEach` y renderCampaignGrid
// lee `c.influencers.length`, así que un solo documento incompleto —importado,
// escrito por una versión anterior o recortado a mano en la consola— dejaba a
// TODO el equipo con el Resumen y la lista de campañas en blanco. Se normaliza
// al entrar, que es el único punto por el que pasan todas.
const _CAMPAIGN_ARRAYS = ['tasks','influencers','documents','flowSteps','clientContacts'];
function _normalizarCampana(c) {
  if(!c || typeof c !== 'object') return c;
  _CAMPAIGN_ARRAYS.forEach(k => { if(!Array.isArray(c[k])) c[k] = []; });
  return c;
}

function visibleCampaigns() {
  return _cache.campaigns.filter(c => canSeeCampaign(c));
}

/* MIS campañas: en las que esta persona está metida de verdad.
   No es lo mismo que visibleCampaigns(): un admin PUEDE VER todas, y mezclarlas
   convertía su tablero y su calendario en el de la agencia entera. Las próximas
   publicaciones de una campaña que no llevas no son tuyas — enterrar las que sí
   entre setenta que no es la forma más rápida de no ver ninguna.

   Cuenta estar asignado, ser responsable de un área, seguirla, o haberla creado.
   Lo último porque quien la armó suele seguir encima aunque nadie la haya
   etiquetado todavía, y hacerla desaparecer de su propio tablero sorprende. */
function misCampanas() {
  if(!currentUser) return [];
  const uid = currentUser.uid;
  return (_cache.campaigns || []).filter(c =>
    (typeof esResponsableDe === 'function' && esResponsableDe(c, uid)) ||
    (typeof isSubscribed === 'function' && isSubscribed(c.id)) ||
    c.createdBy === uid
  );
}

/* Repintar la página entera es caro y VISIBLE: `innerHTML` tira todo el
   subárbol y lo vuelve a construir, así que cada llamada apaga y enciende cada
   icono de la vista. En el arranque llegan seguidos los snapshots iniciales de
   campaigns, globalTasks, config y members —más los que devuelven las
   escrituras de migración—, y cada uno pedía su propio repintado completo: la
   app se reconstruía media docena de veces en los dos primeros segundos y se
   veía como un parpadeo general.

   Se agrupan en un solo repintado por frame. Ninguna de las llamadas lee el DOM
   justo después (los listeners no devuelven nada y los del tablero sólo
   commitean el dato), así que aplazar un frame no cambia el resultado — sólo
   evita pintar estados intermedios que nadie necesita ver. */
let _repintadoPedido = false;
function rerenderCurrent() {
  if(_repintadoPedido) return;
  _repintadoPedido = true;
  // rAF para pintar justo antes del frame, y un temporizador de respaldo porque
  // en una pestaña de fondo el navegador NO entrega frames: sin él, marcar una
  // tarea con la ventana detrás de otra no repintaría nada hasta volver. Gana
  // el primero que llegue; el otro se encuentra la bandera baja y no hace nada.
  const repintar = () => { if(!_repintadoPedido) return; _repintadoPedido = false; _repintarAhora(); };
  requestAnimationFrame(repintar);
  setTimeout(repintar, 250);
}

function _repintarAhora() {
  // La credencial puede estar abierta encima de cualquier página: su tira de
  // campañas depende de estos mismos datos.
  try { if(typeof refreshHoloCamps==='function') refreshHoloCamps(); } catch(e){}
  // Y sus stickers de marca: el logo vive en el documento de la campaña, así
  // que hasta este momento no había imagen que pegar.
  try { if(typeof refreshHoloStickers==='function') refreshHoloStickers(); } catch(e){}
  if(currentPage==='dashboard') renderDashboard();
  else if(currentPage==='campannas') {
    if(currentCampaignId) {
      const c = _cache.campaigns.find(x=>x.id===currentCampaignId);
      // Sólo la pestaña que se está viendo. Repintar las seis en cada snapshot
      // reconstruía cinco listas que nadie mira —incluida la tabla del tracker,
      // que es la más cara de la app— y además hacía que al abrir cualquier
      // pestaña el contenido ya llevara encima varios repintados. El resto se
      // pinta al entrar a la campaña y al cambiar de pestaña, que es cuando se
      // va a ver.
      if(c) { try { renderCampaignTab(c); } catch(e){ console.warn('campaign tab render', e); } }
    } else {
      renderCampaignGrid();
    }
  }
  else if(currentPage==='pendientes') { renderPendientes(); try { renderEventos(); } catch(e){} }
  else if(currentPage==='metricas') renderMetrics();
  else if(currentPage==='calendario') renderCalendar();
  else if(currentPage==='influencers') renderInfluencers();
  else if(currentPage==='thinkypeso' && typeof tpOnData==='function') tpOnData();
  populateCampaignSelects();
}

// ============================================================
// SAMPLE DATA
// ============================================================
function initSampleData() {
  // Deprecated: data now seeded to Firestore via seedSampleData() after auth.
  return;
  if (getData('_initialized')) return;
  const today = new Date();
  const fmt = (d) => d.toISOString().split('T')[0];
  const add = (d,days) => { const r=new Date(d); r.setDate(r.getDate()+days); return r; };

  const campaigns = [
    {
      id:'c1', name:'Mundial', client:'Coppel', status:'En proceso',
      season:'Abril - Junio 2024', objective:'Awareness', coreMessage:'Vive la pasión',
      budget:'$250,000 MXN', responsible:'Génesis', deadline: fmt(add(today,22)),
      flowSteps: FLOW_STEPS.map((s,i)=>({step:s, status: i<4?'Completado': i===4?'Pendiente aprobación': i===5?'En proceso':'Pendiente'})),
      influencers:[
        {id:id(),name:'Hanna',handle:'@hannamx',platform:'Instagram',format:'Reel',publishDate:fmt(add(today,1)),status:'Aprobado',reach:235678,impressions:456789,interactions:18765,er:'7.96%'},
        {id:id(),name:'Fer Jalil',handle:'@ferjalil',platform:'Instagram',format:'Story',publishDate:fmt(add(today,3)),status:'En producción',reach:0,impressions:0,interactions:0,er:'—'},
        {id:id(),name:'Mariana C.',handle:'@marianac',platform:'Instagram',format:'Story',publishDate:fmt(add(today,-3)),status:'Publicado',reach:92345,impressions:145678,interactions:5678,er:'6.15%'},
      ],
      documents:[
        {id:id(),name:'PRESS MUNDIAL_v3.pdf',type:'PDF',date:fmt(add(today,-1)),url:''},
        {id:id(),name:'BRIEF MUNDIAL.pdf',type:'PDF',date:fmt(add(today,-5)),url:''},
      ],
      tasks:[
        {id:id(),title:'Enviar follow up a César por SKUs Mundial',dueDate:fmt(today),priority:'high',done:false,assignee:'Génesis'},
        {id:id(),title:'Confirmar publicación de Hanna',dueDate:fmt(today),priority:'medium',done:false,assignee:'Génesis'},
        {id:id(),title:'Falta aprobar SKUs de 3 perfiles',dueDate:fmt(today),priority:'high',done:false,assignee:'Génesis'},
      ]
    },
    {
      id:'c2', name:'AON', client:'Sportline', status:'Ajustes',
      season:'Mayo 2024', objective:'Ventas', coreMessage:'Tu equipo, tu look',
      budget:'$180,000 MXN', responsible:'Génesis', deadline: fmt(add(today,21)),
      flowSteps: FLOW_STEPS.map((s,i)=>({step:s, status: i<3?'Completado': i===3?'Aprobado':'Pendiente'})),
      influencers:[
        {id:id(),name:'Fer Jalil',handle:'@ferjalil',platform:'Instagram',format:'Story',publishDate:fmt(add(today,-1)),status:'Publicado',reach:78245,impressions:120456,interactions:4321,er:'5.52%'},
        {id:id(),name:'Pao',handle:'@paorojas',platform:'Instagram',format:'Post',publishDate:fmt(add(today,4)),status:'Pendiente',reach:0,impressions:0,interactions:0,er:'—'},
      ],
      documents:[
        {id:id(),name:'BUDGET AON.xlsx',type:'Sheets',date:fmt(add(today,-2)),url:''},
      ],
      tasks:[
        {id:id(),title:'Revisar ajustes de costo en budget AON',dueDate:fmt(today),priority:'high',done:false,assignee:'Génesis'},
        {id:id(),title:'Falta enviar brief a 2 influencers',dueDate:fmt(today),priority:'medium',done:false,assignee:'Génesis'},
      ]
    },
    {
      id:'c3', name:'Semana Santa', client:'Avène', status:'En reporte',
      season:'Abril 2024', objective:'Awareness', coreMessage:'Tu piel, tu ritual',
      budget:'$120,000 MXN', responsible:'Génesis', deadline: fmt(add(today,25)),
      flowSteps: FLOW_STEPS.map((s,i)=>({step:s, status: i<8?'Completado': i===8?'En proceso':'Pendiente'})),
      influencers:[
        {id:id(),name:'Pao',handle:'@paorojas',platform:'Instagram',format:'Post',publishDate:fmt(add(today,-2)),status:'Publicado',reach:156789,impressions:289456,interactions:12345,er:'7.87%'},
        {id:id(),name:'Alex Tienda',handle:'@alextienda',platform:'TikTok',format:'Reel',publishDate:fmt(add(today,-2)),status:'Publicado',reach:344567,impressions:612345,interactions:28765,er:'8.33%'},
      ],
      documents:[
        {id:id(),name:'BRIEF SEMANA SANTA.pdf',type:'PDF',date:fmt(add(today,-2)),url:''},
        {id:id(),name:'REPORTE ABRIL.pdf',type:'PDF',date:fmt(add(today,-3)),url:''},
      ],
      tasks:[
        {id:id(),title:'Pedir métricas a Pao (Semana Santa)',dueDate:fmt(today),priority:'medium',done:false,assignee:'Génesis'},
        {id:id(),title:'Consolidar métricas',dueDate:fmt(add(today,5)),priority:'low',done:false,assignee:'Génesis'},
      ]
    }
  ];

  setData('campaigns', campaigns);
  setData('globalTasks', [
    {id:id(),title:'Actualizar minuta del weekly',campaignId:'',campaignName:'Interno',dueDate:fmt(today),priority:'medium',done:false,assignee:'Génesis'},
  ]);
  setData('_initialized', true);
}

// ============================================================
// NAVIGATION
// ============================================================
let currentPage = 'dashboard';
let currentCampaignId = null;
let currentTaskContext = null; // 'global' or campaignId
let editingCampaignId = null;
let editingTaskId = null;
let editingTaskCampaignId = null;

// Pendientes vive en el sidebar (escritorio) y en la nav inferior (móvil).
// El botón del topbar y el FAB duplicado se eliminaron: mismo destino, mismo
// badge, tres lugares distintos.
function setPendientesBadge(count) {
  _setTBadge('sidebarPendBadge', count);
  _setTBadge('mobileNavBadge', count);
}
// Recompute pending-task count for the FAB badge from any page (mirrors the
// "mis pendientes" logic: my/unassigned tasks not done, across global + campaigns).
function _refreshPendCount() {
  if(!currentUser) return;
  let n = 0;
  const mine = t => !t.done && (!t.assigneeUid || t.assigneeUid === currentUser.uid);
  (getData('globalTasks')||[]).forEach(t => { if(mine(t)) n++; });
  // misCampanas() y no visibleCampaigns(): el badge cuenta MIS pendientes, y
  // para un admin "visible" es el workspace entero.
  (misCampanas()||[]).forEach(c => (c.tasks||[]).forEach(t => { if(mine(t)) n++; }));
  setPendientesBadge(n);
}
// Render a number into an element as a transitions.dev .t-digit-group,
// replaying the staggered pop-in only when the value actually changes.
// Idempotent: if the new value equals the previous one, do nothing.
function _renderDigitPop(elOrId, value) {
  const el = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
  if(!el) return;
  const str = String(value);
  if(el.dataset.dval === str) return; // no change → no replay
  el.dataset.dval = str;
  el.classList.add('t-digit-group');
  el.classList.remove('is-animating');
  // Build digit spans with staggered indices
  el.innerHTML = '';
  for(let i=0;i<str.length;i++){
    const sp = document.createElement('span');
    sp.className = 't-digit';
    sp.textContent = str[i];
    if(i > 0) sp.dataset.stagger = String(Math.min(i, 6));
    el.appendChild(sp);
  }
  // Force reflow then add .is-animating so the keyframe replays
  void el.offsetWidth;
  el.classList.add('is-animating');
}

// Spawn a transient success check icon with the .t-success-check
// pack animation. Usage: showSuccessCheck() (centred overlay) or
// showSuccessCheck(anchorEl) to position it over a given element.
function showSuccessCheck(anchor) {
  const el = document.createElement('span');
  el.className = 't-success-check';
  el.setAttribute('aria-hidden','true');
  el.setAttribute('data-state','out');
  el.style.position = 'fixed';
  el.style.zIndex = '100001';
  el.style.pointerEvents = 'none';
  if(anchor && anchor.getBoundingClientRect) {
    const r = anchor.getBoundingClientRect();
    el.style.left = (r.left + r.width/2 - 28)+'px';
    el.style.top  = (r.top + r.height/2 - 28)+'px';
  } else {
    el.style.left = 'calc(50% - 28px)';
    el.style.top  = 'calc(50% - 28px)';
  }
  el.innerHTML = `
    <svg width="56" height="56" viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="22" stroke="var(--pink)" stroke-width="3"/>
      <path d="M14 25 L21 32 L34 18" stroke="var(--pink)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    </svg>`;
  document.body.appendChild(el);
  // Compute path length for accurate stroke-draw
  try {
    const path = el.querySelector('path');
    const len = path.getTotalLength ? Math.ceil(path.getTotalLength()) : 30;
    path.style.strokeDasharray = String(len);
    path.style.strokeDashoffset = String(len);
  } catch(e){}
  // Force reflow then trigger
  void el.offsetWidth;
  el.setAttribute('data-state','in');
  setTimeout(() => {
    el.style.transition = 'opacity .35s ease';
    el.style.opacity = '0';
    setTimeout(()=>el.remove(), 380);
  }, 1100);
}

// Trigger a shake on a .t-input element. Optional revert timer flips
// .is-error back off after --revert-hold ms.
function shakeInput(el, opts = {}) {
  if(!el) return;
  const wrap = el.closest('.t-input-wrap');
  el.classList.remove('is-shaking');
  if(wrap) wrap.classList.add('is-error');
  el.classList.add('is-error');
  // Force reflow so the keyframe replays
  void el.offsetWidth;
  el.classList.add('is-shaking');
  if(opts.revert !== false) {
    const hold = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--revert-hold')) || 3000;
    setTimeout(() => {
      if(wrap) wrap.classList.remove('is-error');
      el.classList.remove('is-error');
      el.classList.remove('is-shaking');
    }, hold);
  }
}

// Drive a .t-badge element (open/close + dot text). Wraps the
// transitions.dev badge pack so any badge in the app can use the
// same slide-in + pop API.
function _setTBadge(id, count) {
  const el = document.getElementById(id);
  if(!el) return;
  const dot = el.querySelector('.t-badge-dot');
  const n = parseInt(count)||0;
  const txt = n > 9 ? '9+' : String(n || '');
  if(dot && dot.textContent !== txt) dot.textContent = txt;
  // Solo si cambió: esto corre en cada render de la campanita y del contador de
  // pendientes, y data-open lo vigila el observador de liquid-glass. Reescribir
  // el mismo valor no cambia nada en pantalla pero sí genera trabajo.
  const abierto = n > 0 ? 'true' : 'false';
  if(el.getAttribute('data-open') !== abierto) el.setAttribute('data-open', abierto);
}

// ============================================================
// THEME TOGGLE (dark / light / auto)
// ============================================================
function getThemePref() { return localStorage.getItem('themePref') || 'auto'; }

// En modo auto aplicamos la clase según el sistema: muchos overrides del tema
// (glass v2) solo existen como `html.dark` y no cubren el media query solo.
const _sysDarkMQ = window.matchMedia('(prefers-color-scheme: dark)');
_sysDarkMQ.addEventListener('change', () => { if(getThemePref()==='auto') applyThemePref('auto'); });
function applyThemePref(pref) {
  document.documentElement.classList.remove('dark', 'light');
  const dark = pref === 'dark' || (pref !== 'light' && _sysDarkMQ.matches);
  document.documentElement.classList.add(dark ? 'dark' : 'light');
  localStorage.setItem('themePref', pref);
  const btn = document.getElementById('themeToggleBtn');
  if(!btn) return;
  const icons  = { dark:'🌙', light:'☀️', auto:'✦' };
  const labels = { dark:'Modo oscuro', light:'Modo claro', auto:'Modo automático (sistema)' };
  btn.title = labels[pref] || 'Modo automático';
  // Use the t-icon-swap container if present (animates between two icons)
  const swap = document.getElementById('themeToggleSwap');
  if(swap) {
    const a = swap.querySelector('[data-icon="a"]');
    const b = swap.querySelector('[data-icon="b"]');
    // Cycle between two visible states; load icon strings on the inactive one.
    const cur = swap.getAttribute('data-state') || 'a';
    const target = cur === 'a' ? 'b' : 'a';
    const targetEl = target === 'a' ? a : b;
    if(targetEl) targetEl.textContent = icons[pref] || '✦';
    swap.setAttribute('data-state', target);
  } else {
    btn.textContent = icons[pref] || '✦';
  }
}

function cycleTheme() {
  const order = ['auto', 'dark', 'light'];
  const next = order[(order.indexOf(getThemePref()) + 1) % 3];
  applyThemePref(next);
}

applyThemePref(getThemePref());

// ============================================================
// BARRA LATERAL: fija / al pasar el mouse / solo iconos
// ============================================================
// 'auto' es el modo nuevo: la barra se queda en riel de iconos y el panel se
// abre ENCIMA del contenido al pasar el mouse. Expandirla dentro del flujo
// movería toda la página cada vez que el cursor la roza; abrirla encima no.
// El riel reusa el layout de `.compact`, que ya existía.
const SIDEBAR_MODES = ['fija', 'auto', 'iconos'];
function getSidebarMode() {
  const saved = localStorage.getItem('sidebarMode');
  if(SIDEBAR_MODES.includes(saved)) return saved;
  // Migración del switch viejo de "Sidebar compacto".
  return localStorage.getItem('sidebarCompact') === '1' ? 'iconos' : 'fija';
}
function applySidebarMode(mode) {
  const sb = document.getElementById('mainSidebar');
  if(!sb) return;
  sb.classList.remove('sb-fija', 'sb-auto', 'sb-iconos', 'compact');
  sb.classList.add('sb-' + mode);
  if(mode !== 'fija') sb.classList.add('compact');
  document.querySelectorAll('#sidebarModePicker .sb-mode').forEach(b =>
    b.classList.toggle('on', b.dataset.mode === mode));
}
function setSidebarMode(mode) {
  if(!SIDEBAR_MODES.includes(mode)) mode = 'fija';
  localStorage.setItem('sidebarMode', mode);
  // Se sigue escribiendo la llave vieja: si alguien abre una pestaña con la
  // versión anterior cargada, la barra no se le descuadra.
  localStorage.setItem('sidebarCompact', mode === 'iconos' ? '1' : '0');
  applySidebarMode(mode);
}
// Compat con el switch anterior por si quedó alguna llamada suelta.
function toggleCompactSidebar(on) { setSidebarMode(on ? 'iconos' : 'fija'); }

function _initSidebarUI() {
  applySidebarMode(getSidebarMode());

  // El texto de cada item viene como nodo suelto en el HTML. Se envuelve para
  // poder esconderlo en modo riel sin que el renglón se parta: sin el span,
  // "Influencers" hace wrap dentro de un item de 44px y descuadra la columna.
  const NAV_DELAYS = ['var(--dur-stagger)','var(--dur-stagger)','var(--dur-micro)','var(--dur-micro)',
                     'var(--dur-quick)','var(--dur-quick)','var(--dur-quick)','var(--dur-fast)','var(--dur-fast)'];
  document.querySelectorAll('#mainSidebar .nav-item').forEach((item, i) => {
    // El escalonado de entrada va por variable, no por :nth-child: el marcador
    // y las etiquetas de sección también son hijos y corrían los índices.
    item.style.setProperty('--nav-delay', NAV_DELAYS[i] || 'var(--dur-fast)');
    if(item.querySelector('.nav-text')) return;
    [...item.childNodes].forEach(n => {
      if(n.nodeType !== 3 || !n.textContent.trim()) return;
      const span = document.createElement('span');
      span.className = 'nav-text';
      span.textContent = n.textContent.trim();
      item.replaceChild(span, n);
    });
  });

  // ── Marcador deslizante ──
  // Un solo bloque que persigue al item bajo el cursor, en vez de pintar y
  // despintar un fondo por item: el ojo sigue el salto y la navegación se
  // siente continua. El item activo conserva su píldora rosa; el marcador es
  // solo el hover, así no compiten dos superficies por el mismo lugar.
  const sec = document.getElementById('navSection');
  const marker = sec && sec.querySelector('.nav-marker');
  if(!sec || !marker) return;

  const move = el => {
    if(!el) return;
    marker.style.transform = `translateY(${el.offsetTop}px)`;
    marker.style.height = el.offsetHeight + 'px';
    marker.style.opacity = '1';
  };
  const hide = () => { marker.style.opacity = '0'; };

  sec.addEventListener('mouseover', e => {
    const item = e.target.closest('.nav-item');
    if(item && sec.contains(item)) move(item);
  });
  sec.addEventListener('mouseleave', hide);
  sec.addEventListener('focusin', e => {
    const item = e.target.closest('.nav-item');
    if(item) move(item);
  });
  sec.addEventListener('focusout', hide);
}
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _initSidebarUI);
else _initSidebarUI();

function toggleMobileSidebar() {
  const sidebar = document.getElementById('mainSidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const open = sidebar.classList.toggle('mobile-open');
  overlay.classList.toggle('open', open);
}

/* Marca una vista como "recién llegada" para que sus tarjetas hagan la entrada
   escalonada UNA vez. El CSS de esas animaciones cuelga de `.page.is-fresh`
   (ver assets/styles.css, bloque ANIMATIONS): sin esta marca, un repintado por
   datos no re-anima nada — que es justo lo que hacía parpadear la app entera,
   porque cada snapshot de Firestore recrea las listas con innerHTML y cada
   tarjeta nueva volvía a entrar desde opacidad 0.

   La marca se quita sola: dura lo que dura la entrada más larga (--dur-very-slow
   + su retardo), redondeado a 1.2s. Mientras esté puesta, un repintado sí
   re-anima; es una ventana tan corta que coincide con la propia entrada. */
function marcarFresco(el) {
  if(!el || !el.classList) return;
  el.classList.remove('is-fresh');
  void el.offsetWidth;                 // reinicia las animaciones ya corriendo
  el.classList.add('is-fresh');
  clearTimeout(el._frescoTimer);
  el._frescoTimer = setTimeout(() => el.classList.remove('is-fresh'), 1200);
}

function navigate(page) {
  document.querySelectorAll('.page').forEach(p=>{ p.classList.remove('active'); p.classList.remove('is-fresh'); });
  // La clase .active sólo pinta: el lector de pantalla no la ve. aria-current
  // es lo que hace que anuncie "página actual" al pasar por el item.
  document.querySelectorAll('.nav-item').forEach(n=>{ n.classList.remove('active'); n.removeAttribute('aria-current'); });
  document.querySelectorAll('.mobile-nav-item').forEach(n=>{ n.classList.remove('active'); n.removeAttribute('aria-current'); });
  const pageEl = document.getElementById('page-'+page);
  pageEl.classList.add('active');
  // Antes de que los render*() de abajo creen las tarjetas: la marca tiene que
  // estar puesta cuando nacen, o no les toca la animación de entrada.
  marcarFresco(pageEl);
  const navAct = document.querySelector(`.nav-item[data-page="${page}"]`);
  navAct?.classList.add('active'); navAct?.setAttribute('aria-current','page');
  const navMob = document.querySelector(`.mobile-nav-item[data-page="${page}"]`);
  navMob?.classList.add('active'); navMob?.setAttribute('aria-current','page');
  // close mobile sidebar on nav
  document.getElementById('mainSidebar')?.classList.remove('mobile-open');
  document.getElementById('sidebarOverlay')?.classList.remove('open');
  currentPage = page;
  // Persist current page so reload restores it
  try { localStorage.setItem('cmos:lastPage', page); } catch(e){}
  // Y a la barra de direcciones, para que Atrás funcione y el link se pueda
  // mandar por chat. Ver escribirRuta() más abajo.
  try { escribirRuta(); } catch(e){}

  // Chart.js ya no se carga en el arranque: se pide al entrar a Métricas,
  // en paralelo con el fetch del sheet, así llega antes de que se dibuje.
  if(page === 'metricas' && typeof _loadChartJs === 'function') _loadChartJs().catch(()=>{});

  const titles = {
    dashboard: ['Resumen','Lo que necesita tu atención hoy.','+ Nueva tarea'],
    campannas: ['Campañas','Gestiona todas tus campañas activas.','+ Nueva campaña'],
    pendientes: ['Pendientes','Todas tus tareas y pendientes.','+ Nueva tarea'],
    metricas: ['Métricas','Resultados en tiempo real.',''],
    generador: ['Generador de textos','Plantillas con IA para tus campañas.',''],
    influencers: ['Creadores','Toda la base de talento de Think Y.','+ Nueva tarea'],
    clientes: ['Clientes','Quién es quién del otro lado de la cuenta.',''],
    documentos: ['Documentos','Repositorio de archivos.','+ Nueva tarea'],
    calendario: ['Calendario','Vista de publicaciones.','+ Nueva tarea'],
    equipo: ['Equipo','Miembros del equipo Think Y.',''],
    thinkypeso: ['ThinkyPesos','Reconoce a quien se la rifó este mes.',''],
    effies: ['EFFies','7 casos finalistas en Effie® México.',''],
    ajustes: ['Ajustes','Configuración de la app.',''],
  };
  // Cambiar de página no recarga nada: para un lector de pantalla el foco se
  // queda donde estaba y no hay forma de saber que el contenido cambió. Se
  // manda al contenedor principal, que es tabindex="-1" justo para esto
  // (WCAG: focus-on-route-change).
  const principal = document.getElementById('contenidoPrincipal');
  if(principal) { try { principal.focus({ preventScroll:true }); } catch(e){} }

  const name = getSettings().name || 'Génesis';
  const t = titles[page] || [page,'',''];
  document.getElementById('topbarTitle').textContent = t[0];
  document.getElementById('topbarSub').textContent = t[1];
  if(typeof tdevReplay==='function') tdevReplay(document.querySelector('.topbar-left.t-stagger'));
  const btn = document.getElementById('mainActionBtn');
  if(btn) btn.style.display='none';

  if(page==='dashboard') renderDashboard();
  if(page==='campannas') { showCampaignList(); renderCampaignGrid(); }
  if(page==='pendientes') { renderPendientes(); try { renderEventos(); } catch(e){} }
  if(page==='metricas') renderMetrics();
  if(page==='calendario') renderCalendar();
  if(page==='generador') populateCampaignSelects();
  if(page==='documentos') renderDocumentosPage();
  if(page==='equipo') renderEquipo();
  if(page==='ajustes') loadSettingsUI();
  if(page==='influencers') renderInfluencers();
  if(page==='clientes') renderClientes();
  if(page==='thinkypeso') renderThinkyPeso();
  // El contador del ThinkyPeso no debe seguir latiendo detrás de otras páginas.
  else if(typeof tpTeardown==='function') tpTeardown();
  if(page==='effies') renderEffies();
  // El confeti y el contador de EFFies se apagan al salir de la pestaña.
  else if(typeof effiesTeardown==='function') effiesTeardown();
  try { _refreshPendCount(); } catch(e){}
}



// ============================================================
// RUTAS
// ============================================================
// La app no tocaba la barra de direcciones: el botón Atrás del navegador se
// salía de la aplicación en vez de volver a la vista anterior, y no había forma
// de mandarle a alguien el link de una campaña — había que decirle "entra a
// Campañas y búscala". Se usa el hash (#/campannas/<id>) porque el sitio es
// estático y no hay servidor que reescriba rutas reales.
// OJO: esta lista tiene que incluir TODAS las páginas que navigate() sabe abrir.
// Faltaba 'clientes' y el efecto era invisible al probar a mano: la pestaña se
// abría bien con el clic, pero el hash que escribía escribirRuta() ya no lo
// reconocía nadie, así que Atrás y recargar (y el link pegado en el chat) se
// quedaban en la vista anterior.
const _PAGINAS_VALIDAS = new Set(['dashboard','campannas','metricas','influencers',
  'clientes','documentos','calendario','generador','pendientes','equipo','ajustes',
  'thinkypeso','effies']);

// Bandera para no morderse la cola: aplicar una ruta llama a navigate(), que
// querría volver a escribir la ruta.
let _aplicandoRuta = false;

function rutaActual() {
  if(currentPage === 'campannas' && currentCampaignId) return '#/campannas/' + currentCampaignId;
  return '#/' + (currentPage || 'dashboard');
}

function escribirRuta(reemplazar) {
  if(_aplicandoRuta) return;
  const nueva = rutaActual();
  if(location.hash === nueva) return;
  // replaceState para el arranque (no debe quedar una entrada de historial
  // "vacía" antes de la primera vista) y pushState para la navegación real.
  try {
    if(reemplazar) history.replaceState(null, '', nueva);
    else history.pushState(null, '', nueva);
  } catch(e) { location.hash = nueva; }
}

// Devuelve true si logró aplicar algo, para que el arranque sepa si ya hay
// vista puesta o tiene que caer al localStorage.
function aplicarRuta(hash) {
  const partes = String(hash || location.hash || '').replace(/^#\/?/, '').split('/').filter(Boolean);
  const pagina = partes[0];
  if(!pagina || !_PAGINAS_VALIDAS.has(pagina)) return false;
  _aplicandoRuta = true;
  try {
    navigate(pagina);
    if(pagina === 'campannas') {
      const cid = partes[1];
      if(cid) {
        const c = (_cache.campaigns || []).find(x => x.id === cid);
        // Una campaña que ya no existe o a la que se perdió acceso no debe
        // dejar la pantalla en blanco: se cae al listado y se dice por qué.
        if(c && (typeof canSeeCampaign !== 'function' || canSeeCampaign(c))) {
          openCampaignDetail(cid);
        } else {
          showCampaignList();
          if(_cache._initialized) showToast('Esa campaña ya no está disponible.', 'error');
        }
      } else {
        showCampaignList();
      }
    }
  } finally {
    _aplicandoRuta = false;
  }
  return true;
}

// Atrás y Adelante del navegador.
window.addEventListener('popstate', () => { aplicarRuta(); });
// Y el caso de pegar un #/... a mano en la barra, que no dispara popstate.
window.addEventListener('hashchange', () => { if(!_aplicandoRuta) aplicarRuta(); });
