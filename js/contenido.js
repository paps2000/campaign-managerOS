/* Campaign OS — Contenido de la campaña: creadores y documentos
   ===============================================
   Los dos modales que cuelgan del detalle de una campaña: agregar creadores
   (a mano, pegando filas, o sincronizando un sheet) y agregar documentos, con
   detección del tipo a partir de la URL.
   Script CLÁSICO a propósito (NO type="module"): el HTML llama estas funciones
   desde atributos onclick/onchange, que sólo resuelven contra el scope global,
   y todos los archivos de js/ comparten ese mismo scope. El orden de <script>
   en index.html es el orden real de ejecución. */

function openAddInfluencerModal() {
  document.getElementById('fInfDate').value=hoyISO();
  ['fInfName','fInfHandle'].forEach(id=>document.getElementById(id).value='');
  openModal('influencerModal');
}

function saveInfluencer() {
  const name=document.getElementById('fInfName').value.trim();
  if(!name) { showToast('El nombre es requerido','error'); return; }
  if(!currentCampaignId) return;
  const campaigns=getData('campaigns');
  const c=campaigns.find(x=>x.id===currentCampaignId);
  if(!c) return;
  c.influencers.push({
    id:id(),
    name, handle:document.getElementById('fInfHandle').value,
    platform:document.getElementById('fInfPlatform').value,
    format:document.getElementById('fInfFormat').value,
    publishDate:document.getElementById('fInfDate').value,
    status:document.getElementById('fInfStatus').value,
    contenidos: parseInt(document.getElementById('fInfContenidos').value)||0,
    boosted: parseInt(document.getElementById('fInfBoosted').value)||0,
    reach:0,impressions:0,interactions:0,er:'—'
  });
  guardarCampana(c);
  renderCampaignInfluencers(c);
  closeModal('influencerModal');
  showToast('Influencer agregado','success');
}

// --- Import masivo de influencers (pegar CSV/TSV) ---
function openBulkImportModal() {
  if(!currentCampaignId) { showToast('Elige una campaña arriba para continuar.','error'); return; }
  const ov = document.createElement('div');
  ov.className = 'modal-overlay open';
  ov.id = 'bulkImportModal';
  ov.innerHTML = `<div class="modal" style="max-width:560px;">
    <div class="modal-header"><div class="modal-title">Importar influencers</div><button class="modal-close" onclick="document.getElementById('bulkImportModal').remove()"><span class="icn-close"></span></button></div>
    <div class="modal-body" style="padding:18px;">
      <p style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">Pega una fila por influencer. Columnas separadas por coma o tabulador (puedes copiar directo de Excel/Sheets):</p>
      <p style="font-size:11px;color:var(--text-muted);margin-bottom:10px;font-family:monospace;background:var(--bg);padding:8px 10px;border-radius:8px;">Nombre, @handle, Plataforma, Formato</p>
      <textarea id="bulkImportText" class="form-input" rows="9" style="font-size:13px;font-family:monospace;" placeholder="Crilon, @elcrilon, TikTok, Reel&#10;Ana López, @analopez, Instagram, Story"></textarea>
      <label style="display:flex;align-items:center;gap:8px;font-size:12px;margin-top:10px;cursor:pointer;"><input type="checkbox" id="bulkSkipHeader"> La primera fila es encabezado (ignorar)</label>
    </div>
    <div class="modal-footer"><button class="btn btn-ghost" onclick="document.getElementById('bulkImportModal').remove()">Cancelar</button><button class="btn btn-primary" onclick="runBulkImport()">Importar</button></div>
  </div>`;
  ov.addEventListener('click', e=>{ if(e.target===ov) ov.remove(); });
  document.body.appendChild(ov);
  setTimeout(()=>document.getElementById('bulkImportText')?.focus(),50);
}
function runBulkImport() {
  const raw = (document.getElementById('bulkImportText')?.value||'').trim();
  if(!raw) { showToast('Pega al menos una fila','error'); return; }
  const skipHeader = document.getElementById('bulkSkipHeader')?.checked;
  const campaigns = getData('campaigns');
  const c = campaigns.find(x=>x.id===currentCampaignId);
  if(!c) return;
  if(!Array.isArray(c.influencers)) c.influencers = [];
  let lines = raw.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  if(skipHeader) lines = lines.slice(1);
  const today = hoyISO();
  let added = 0;
  lines.forEach(line => {
    const parts = line.split(/\t|,/).map(p=>p.trim());
    const name = parts[0];
    if(!name) return;
    c.influencers.push({
      id:id(),
      name,
      handle: (parts[1]||'').replace(/^@/,''),
      platform: parts[2]||'',
      format: parts[3]||'',
      publishDate: today,
      status: 'Pendiente',
      contenidos:0, boosted:0, reach:0, impressions:0, interactions:0, er:'—'
    });
    added++;
  });
  if(!added) { showToast('No se detectaron filas válidas','error'); return; }
  guardarCampana(c);
  renderCampaignInfluencers(c);
  document.getElementById('bulkImportModal')?.remove();
  showToast(`${added} influencer${added!==1?'s':''} importado${added!==1?'s':''}`,'success');
}

