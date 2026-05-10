// ── app.js — Lector Académico PWA ─────────────────────────────────────────
'use strict';

// PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ── State ──────────────────────────────────────────────────────────────────
const state = {
  materias: [],
  lecturas: [],
  vista: 'pendientes',
  materiaFiltro: null,
  busqueda: '',
  planSeleccion: new Set(),
  planFecha: new Date().toISOString().split('T')[0],
  subFiltro: null,
  editingId: null,
  // Reader
  pdfDoc: null,
  pdfPage: 1,
  pdfLecturaId: null,
  highlightMode: false,
  highlightColor: '#FFE066',
  // Form
  pendingPdfData: null,
};

// ── DOM refs ───────────────────────────────────────────────────────────────
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

// ── Init ───────────────────────────────────────────────────────────────────
async function init() {
  await DB.open();
  await seedIfEmpty();
  await loadAll();
  bindEvents();
  renderAll();
}

async function loadAll() {
  state.materias = await DB.getAll('materias');
  state.lecturas = await DB.getAll('lecturas');
}

// ── Events ─────────────────────────────────────────────────────────────────
function bindEvents() {
  // Nav
  $$('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      setVista(btn.dataset.view);
    });
  });

  // Sidebar toggle (mobile)
  $('#sidebar-toggle').addEventListener('click', () => {
    $('#sidebar').classList.toggle('open');
  });

  // Click outside sidebar on mobile
  $('#main').addEventListener('click', () => {
    if (window.innerWidth <= 768) $('#sidebar').classList.remove('open');
  });

  // Search
  $('#search-input').addEventListener('input', (e) => {
    state.busqueda = e.target.value;
    renderVista();
  });

  // Add texto button
  $('#btn-add-texto').addEventListener('click', () => openModalTexto());

  // Add materia button
  $('#btn-add-materia').addEventListener('click', () => openModalMateria());

  // Modal texto
  $('#btn-save-texto').addEventListener('click', saveTexto);
  $('#f-materia').addEventListener('change', (e) => {
    populateUnidades(parseInt(e.target.value));
  });

  // File drop
  setupFileDrop();

  // Modal materia
  $('#btn-save-materia').addEventListener('click', saveMateria);
  buildColorPicker();

  // Modal closes
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-close') || e.target.classList.contains('modal-backdrop')) {
      closeAllModals();
    }
  });

  // Reader
  $('#reader-close').addEventListener('click', closeReader);
  $('#reader-prev').addEventListener('click', () => changePage(-1));
  $('#reader-next').addEventListener('click', () => changePage(1));
  $('#highlight-toggle').addEventListener('click', toggleHighlightMode);
  $$('.hc').forEach(btn => {
    btn.addEventListener('click', () => {
      state.highlightColor = btn.dataset.color;
      $$('.hc').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });

  // Detalle tabs
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('dtab')) {
      $$('.dtab').forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');
      renderDetalleTab(e.target.dataset.tab);
    }
  });

  // Plan fecha
  document.addEventListener('change', (e) => {
    if (e.target.id === 'plan-fecha') {
      state.planFecha = e.target.value;
      renderPlanificador();
    }
  });

  // Text selection for highlights (on text layer)
  document.addEventListener('mouseup', handleTextSelection);
  document.addEventListener('touchend', handleTextSelection);
}

// ── Vista ──────────────────────────────────────────────────────────────────
function setVista(v) {
  state.vista = v;
  state.materiaFiltro = null;
  $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  $$('.view').forEach(vv => vv.classList.toggle('active', vv.id === `view-${v}`));

  const titles = { pendientes: 'Pendientes', materias: 'Por Materia', planificador: 'Planificador', subrayados: 'Subrayados' };
  $('#topbar-title').textContent = titles[v] || v;

  const showSearch = v === 'pendientes' || v === 'materias';
  $('#search-input').parentElement.style.display = showSearch ? '' : 'none';

  renderVista();
}

function renderVista() {
  renderSidebar();
  if (state.vista === 'pendientes') renderPendientes();
  else if (state.vista === 'materias') renderMaterias();
  else if (state.vista === 'planificador') renderPlanificador();
  else if (state.vista === 'subrayados') renderSubrayados();
}

function renderAll() {
  renderSidebar();
  renderPendientes();
}

