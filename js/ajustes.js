/* Campaign OS — Ajustes
   =======
   Las llaves de API se guardan en localStorage, no en Firestore: son de quien
   usa la máquina, no del workspace.
   Script CLÁSICO a propósito (NO type="module"): el HTML llama estas funciones
   desde atributos onclick/onchange, que sólo resuelven contra el scope global,
   y todos los archivos de js/ comparten ese mismo scope. El orden de <script>
   en index.html es el orden real de ejecución. */

// ============================================================
// SETTINGS
// ============================================================
function loadSettingsUI() {
  const s=getSettings();
  document.getElementById('settingsApiKey').value=s.claudeApiKey||'';
  document.getElementById('settingsOpenAiKey').value=s.openaiApiKey||'';
  const provider = s.aiProvider||'anthropic';
  const radio = document.getElementById(provider==='openai'?'aiProviderOpenAI':'aiProviderAnthropic');
  if(radio) radio.checked=true;
  // Sync Apariencia controls
  const currentTheme = currentUserProfile?.theme || 'default';
  THEME_SWATCHES.forEach(t => {
    const sw = document.getElementById('stTheme-'+t);
    if(sw) sw.classList.toggle('selected', t === currentTheme);
  });
  // El selector de color arranca con el color que ya tienes puesto, no con el
  // rosa de fábrica: si no, abrir Ajustes parecía ofrecerte cambiarlo.
  const _acc = currentUserProfile?.themeAccent;
  if(_acc) ['customAccentInput','customAccentInput2'].forEach(id => {
    const el = document.getElementById(id); if(el) el.value = _acc;
  });
  const currentMode = (typeof getThemePref==='function') ? getThemePref() : 'auto';
  document.querySelectorAll('.mode-btn').forEach(b => {
    b.classList.toggle('active', b.id === 'modeBtn-'+currentMode);
  });
  applySidebarMode(getSidebarMode());
  // Vista: densidad, tamaño de texto y las listas para acomodar dashboard y menú.
  if(typeof prefs === 'function') {
    const p = prefs();
    document.querySelectorAll('#densityPicker .seg-btn').forEach(b => b.classList.toggle('on', b.dataset.val === (p.density||'comodo')));
    document.querySelectorAll('#textSizePicker .seg-btn').forEach(b => b.classList.toggle('on', b.dataset.val === (p.textSize||'normal')));
    try { prefsRenderPanels(); } catch(e){}
  }
  renderTeam();
  if(typeof _renderEmailSettings === 'function') _renderEmailSettings();
}

function setModeBtn(mode) {
  applyThemePref(mode);
  document.querySelectorAll('.mode-btn').forEach(b => {
    b.classList.toggle('active', b.id === 'modeBtn-'+mode);
  });
}


function saveApiKeys() {
  const provider = document.querySelector('input[name="aiProvider"]:checked')?.value||'anthropic';
  saveSettingsData({
    claudeApiKey: document.getElementById('settingsApiKey').value,
    openaiApiKey: document.getElementById('settingsOpenAiKey').value,
    aiProvider: provider,
  });
  showToast('Configuración guardada','success');
}
function saveApiKey() { saveApiKeys(); }

async function resetAllData() {
  if(!await confirmar({
    title: '¿Borrar los datos guardados en este navegador?',
    body: 'Se van tus preferencias locales y las llaves de API que tengas guardadas. Las campañas y tareas del workspace NO se tocan: viven en el servidor.\n\nLa página se va a recargar.',
    confirmLabel: 'Borrar y recargar',
    danger: true,
  })) return;
  localStorage.clear();
  location.reload();
}

async function deleteCampaign() {
  if(!currentCampaignId) return;
  const campaigns = getData('campaigns');
  const c = campaigns.find(x=>x.id===currentCampaignId);
  if(!c) return;
  if(!isAdmin() && c.createdBy !== currentUser.uid) {
    showToast('Solo admin o creador puede eliminar','error'); return;
  }
  if(!await confirmar({
    title: `¿Eliminar la campaña "${c.name}"?`,
    body: 'Se va para todo el equipo, con sus tareas, documentos y creadores. No hay forma de recuperarla.',
    confirmLabel: 'Eliminar campaña',
    cancelLabel: 'Conservar',
    danger: true,
  })) return;
  // Colección entera a propósito: esto BORRA. persistCampaigns compara la
  // lista con lo que tiene registrado y elimina en Firestore lo que ya no está;
  // guardarCampana() no puede borrar nada, que es justo su gracia.
  const filtered = campaigns.filter(x=>x.id!==currentCampaignId);
  setData('campaigns', filtered);
  showCampaignList();
  showToast('Campaña eliminada','success');
}

async function nukeAllCampaigns() {
  if(!isAdmin()) { showToast('Borrar el workspace entero es cosa de admins.','error'); return; }
  // Antes eran dos confirms encadenados; el segundo no aportaba información
  // nueva y solo entrenaba a darle Aceptar sin leer. Uno solo, con el número
  // exacto de lo que se va, informa más que preguntar dos veces.
  const _nCamps = (getData('campaigns')||[]).length;
  const _nTasks = (getData('globalTasks')||[]).length;
  if(!await confirmar({
    title: `¿Borrar ${_nCamps} campañas y ${_nTasks} pendientes del workspace?`,
    body: 'Se van para TODO el equipo, no solo para ti, y no hay forma de recuperarlos.',
    confirmLabel: `Borrar las ${_nCamps} campañas`,
    cancelLabel: 'Cancelar',
    danger: true,
  })) return;
  // Colección entera a propósito: la lista vacía es lo que dispara el borrado.
  setData('campaigns', []);
  setData('globalTasks', []);
  showToast('Todas las campañas eliminadas','success');
  if(currentPage === 'campannas') { showCampaignList(); renderCampaignGrid(); }
  if(currentPage === 'dashboard') renderDashboard();
}