function saveCampaignSheetsUrl() {
  if(!currentCampaignId) return;
  const url = document.getElementById('campaignSheetsUrl').value.trim();
  const campaigns = getData('campaigns');
  const c = campaigns.find(x=>x.id===currentCampaignId);
  if(!c) return;
  c.sheetsUrl = url;
  guardarCampana(c);
}

async function syncInfluencersFromSheets() {
  if(!currentCampaignId) return;
  const url = document.getElementById('campaignSheetsUrl').value.trim();
  if(!url) { showToast('Pega la URL del Google Sheet. La copias de la barra del navegador con el Sheet abierto.','error'); return; }
  // Extract spreadsheet ID
  const match = url.match(/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if(!match) { showToast('URL de Google Sheets inválida','error'); return; }
  const sheetId = match[1];
  const gvizUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json`;
  showToast('Sincronizando desde Sheets…');
  try {
    const res = await fetch(gvizUrl);
    const raw = await res.text();
    const json = JSON.parse(raw.replace(/^[^(]+\(/, '').replace(/\);?\s*$/, ''));
    const cols = json.table.cols.map(c => (c.label || '').toLowerCase().trim());
    const rows = json.table.rows || [];
    const idx = (names) => { for(const n of names) { const i=cols.indexOf(n); if(i>=0) return i; } return -1; };
    const iName = idx(['nombre','name','creador','creator','influencer']);
    const iHandle = idx(['handle','@handle','usuario','user']);
    const iPlatform = idx(['plataforma','platform','red social']);
    const iFormat = idx(['formato','format','tipo','type']);
    const iDate = idx(['fecha','date','fecha publicación','publish date']);
    const iStatus = idx(['status','estado','estatus']);
    const iReach = idx(['alcance','reach']);
    const iImpr = idx(['impresiones','impressions']);
    const iInter = idx(['interacciones','interactions','engagement']);
    const iEr = idx(['er','engagement rate','tasa']);
    if(iName < 0) { showToast('No se encontró columna "Nombre" en el Sheet','error'); return; }
    const campaigns = getData('campaigns');
    const c = campaigns.find(x=>x.id===currentCampaignId);
    if(!c) return;
    const cell = (row, i) => i>=0 && row.c[i] ? (row.c[i].v != null ? String(row.c[i].v) : row.c[i].f || '') : '';
    let added = 0, updated = 0;
    rows.forEach(row => {
      if(!row.c) return;
      const name = cell(row, iName).trim();
      if(!name) return;
      const existing = c.influencers.find(inf => inf.name.toLowerCase() === name.toLowerCase());
      if(existing) {
        if(iHandle>=0) existing.handle = cell(row,iHandle) || existing.handle;
        if(iPlatform>=0) existing.platform = cell(row,iPlatform) || existing.platform;
        if(iFormat>=0) existing.format = cell(row,iFormat) || existing.format;
        if(iDate>=0) existing.publishDate = cell(row,iDate) || existing.publishDate;
        if(iStatus>=0) existing.status = cell(row,iStatus) || existing.status;
        if(iReach>=0) existing.reach = parseInt(cell(row,iReach))||existing.reach;
        if(iImpr>=0) existing.impressions = parseInt(cell(row,iImpr))||existing.impressions;
        if(iInter>=0) existing.interactions = parseInt(cell(row,iInter))||existing.interactions;
        if(iEr>=0) existing.er = cell(row,iEr) || existing.er;
        updated++;
      } else {
        c.influencers.push({
          id: id(), name,
          handle: cell(row,iHandle) || '',
          platform: cell(row,iPlatform) || 'Instagram',
          format: cell(row,iFormat) || 'Post',
          publishDate: cell(row,iDate) || '',
          status: cell(row,iStatus) || 'Pendiente',
          reach: parseInt(cell(row,iReach))||0,
          impressions: parseInt(cell(row,iImpr))||0,
          interactions: parseInt(cell(row,iInter))||0,
          er: cell(row,iEr) || '—'
        });
        added++;
      }
    });
    c.sheetsUrl = url;
    guardarCampana(c);
    renderCampaignInfluencers(c);
    showToast(`Sincronizado: ${added} nuevos, ${updated} actualizados`, 'success');
  } catch(err) {
    console.error('syncSheets error', err);
    showToast('Error al leer el Sheet. Verifica que sea público (compartido → "Cualquier persona con el enlace").', 'error');
  }
}

// === DOC URL HELPERS ===
function detectDocTypeFromUrl(url) {
  if(!url) return 'Otro';
  const u = url.toLowerCase();
  if(u.includes('docs.google.com/spreadsheets')) return 'Sheets';
  if(u.includes('docs.google.com/document')) return 'Doc';
  if(u.includes('docs.google.com/presentation')) return 'Presentación';
  if(u.includes('drive.google.com')) return 'Drive';
  if(u.endsWith('.pdf') || u.includes('.pdf?')) return 'PDF';
  if(u.endsWith('.xlsx') || u.endsWith('.csv')) return 'Sheets';
  if(u.endsWith('.docx')) return 'Doc';
  if(u.endsWith('.pptx')) return 'Presentación';
  return 'Otro';
}

function suggestTitleFromUrl(url) {
  if(!url) return '';
  try {
    const u = new URL(url);
    // Try filename in path
    const segs = u.pathname.split('/').filter(Boolean);
    let cand = segs[segs.length-1] || '';
    cand = decodeURIComponent(cand).replace(/[-_]/g,' ').replace(/\.[a-z0-9]+$/i,'');
    // Drive style /file/d/ID/view → use type label
    if(cand === 'view' || cand === 'edit' || /^[A-Za-z0-9_-]{20,}$/.test(cand) || cand === '') {
      const type = detectDocTypeFromUrl(url);
      return `Nuevo documento ${type}`;
    }
    return cand.charAt(0).toUpperCase() + cand.slice(1);
  } catch {
    return '';
  }
}

function onDocUrlInput() {
  const url = document.getElementById('fDocUrl').value.trim();
  const nameEl = document.getElementById('fDocName');
  const typeEl = document.getElementById('fDocType');
  // Auto-detect type
  typeEl.value = detectDocTypeFromUrl(url);
  // Only auto-fill title if empty (don't clobber edits)
  if(!nameEl.dataset.userEdited) nameEl.value = suggestTitleFromUrl(url);
}

function openAddDocModal() {
  document.getElementById('fDocDate').value=hoyISO();
  ['fDocName','fDocUrl'].forEach(id=>{
    const el=document.getElementById(id);
    el.value='';
    delete el.dataset.userEdited;
  });
  document.getElementById('fDocCampaignGroup').style.display = 'none';
  const cv = document.getElementById('fDocClientVisible'); if(cv) cv.checked = false;
  // mark name field as user-edited once they type
  document.getElementById('fDocName').oninput = (e) => { e.target.dataset.userEdited = '1'; };
  openModal('docModal');
}

function openAddDocModalGlobal() {
  document.getElementById('fDocDate').value=hoyISO();
  ['fDocName','fDocUrl'].forEach(id=>{
    const el=document.getElementById(id);
    el.value='';
    delete el.dataset.userEdited;
  });
  // Show campaign selector
  const grp = document.getElementById('fDocCampaignGroup');
  const sel = document.getElementById('fDocCampaign');
  const camps = visibleCampaigns();
  if(camps.length === 0) { showToast('Crea una campaña primero','error'); return; }
  sel.innerHTML = camps.map(c=>`<option value="${c.id}">${_esc(c.name)} (${_esc(c.client)})</option>`).join('');
  // Pre-select selected page campaign if any
  const pageSel = document.getElementById('docPageCampaign');
  if(pageSel && pageSel.value) sel.value = pageSel.value;
  grp.style.display = 'block';
  const cv = document.getElementById('fDocClientVisible'); if(cv) cv.checked = false;
  document.getElementById('fDocName').oninput = (e) => { e.target.dataset.userEdited = '1'; };
  openModal('docModal');
}

function saveDoc() {
  const name=document.getElementById('fDocName').value.trim();
  const url=document.getElementById('fDocUrl').value.trim();
  if(!url) { showToast('El URL es requerido','error'); return; }
  if(!name) { showToast('El título es requerido','error'); return; }

  // Determine target campaign: explicit selector if shown, else currentCampaignId
  const grp = document.getElementById('fDocCampaignGroup');
  const targetCid = (grp && grp.style.display !== 'none')
    ? document.getElementById('fDocCampaign').value
    : currentCampaignId;
  if(!targetCid) { showToast('Elige una campaña arriba para continuar.','error'); return; }

  const campaigns=getData('campaigns');
  const c=campaigns.find(x=>x.id===targetCid);
  if(!c) return;
  if(!c.documents) c.documents = [];
  c.documents.push({
    id:id(), name,
    type:document.getElementById('fDocType').value,
    date:document.getElementById('fDocDate').value,
    url,
    clientVisible: !!document.getElementById('fDocClientVisible')?.checked,
    addedAt: Date.now(),
    addedBy: currentUser.uid
  });
  guardarCampana(c);
  if(currentCampaignId === targetCid) renderCampaignDocs(c);
  if(currentPage === 'documentos') renderDocumentosPage();
  closeModal('docModal');
  showToast('Documento agregado','success');
}

// === DOCUMENTOS PAGE ===
function renderDocumentosPage() {
  const camps = (typeof campanasEnAlcance === 'function') ? campanasEnAlcance() : visibleCampaigns();
  const sel = document.getElementById('docPageCampaign');
  const prev = sel.value;
  sel.innerHTML = '<option value="">— Selecciona una campaña —</option>' +
    camps.map(c=>`<option value="${c.id}">${_esc(c.name)} (${_esc(c.client)})</option>`).join('');
  if(prev && camps.find(c=>c.id===prev)) sel.value = prev;

  const list = document.getElementById('docPageList');
  const cid = sel.value;
  if(!cid) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">${ICN_doc}</div><p>Selecciona una campaña para ver sus documentos.</p></div>`;
    return;
  }
  const c = camps.find(x=>x.id===cid);
  if(!c) return;
  let docs = (c.documents||[]).slice();
  const search = document.getElementById('docPageSearch').value.toLowerCase().trim();
  if(search) docs = docs.filter(d => (d.name||'').toLowerCase().includes(search));

  const sort = document.getElementById('docPageSort').value;
  docs.sort((a,b)=>{
    if(sort==='alpha-asc') return (a.name||'').localeCompare(b.name||'');
    if(sort==='alpha-desc') return (b.name||'').localeCompare(a.name||'');
    if(sort==='added-asc') return (a.addedAt||0) - (b.addedAt||0);
    return (b.addedAt||0) - (a.addedAt||0);
  });

  if(docs.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">${ICN_doc}</div><p>Sin documentos en esta campaña.</p></div>`;
    return;
  }
  const docIcons={PDF:'📄',Sheets:'📊',Doc:'📝',Presentación:'📋',Drive:'📦',Otro:'📎'};
  list.innerHTML = docs.map(d=>`
    <div class="doc-item" style="padding:12px 0;${d.url?'cursor:pointer;':''}" ${d.url?`onclick="if(event.target.closest('button,a'))return;window.open('${_esc(_safeUrl(d.url))}','_blank','noopener')"`:''}>
      <div class="doc-icon ${d.type==='PDF'?'doc-pdf':'doc-sheets'}">${docIcons[d.type]||'📎'}</div>
      <div class="doc-info">
        <div class="doc-name">${_esc(d.name)}${(typeof _docVisToggleHtml==='function')?_docVisToggleHtml(c.id,d):''}</div>
        <div class="doc-campaign">${_esc(d.type)} · ${formatDateShort(d.date)||''}</div>
      </div>
      ${d.url?`<a href="${_esc(_safeUrl(d.url))}" target="_blank" rel="noopener" class="card-link" style="margin-right:8px;">Abrir →</a>`:''}
      <button onclick="event.stopPropagation();deleteDocFromPage('${c.id}','${d.id}')" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:14px;padding:4px;">✕</button>
    </div>`).join('');
}

function deleteDocFromPage(cid, docId) {
  const campaigns = getData('campaigns');
  const c = campaigns.find(x=>x.id===cid);
  if(!c) return;
  if(!puedeEditarCampana(c)) {
    showToast('Solo un admin, quien creó la campaña o un responsable de área pueden borrar documentos.','error'); return;
  }
  c.documents = (c.documents||[]).filter(d=>d.id!==docId);
  guardarCampana(c);
  renderDocumentosPage();
}