// ── Sidebar ────────────────────────────────────────────────────────────────
function renderSidebar() {
  const pendientes = state.lecturas.filter(l => !l.leido);
  const allSubs = state.lecturas.reduce((s, l) => s + l.subrayados.length, 0);
  const leidas = state.lecturas.filter(l => l.leido);
  const totalPags = state.lecturas.reduce((s, l) => s + l.paginas, 0);
  const leidasPags = leidas.reduce((s, l) => s + l.paginas, 0);
  const pct = totalPags ? Math.round((leidasPags / totalPags) * 100) : 0;

  // Badges
  const bp = $('#badge-pendientes');
  bp.textContent = pendientes.length || '';

  const bs = $('#badge-subrayados');
  bs.textContent = allSubs || '';

  // Progress
  $('#progress-pct').textContent = pct + '%';
  $('#progress-fill').style.width = pct + '%';
  $('#progress-sub').textContent = `${leidasPags} de ${totalPags} páginas leídas`;

  // Materias list
  const container = $('#sidebar-materias');
  container.innerHTML = '';

  state.materias.forEach(m => {
    const mLects = state.lecturas.filter(l => l.materia === m.id);
    const mPend = mLects.filter(l => !l.leido).length;
    const btn = document.createElement('button');
    btn.className = 'sidebar-materia' + (state.materiaFiltro === m.id ? ' active' : '');
    btn.style.setProperty('--m-color', m.color);
    btn.innerHTML = `
      <div class="sm-dot" style="background:${m.color}"></div>
      <span class="sm-label">${m.nombre}</span>
      ${mPend > 0 ? `<span class="sm-pending">${mPend}</span>` : ''}
      <span class="sm-count">${mLects.length}</span>
    `;
    btn.addEventListener('click', () => {
      state.materiaFiltro = state.materiaFiltro === m.id ? null : m.id;
      if (state.vista !== 'pendientes' && state.vista !== 'materias') setVista('pendientes');
      else renderVista();
      // Update active
      $$('.sidebar-materia').forEach(b => b.classList.remove('active'));
      if (state.materiaFiltro !== null) btn.classList.add('active');
    });
    container.appendChild(btn);
  });
}

// ── Pendientes ─────────────────────────────────────────────────────────────
function renderPendientes() {
  const el = $('#view-pendientes');
  let lects = filteredLecturas();
  const pendientes = lects.filter(l => !l.leido).sort((a, b) => sortByDeadline(a, b));
  const leidas = lects.filter(l => l.leido);

  let html = '';

  if (pendientes.length > 0) {
    const totalPags = pendientes.reduce((s, l) => s + l.paginas, 0);
    html += sectionHeader('Por leer', pendientes.length, `${totalPags} páginas pendientes`);
    html += '<div class="lectura-list">';
    pendientes.forEach(l => { html += lecturaCardHTML(l); });
    html += '</div>';
  } else {
    html += sectionHeader('Por leer', 0);
    html += `<div class="empty-state">¡Todo al día!<br>No hay textos pendientes en esta selección.</div>`;
  }

  if (leidas.length > 0) {
    html += sectionHeader('Leídos', leidas.length);
    html += '<div class="lectura-list">';
    leidas.forEach(l => { html += lecturaCardHTML(l); });
    html += '</div>';
  }

  el.innerHTML = html;
  bindCardEvents(el);
}

// ── Materias ───────────────────────────────────────────────────────────────
function renderMaterias() {
  const el = $('#view-materias');
  let html = '';

  const mats = state.materiaFiltro
    ? state.materias.filter(m => m.id === state.materiaFiltro)
    : state.materias;

  mats.forEach(m => {
    let lects = filteredLecturas().filter(l => l.materia === m.id);
    if (lects.length === 0) return;

    const leidas = lects.filter(l => l.leido).length;
    const totalPags = lects.reduce((s, l) => s + l.paginas, 0);
    const pct = lects.length ? Math.round((leidas / lects.length) * 100) : 0;

    html += `<div class="materia-section">`;
    html += `<div class="materia-header">
      <div class="materia-dot" style="background:${m.color}"></div>
      <span class="materia-name">${m.nombre}</span>
      <div class="materia-divider"></div>
      <span class="materia-stats">${leidas}/${lects.length} leídos · ${totalPags} págs</span>
    </div>`;
    html += `<div class="materia-progress">
      <div class="progress-track"><div class="progress-fill" style="width:${pct}%;background:${m.color}"></div></div>
    </div>`;

    // By unidad
    const unidades = [...new Set(lects.map(l => l.unidad))];
    unidades.forEach(u => {
      const uLects = lects.filter(l => l.unidad === u);
      html += `<div class="unidad-block">
        <div class="unidad-label" style="color:${m.color}">${u}</div>
        <div class="lectura-list">`;
      uLects.forEach(l => { html += lecturaCardHTML(l); });
      html += `</div></div>`;
    });

    html += `</div>`;
  });

  if (!html) html = `<div class="empty-state">No hay textos en esta selección.</div>`;
  el.innerHTML = html;
  bindCardEvents(el);
}

