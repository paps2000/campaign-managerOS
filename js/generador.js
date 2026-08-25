/* Campaign OS — Generador de textos
   ===================
   Plantillas con IA (follow up, brief, minuta) y el llenado de los <select> de
   campaña, que comparte con el resto de la app.
   Script CLÁSICO a propósito (NO type="module"): el HTML llama estas funciones
   desde atributos onclick/onchange, que sólo resuelven contra el scope global,
   y todos los archivos de js/ comparten ese mismo scope. El orden de <script>
   en index.html es el orden real de ejecución. */

// ============================================================
// TEXT GENERATOR
// ============================================================
/* Rellena los <select> de campaña.

   OJO con el innerHTML: rerenderCurrent() llama aquí en CADA snapshot de
   Firestore, y reescribir las <option> BORRA lo que la persona había elegido.
   Con el modal de tarea abierto, elegir una campaña y tardar un segundo en
   escribir el título bastaba para que el selector volviera solo a "— Sin
   campaña —": la tarea se guardaba como pendiente suelto, no aparecía dentro
   de la campaña, y desde fuera se veía como que el selector "no deja elegir".

   Dos defensas: no se toca el DOM si la lista de opciones es idéntica a la que
   ya está puesta (el caso normal), y si sí cambió se restaura la selección
   siempre que esa campaña siga existiendo. */
function populateCampaignSelects() {
  const campaigns = visibleCampaigns();
  const opts = campaigns.map(c=>`<option value="${c.id}">${_esc(c.name)} (${_esc(c.client)})</option>`).join('');
  const html = `<option value="">— Sin campaña —</option>` + opts;
  ['dashGenCampaign','fullGenCampaign','fTaskCampaign'].forEach(id=>{
    const el=document.getElementById(id);
    if(!el) return;
    if(el.dataset.optsFp === html) return;   // mismas campañas: no se toca nada
    const prev = el.value;
    el.dataset.optsFp = html;
    el.innerHTML = html;
    if(prev) {
      const sigue = Array.prototype.some.call(el.options, o => o.value === prev);
      if(sigue) el.value = prev;
    }
  });
}

async function generateText(scope) {
  const s = getSettings();
  const provider = s.aiProvider || 'anthropic';
  const apiKey = provider === 'openai' ? s.openaiApiKey : s.claudeApiKey;
  if(!apiKey) {
    showToast(`Agrega tu ${provider==='openai'?'OpenAI':'Claude'} API Key en Ajustes`, 'error'); return;
  }

  const typeEl = document.getElementById(scope==='dash'?'dashGenType':'fullGenType');
  const campEl = document.getElementById(scope==='dash'?'dashGenCampaign':'fullGenCampaign');
  const ctxEl  = document.getElementById('fullGenContext');
  const outEl  = document.getElementById(scope==='dash'?'dashGenOutput':'fullGenOutput');
  const actEl  = document.getElementById(scope==='dash'?'dashGenActions':'fullGenActions');
  const btnEl  = document.getElementById(scope==='dash'?'dashGenBtn':'fullGenBtn');

  const type = typeEl.value;
  const campId = campEl.value;
  const ctx = ctxEl?.value||'';

  const campaigns = getData('campaigns');
  const c = campaigns.find(x=>x.id===campId);
  // Sin _esc: esto va dentro de un prompt de texto plano, no de HTML. Escaparlo
  // metía entidades en el prompt —"Hellmann&#39;s"— y el modelo las copiaba tal
  // cual al texto que después se pega en un correo.
  const campInfo = c ? `Campaña: ${c.name}, Cliente: ${c.client}, Objetivo: ${c.objective||'—'}, Core message: ${c.coreMessage||'—'}` : 'Sin campaña específica';

  const prompts = {
    'Follow up cliente':   `Escribe un email corto y profesional de follow up para el cliente de esta campaña de influencer marketing. Tono: amable, ejecutivo, en español. ${campInfo}. Contexto adicional: ${ctx||'ninguno'}. Firma con el nombre del responsable.`,
    'Follow up influencer':`Escribe un mensaje corto de follow up para un influencer de esta campaña. Tono: cercano, profesional, en español. ${campInfo}. Contexto: ${ctx||'seguimiento general de entregables'}.`,
    'Brief':               `Escribe un brief creativo conciso para esta campaña de influencer marketing. Incluye: objetivo, mensaje clave, tono, formato sugerido, referencias de estilo. ${campInfo}. Contexto: ${ctx||'ninguno'}.`,
    'Minuta de reunión':   `Escribe una plantilla de minuta de reunión para esta campaña. Incluye: asistentes (dejar en blanco), puntos discutidos, acuerdos, próximos pasos con fechas. ${campInfo}. Contexto: ${ctx||'reunión de seguimiento'}.`,
    'Email de propuesta':  `Escribe un email de propuesta para presentar esta campaña al cliente. Tono ejecutivo, persuasivo, en español. Incluye saludo, contexto de la campaña, propuesta de valor, próximos pasos. ${campInfo}.`,
  };

  const prompt = prompts[type] || prompts['Follow up cliente'];

  btnEl.innerHTML = '<span class="loader"></span> Generando...';
  btnEl.disabled = true;
  outEl.style.display='block';
  outEl.textContent='Generando...';

  try {
    let resultText = '';
    if(provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+apiKey},
        body: JSON.stringify({model:'gpt-4o-mini',max_tokens:600,messages:[{role:'user',content:prompt}]})
      });
      const data = await res.json();
      if(data.error) throw new Error(data.error.message);
      resultText = data.choices[0].message.content;
    } else {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'x-api-key': apiKey,
          'anthropic-version':'2023-06-01',
          'anthropic-dangerous-direct-browser-access':'true'
        },
        body: JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:600,messages:[{role:'user',content:prompt}]})
      });
      const data = await res.json();
      if(data.error) throw new Error(data.error.message);
      resultText = data.content[0].text;
    }
    outEl.textContent = resultText;
    actEl.style.display='flex';
  } catch(e) {
    outEl.textContent = 'Error: '+e.message;
    showToast('Error generando texto: '+e.message,'error');
  }
  btnEl.innerHTML = '<span class="icn-inline"></span> Generar texto';
  btnEl.disabled = false;
}

function copyGenText(scope) {
  const outEl = document.getElementById(scope==='dash'?'dashGenOutput':'fullGenOutput');
  navigator.clipboard.writeText(outEl.textContent).then(()=>showToast('Texto copiado','success'));
}