// ── Planificador ───────────────────────────────────────────────────────────
function renderPlanificador() {
  const el = $('#view-planificador');
  const sel = state.planSeleccion;
  const selLects = state.lecturas.filter(l => sel.has(l.id));
  const totalPags = selLects.reduce((s, l) => s + l.paginas, 0);
  const minHs = totalPags ? Math.ceil(totalPags / 25) : 0;
  const maxHs = totalPags ? Math.ceil(totalPags / 15) : 0;

  let html = `<div class="section-header"><span class="section-title">Planificador de sesión</span></div>
  <p class="section-sub">Elegí los textos que vas a leer y calculá el total de páginas.</p>`;

  html += `<div class="plan-header-row">
    <div class="plan-card">
      <div class="plan-card-label">Fecha de sesión</div>
      <input type="date" id="plan-fecha" value="${state.planFecha}" />
    </div>
    <div class="plan-card accent">
      <div class="plan-card-label">Total seleccionado</div>
      <div class="plan-number">${totalPags}</div>
      <div class="plan-number-sub">páginas · ${sel.size} texto${sel.size !== 1 ? 's' : ''}</div>
    </div>
    ${totalPags > 0 ? `<div class="plan-card gold">
      <div class="plan-card-label">Estimación</div>
      <div class="plan-number">${minHs}–${maxHs} hs</div>
      <div class="plan-number-sub">a 15–25 págs/hora</div>
    </div>` : ''}
  </div>`;

  const pendientes = state.lecturas.filter(l => !l.leido).sort(sortByDeadline);
  const mats = state.materias.filter(m => pendientes.some(l => l.materia === m.id));

  mats.forEach(m => {
    const mlects = pendientes.filter(l => l.materia === m.id);
    const mSelPags = mlects.filter(l => sel.has(l.id)).reduce((s, l) => s + l.paginas, 0);

    html += `<div style="margin-bottom:24px">
      <div class="materia-header" style="margin-bottom:10px">
        <div class="materia-dot" style="background:${m.color}"></div>
        <span class="materia-name" style="font-size:14px">${m.nombre}</span>
        <div class="materia-divider"></div>
        <span class="materia-stats">${mSelPags} págs selec.</span>
      </div>`;

    mlects.forEach(l => {
      const isSel = sel.has(l.id);
      const dias = diasRestantes(l.deadline);
      html += `<div class="plan-item ${isSel ? 'selected' : ''}" data-plan-id="${l.id}" style="--m-color:${m.color}">
        <div class="plan-check">${isSel ? '✓' : ''}</div>
        <span class="plan-item-title">${l.titulo}</span>
        <span class="plan-item-dl ${urgencyClass(dias)}">${formatDias(dias)}</span>
        <span class="plan-item-pgs">${l.paginas} p.</span>
      </div>`;
    });

    html += `</div>`;
  });

  if (pendientes.length === 0) html += `<div class="empty-state">No hay textos pendientes.</div>`;

  el.innerHTML = html;

  // Bind plan items
  el.querySelectorAll('.plan-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = parseInt(item.dataset.planId);
      if (state.planSeleccion.has(id)) state.planSeleccion.delete(id);
      else state.planSeleccion.add(id);
      renderPlanificador();
    });
  });
}

// ── Subrayados ─────────────────────────────────────────────────────────────
function renderSubrayados() {
  const el = $('#view-subrayados');
  const todos = state.lecturas.flatMap(l =>
    l.subrayados.map((s, i) => ({ ...s, lecturaId: l.id, subIdx: i, lecturaTitulo: l.titulo, materiaId: l.materia }))
  ).filter(s => state.subFiltro === null || s.materiaId === state.subFiltro);

  // Chips
  const matsConSubs = state.materias.filter(m =>
    state.lecturas.some(l => l.materia === m.id && l.subrayados.length > 0)
  );

  let html = `<div class="section-header"><span class="section-title">Subrayados</span><span class="section-count">(${todos.length})</span></div>
  <p class="section-sub">Extractos marcados de todos tus textos.</p>
  <div class="filter-chips">
    <button class="chip ${state.subFiltro === null ? 'active' : ''}" data-sub-filter="null" style="--chip-color:var(--ink2)">Todos</button>`;

  matsConSubs.forEach(m => {
    html += `<button class="chip ${state.subFiltro === m.id ? 'active' : ''}" data-sub-filter="${m.id}" style="--chip-color:${m.color}">${m.nombre}</button>`;
  });

  html += `</div>`;

  if (todos.length === 0) {
    html += `<div class="empty-state">No hay subrayados aún.<br>Abrí un texto y marcá los pasajes importantes.</div>`;
  } else {
    todos.forEach(s => {
      const materia = state.materias.find(m => m.id === s.materiaId);
      html += `<div class="sub-card" style="--hl-color:${s.color};--m-color:${materia?.color || 'var(--ink3)'}">
        <div class="sub-card-meta">
          <div class="sub-card-source">
            <span class="sub-materia">${materia?.nombre || ''}</span>
            <span class="sub-titulo">— ${s.lecturaTitulo}</span>
            ${s.pagina ? `<span class="sub-pagina">p. ${s.pagina}</span>` : ''}
          </div>
          <button class="sub-delete" data-del-lectura="${s.lecturaId}" data-del-idx="${s.subIdx}">✕</button>
        </div>
        <div class="sub-quote">${escapeHtml(s.texto)}</div>
      </div>`;
    });
  }

  el.innerHTML = html;

  // Bind chips
  el.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const f = chip.dataset.subFilter;
      state.subFiltro = f === 'null' ? null : parseInt(f);
      renderSubrayados();
    });
  });

  // Bind deletes
  el.querySelectorAll('.sub-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const lecturaId = parseInt(btn.dataset.delLectura);
      const idx = parseInt(btn.dataset.delIdx);
      const l = state.lecturas.find(x => x.id === lecturaId);
      if (!l) return;
      l.subrayados.splice(idx, 1);
      await DB.put('lecturas', l);
      renderSidebar();
      renderSubrayados();
    });
  });
}

// ── Lectura Card HTML ──────────────────────────────────────────────────────
function lecturaCardHTML(l) {
  const m = state.materias.find(x => x.id === l.materia);
  const mColor = m?.color || 'var(--border)';
  const dias = diasRestantes(l.deadline);
  const uc = urgencyClass(dias);

  return `<div class="lectura-card ${l.leido ? 'leido' : ''}" data-id="${l.id}" style="--m-color:${mColor}">
    <div class="lc-check ${l.leido ? 'checked' : ''}" data-check="${l.id}" style="${l.leido ? `background:${mColor};border-color:${mColor}` : ''}">
      ${l.leido ? '✓' : ''}
    </div>
    <div class="lc-body">
      <div class="lc-titulo">${escapeHtml(l.titulo)}</div>
      <div class="lc-meta">
        ${m ? `<span class="lc-materia">${m.nombre}</span>` : ''}
        <span class="lc-unidad">${escapeHtml(l.unidad || '')}</span>
        ${l.subrayados.length > 0 ? `<span class="lc-sub-badge">✦ ${l.subrayados.length} subrayado${l.subrayados.length !== 1 ? 's' : ''}</span>` : ''}
      </div>
    </div>
    <div class="lc-right">
      <span class="lc-paginas">${l.paginas} p.</span>
      ${l.deadline ? `<span class="lc-deadline ${uc}">${formatDiasFull(dias, l.deadline)}</span>` : ''}
      ${l.hasPdf ? `<span class="lc-has-pdf">PDF ▸</span>` : ''}
    </div>
  </div>`;
}

function bindCardEvents(container) {
  container.querySelectorAll('.lectura-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.dataset.check) return;
      openDetalle(parseInt(card.dataset.id));
    });
  });

  container.querySelectorAll('.lc-check').forEach(chk => {
    chk.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = parseInt(chk.dataset.check);
      await toggleLeido(id);
    });
  });
}

// ── Detalle Modal ──────────────────────────────────────────────────────────
function openDetalle(id) {
  state.editingId = id;
  const l = state.lecturas.find(x => x.id === id);
  if (!l) return;
  const m = state.materias.find(x => x.id === l.materia);

  // Header badges
  const badges = $('#detalle-badges');
  badges.innerHTML = '';
  if (m) {
    const b = document.createElement('span');
    b.className = 'badge';
    b.style.cssText = `background:${m.color}22;color:${m.color};border:1px solid ${m.color}44`;
    b.textContent = m.nombre;
    badges.appendChild(b);
  }
  const b2 = document.createElement('span');
  b2.className = 'badge';
  b2.style.cssText = `background:var(--bg3);color:var(--ink3);border:1px solid var(--border)`;
  b2.textContent = l.unidad || '';
  badges.appendChild(b2);

  $('#detalle-titulo').textContent = l.titulo;

  const dias = diasRestantes(l.deadline);
  $('#detalle-meta').innerHTML = `
    <span class="meta-item"><strong>${l.paginas}</strong> páginas</span>
    ${l.deadline ? `<span class="meta-item ${urgencyClass(dias)}">Deadline: ${formatDate(l.deadline)}${dias !== null ? ` (${formatDias(dias)})` : ''}</span>` : ''}
    <span class="meta-item">${l.subrayados.length} subrayado${l.subrayados.length !== 1 ? 's' : ''}</span>
  `;

  $('#dtab-count').textContent = l.subrayados.length ? `(${l.subrayados.length})` : '';

  const actions = $('#detalle-actions');
  actions.innerHTML = `
    <button class="btn-primary btn-sm" id="btn-toggle-leido">${l.leido ? '↩ Marcar pendiente' : '✓ Marcar como leído'}</button>
    ${l.hasPdf ? `<button class="btn-ghost btn-sm" id="btn-open-pdf">📄 Leer PDF</button>` : ''}
    <button class="btn-ghost btn-sm" id="btn-edit-texto">✏ Editar</button>
  `;

  $('#btn-toggle-leido').addEventListener('click', async () => {
    await toggleLeido(id);
    openDetalle(id); // refresh
  });

  if (l.hasPdf) {
    $('#btn-open-pdf').addEventListener('click', () => {
      closeAllModals();
      openPdfReader(id);
    });
  }

  $('#btn-edit-texto').addEventListener('click', () => {
    closeAllModals();
    openModalTexto(id);
  });

  // Reset tabs
  $$('.dtab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'info'));
  renderDetalleTab('info');

  $('#modal-detalle').classList.remove('hidden');
}

function renderDetalleTab(tab) {
  const l = state.lecturas.find(x => x.id === state.editingId);
  if (!l) return;
  const m = state.materias.find(x => x.id === l.materia);
  const el = $('#detalle-tab-content');

  if (tab === 'info') {
    const dias = diasRestantes(l.deadline);
    el.innerHTML = `
      <div class="info-row"><span class="info-label">Materia</span><span class="info-value">${m?.nombre || '—'}</span></div>
      <div class="info-row"><span class="info-label">Unidad</span><span class="info-value">${l.unidad || '—'}</span></div>
      <div class="info-row"><span class="info-label">Páginas</span><span class="info-value">${l.paginas}</span></div>
      <div class="info-row"><span class="info-label">Deadline</span><span class="info-value ${urgencyClass(dias)}">${l.deadline ? formatDate(l.deadline) : '—'}</span></div>
      <div class="info-row"><span class="info-label">Estado</span><span class="info-value">${l.leido ? '✓ Leído' : 'Pendiente'}</span></div>
      <div class="info-row"><span class="info-label">PDF</span><span class="info-value">${l.hasPdf ? '✓ Cargado' : 'No cargado'}</span></div>
    `;
  }

  else if (tab === 'subrayados') {
    let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <span style="font-size:13px;color:var(--ink3)">${l.subrayados.length} subrayado${l.subrayados.length !== 1 ? 's' : ''}</span>
      <button class="btn-primary btn-sm" id="btn-show-add-sub">+ Agregar</button>
    </div>
    <div class="add-sub-form hidden" id="add-sub-form">
      <div class="field-group"><label>Texto</label>
        <textarea id="sub-texto" rows="3" placeholder="Pegá o escribí el pasaje…"></textarea>
      </div>
      <div style="display:flex;gap:12px;align-items:flex-end">
        <div class="field-group" style="flex:1;margin-bottom:0"><label>Página</label>
          <input type="number" id="sub-pagina" placeholder="Ej: 12" min="1" />
        </div>
        <div class="field-group" style="margin-bottom:0">
          <label>Color</label>
          <div class="hl-color-row" id="sub-color-row">
            ${[['#FFE066','Amarillo'],['#A8D8EA','Azul'],['#B8E0B0','Verde'],['#F4B8C8','Rosa']].map(([c,n]) =>
              `<div class="hl-swatch ${c === '#FFE066' ? 'selected' : ''}" data-hc="${c}" style="background:${c}" title="${n}"></div>`
            ).join('')}
          </div>
        </div>
        <button class="btn-primary btn-sm" id="btn-confirm-sub" style="margin-bottom:0">Guardar</button>
      </div>
    </div>`;

    if (l.subrayados.length === 0) {
      html += `<div class="empty-state" style="padding:24px 0">No hay subrayados. Usá el botón "Agregar" o el lector de PDF.</div>`;
    } else {
      l.subrayados.forEach((s, i) => {
        html += `<div class="sub-card" style="--hl-color:${s.color};--m-color:${m?.color || 'var(--ink3)'}">
          <div class="sub-card-meta">
            <div class="sub-card-source">
              ${s.pagina ? `<span class="sub-pagina">p. ${s.pagina}</span>` : ''}
            </div>
            <button class="sub-delete" data-dsub="${i}">✕</button>
          </div>
          <div class="sub-quote">${escapeHtml(s.texto)}</div>
        </div>`;
      });
    }

    el.innerHTML = html;

    let selColor = '#FFE066';

    el.querySelectorAll('.hl-swatch').forEach(sw => {
      sw.addEventListener('click', () => {
        selColor = sw.dataset.hc;
        el.querySelectorAll('.hl-swatch').forEach(s2 => s2.classList.toggle('selected', s2.dataset.hc === selColor));
      });
    });

    el.querySelector('#btn-show-add-sub')?.addEventListener('click', () => {
      el.querySelector('#add-sub-form').classList.toggle('hidden');
    });

    el.querySelector('#btn-confirm-sub')?.addEventListener('click', async () => {
      const txt = el.querySelector('#sub-texto').value.trim();
      if (!txt) return;
      const pag = el.querySelector('#sub-pagina').value;
      l.subrayados.push({ texto: txt, pagina: pag ? parseInt(pag) : null, color: selColor });
      await DB.put('lecturas', l);
      toast('Subrayado guardado');
      renderDetalleTab('subrayados');
      renderSidebar();
      $('#dtab-count').textContent = `(${l.subrayados.length})`;
    });

    el.querySelectorAll('.sub-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idx = parseInt(btn.dataset.dsub);
        l.subrayados.splice(idx, 1);
        await DB.put('lecturas', l);
        renderDetalleTab('subrayados');
        renderSidebar();
        $('#dtab-count').textContent = l.subrayados.length ? `(${l.subrayados.length})` : '';
      });
    });
  }

  else if (tab === 'notas') {
    el.innerHTML = `
      <label style="font-size:11px;color:var(--ink3);text-transform:uppercase;letter-spacing:0.06em;display:block;margin-bottom:8px">Notas personales</label>
      <textarea id="notas-area" placeholder="Reflexiones, preguntas, conexiones con otros textos…">${escapeHtml(l.notas || '')}</textarea>
      <button class="btn-primary btn-sm" id="btn-save-notas" style="margin-top:12px">Guardar notas</button>
    `;

    $('#btn-save-notas').addEventListener('click', async () => {
      l.notas = $('#notas-area').value;
      await DB.put('lecturas', l);
      toast('Notas guardadas');
    });
  }
}

// ── Modal Texto ────────────────────────────────────────────────────────────
function openModalTexto(id = null) {
  state.editingId = id;
  state.pendingPdfData = null;
  $('#modal-texto-title').textContent = id ? 'Editar texto' : 'Agregar texto';

  // Populate materia select
  const sel = $('#f-materia');
  sel.innerHTML = state.materias.map(m => `<option value="${m.id}">${m.nombre}</option>`).join('');

  if (id) {
    const l = state.lecturas.find(x => x.id === id);
    if (l) {
      $('#f-titulo').value = l.titulo;
      sel.value = l.materia;
      populateUnidades(l.materia, l.unidad);
      $('#f-paginas').value = l.paginas;
      $('#f-deadline').value = l.deadline || '';
    }
  } else {
    $('#f-titulo').value = '';
    $('#f-paginas').value = '';
    $('#f-deadline').value = '';
    populateUnidades(parseInt(sel.value));
  }

  const fs = $('#file-selected');
  fs.classList.add('hidden');
  fs.textContent = '';

  $('#modal-texto').classList.remove('hidden');
}

function populateUnidades(materiaId, selected = null) {
  const m = state.materias.find(x => x.id === materiaId);
  const sel = $('#f-unidad');
  if (m) {
    sel.innerHTML = m.unidades.map(u => `<option value="${u}" ${u === selected ? 'selected' : ''}>${u}</option>`).join('');
  } else {
    sel.innerHTML = '';
  }
}

async function saveTexto() {
  const titulo = $('#f-titulo').value.trim();
  const materiaId = parseInt($('#f-materia').value);
  const unidad = $('#f-unidad').value;
  const paginas = parseInt($('#f-paginas').value);
  const deadline = $('#f-deadline').value || null;

  if (!titulo || !paginas) { toast('Completá título y páginas'); return; }

  if (state.editingId) {
    const l = state.lecturas.find(x => x.id === state.editingId);
    Object.assign(l, { titulo, materia: materiaId, unidad, paginas, deadline });
    if (state.pendingPdfData) { await DB.put('pdfs', { lecturaId: l.id, data: state.pendingPdfData }); l.hasPdf = true; }
    await DB.put('lecturas', l);
    toast('Texto actualizado');
  } else {
    const nuevo = { titulo, materia: materiaId, unidad, paginas, deadline, leido: false, subrayados: [], notas: '', hasPdf: false };
    if (state.pendingPdfData) nuevo.hasPdf = true;
    const id = await DB.add('lecturas', nuevo);
    if (state.pendingPdfData) await DB.put('pdfs', { lecturaId: id, data: state.pendingPdfData });
    toast('Texto agregado');
  }

  state.pendingPdfData = null;
  await loadAll();
  closeAllModals();
  renderAll();
  renderVista();
}

// ── File Drop ──────────────────────────────────────────────────────────────
function setupFileDrop() {
  const drop = $('#file-drop');
  const input = $('#f-pdf');

  input.addEventListener('change', () => { if (input.files[0]) handlePdfFile(input.files[0]); });

  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('dragover'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('dragover');
    const f = e.dataTransfer.files[0];
    if (f && f.type === 'application/pdf') handlePdfFile(f);
  });
}

async function handlePdfFile(file) {
  const fs = $('#file-selected');
  fs.classList.remove('hidden');
  fs.textContent = '⏳ Leyendo PDF…';

  const reader = new FileReader();
  reader.onload = async (e) => {
    const data = e.target.result;
    try {
      const pdf = await pdfjsLib.getDocument({ data }).promise;
      const pages = pdf.numPages;

      // Auto fill title if empty
      if (!$('#f-titulo').value.trim()) {
        const name = file.name.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ');
        $('#f-titulo').value = name;
      }

      // Auto fill pages
      $('#f-paginas').value = pages;

      state.pendingPdfData = data;

      fs.innerHTML = `✓ ${escapeHtml(file.name)} — ${pages} páginas detectadas`;
      fs.style.color = 'var(--green)';
    } catch {
      fs.textContent = '✕ No se pudo leer el PDF';
      fs.style.color = '#E05555';
    }
  };
  reader.readAsArrayBuffer(file);
}

// ── Modal Materia ──────────────────────────────────────────────────────────
const MATERIA_COLORS = ['#C4531A','#2E6BA8','#5A8A3C','#8B4BAB','#C4853A','#2E8B7A','#A84B6E','#5A6EA8'];
let selectedColor = MATERIA_COLORS[0];

function buildColorPicker() {
  const cp = $('#color-picker');
  MATERIA_COLORS.forEach((c, i) => {
    const sw = document.createElement('div');
    sw.className = 'color-swatch' + (i === 0 ? ' selected' : '');
    sw.style.background = c;
    sw.addEventListener('click', () => {
      selectedColor = c;
      $$('.color-swatch').forEach(s => s.classList.remove('selected'));
      sw.classList.add('selected');
    });
    cp.appendChild(sw);
  });
}

function openModalMateria() {
  $('#m-nombre').value = '';
  $('#m-unidades').value = '';
  selectedColor = MATERIA_COLORS[0];
  $$('.color-swatch').forEach((s, i) => s.classList.toggle('selected', i === 0));
  $('#modal-materia').classList.remove('hidden');
}

async function saveMateria() {
  const nombre = $('#m-nombre').value.trim();
  const unidadesRaw = $('#m-unidades').value.trim();
  if (!nombre) { toast('Escribí el nombre de la materia'); return; }

  const unidades = unidadesRaw
    ? unidadesRaw.split('\n').map(u => u.trim()).filter(Boolean)
    : ['Unidad 1'];

  await DB.add('materias', { nombre, color: selectedColor, unidades });
  await loadAll();
  closeAllModals();
  renderSidebar();
  renderVista();
  toast('Materia creada');
}

// ── Toggle leído ───────────────────────────────────────────────────────────
async function toggleLeido(id) {
  const l = state.lecturas.find(x => x.id === id);
  if (!l) return;
  l.leido = !l.leido;
  await DB.put('lecturas', l);
  renderSidebar();
  renderVista();
}

// ── PDF Reader ─────────────────────────────────────────────────────────────
async function openPdfReader(lecturaId) {
  const record = await DB.get('pdfs', lecturaId);
  if (!record) { toast('PDF no encontrado'); return; }

  const l = state.lecturas.find(x => x.id === lecturaId);
  state.pdfLecturaId = lecturaId;
  state.pdfPage = 1;
  state.highlightMode = false;

  $('#reader-title').textContent = l?.titulo || 'Lector PDF';
  $('#reader-panel').classList.remove('hidden');
  $('#highlight-toggle').classList.remove('active');
  $('#highlight-colors').classList.add('hidden');

  state.pdfDoc = await pdfjsLib.getDocument({ data: record.data }).promise;
  await renderPdfPage();
}

async function renderPdfPage() {
  if (!state.pdfDoc) return;
  const page = await state.pdfDoc.getPage(state.pdfPage);
  const canvas = $('#pdf-canvas');
  const ctx = canvas.getContext('2d');

  const vw = $('#reader-body').clientWidth - 40;
  const viewport = page.getViewport({ scale: 1 });
  const scale = Math.min(vw / viewport.width, 1.8);
  const scaled = page.getViewport({ scale });

  canvas.width = scaled.width;
  canvas.height = scaled.height;

  await page.render({ canvasContext: ctx, viewport: scaled }).promise;

  // Text layer for selection
  const textLayer = $('#text-layer');
  textLayer.innerHTML = '';
  textLayer.style.width = scaled.width + 'px';
  textLayer.style.height = scaled.height + 'px';

  const textContent = await page.getTextContent();
  const spans = textContent.items.map(item => {
    const tx = pdfjsLib.Util.transform(scaled.transform || [scale,0,0,-scale,0,scaled.height], item.transform);
    const span = document.createElement('span');
    span.textContent = item.str + ' ';
    span.style.cssText = `position:absolute;left:${tx[4]}px;top:${tx[5]}px;font-size:${Math.abs(tx[3])}px;white-space:pre;color:transparent;`;
    textLayer.appendChild(span);
    return span;
  });

  $('#reader-page-info').textContent = `${state.pdfPage} / ${state.pdfDoc.numPages}`;
  $('#reader-prev').disabled = state.pdfPage <= 1;
  $('#reader-next').disabled = state.pdfPage >= state.pdfDoc.numPages;
}

function changePage(delta) {
  if (!state.pdfDoc) return;
  const next = state.pdfPage + delta;
  if (next < 1 || next > state.pdfDoc.numPages) return;
  state.pdfPage = next;
  renderPdfPage();
}

function closeReader() {
  $('#reader-panel').classList.add('hidden');
  state.pdfDoc = null;
  state.pdfLecturaId = null;
  state.highlightMode = false;
}

function toggleHighlightMode() {
  state.highlightMode = !state.highlightMode;
  const btn = $('#highlight-toggle');
  const colors = $('#highlight-colors');
  const textLayer = $('#text-layer');
  btn.classList.toggle('active', state.highlightMode);
  colors.classList.toggle('hidden', !state.highlightMode);
  textLayer.classList.toggle('selecting', state.highlightMode);
}

async function handleTextSelection() {
  if (!state.highlightMode || !state.pdfLecturaId) return;
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) return;
  const txt = sel.toString().trim();
  if (!txt || txt.length < 5) return;

  const l = state.lecturas.find(x => x.id === state.pdfLecturaId);
  if (!l) return;

  l.subrayados.push({ texto: txt, pagina: state.pdfPage, color: state.highlightColor });
  await DB.put('lecturas', l);
  sel.removeAllRanges();
  toast(`Subrayado guardado (p. ${state.pdfPage})`);
  renderSidebar();
}

// ── Utils ──────────────────────────────────────────────────────────────────
function filteredLecturas() {
  return state.lecturas.filter(l => {
    if (state.materiaFiltro !== null && l.materia !== state.materiaFiltro) return false;
    if (state.busqueda && !l.titulo.toLowerCase().includes(state.busqueda.toLowerCase())) return false;
    return true;
  });
}

function diasRestantes(deadline) {
  if (!deadline) return null;
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const d = new Date(deadline + 'T00:00:00');
  return Math.round((d - hoy) / 86400000);
}

function sortByDeadline(a, b) {
  if (!a.deadline && !b.deadline) return 0;
  if (!a.deadline) return 1;
  if (!b.deadline) return -1;
  return new Date(a.deadline) - new Date(b.deadline);
}

function urgencyClass(dias) {
  if (dias === null) return '';
  if (dias < 0) return 'urgency-over';
  if (dias <= 3) return 'urgency-soon';
  if (dias <= 7) return 'urgency-week';
  return 'urgency-ok';
}

function formatDias(dias) {
  if (dias === null) return '';
  if (dias < 0) return `Vencido`;
  if (dias === 0) return '¡Hoy!';
  return `${dias}d`;
}

function formatDiasFull(dias, deadline) {
  if (dias === null) return '';
  if (dias < 0) return `Vencido (${Math.abs(dias)}d)`;
  if (dias === 0) return '¡Hoy!';
  return `${dias}d · ${formatDate(deadline)}`;
}

function formatDate(str) {
  if (!str) return '—';
  const [y, m, d] = str.split('-');
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${parseInt(d)} ${meses[parseInt(m)-1]} ${y}`;
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function sectionHeader(title, count, sub) {
  return `<div class="section-header">
    <span class="section-title">${title}</span>
    <span class="section-count">(${count})</span>
  </div>${sub ? `<p class="section-sub">${sub}</p>` : ''}`;
}

function closeAllModals() {
  $$('.modal').forEach(m => m.classList.add('hidden'));
}

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.classList.add('hidden'), 200); }, 2000);
}

// ── Start ──────────────────────────────────────────────────────────────────
init();
