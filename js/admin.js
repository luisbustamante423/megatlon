// ============ Panel administrativo — Megatlón ============
// Todo el CRUD es genérico: se construye a partir de lo que devuelve
// MegatlonDB.meta() (definido en js/data.js, mismas 14 tablas que
// server/schema.js). Para agregar/quitar campos de una tabla, se edita
// solo js/data.js (y opcionalmente server/schema.js si luego conectas
// tu base de datos real).

let USER = null;
let SCHEMA = null;
let TABLA_ACTUAL = null;
let REGISTRO_EDITANDO = null; // id del registro en edición, o null si es "nuevo"
let FILTRO_TIPO = 'todas';   // pestaña activa en Notificaciones (pago, solicitud, inicio_sesion…)

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ---------- Login ----------
$('#form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const correo = $('#login-correo').value.trim();
  const contraseña = $('#login-clave').value;
  const errorEl = $('#login-error');
  errorEl.hidden = true;

  try {
    const data = await MegatlonDB.login(correo, contraseña);
    USER = data.user;
    await iniciarPanel();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden = false;
  }
});

$('#btn-logout').addEventListener('click', cerrarSesion);

function cerrarSesion() {
  MegatlonDB.logout();
  USER = null;
  $('#pantalla-admin').hidden = true;
  $('#pantalla-login').hidden = false;
  $('#btn-nav-contenido').hidden = false;
}

// ---------- Arranque ----------
async function verificarSesionExistente() {
  try {
    USER = await MegatlonDB.me();
    await iniciarPanel();
  } catch {
    cerrarSesion();
  }
}

async function iniciarPanel() {
  $('#pantalla-login').hidden = true;
  $('#pantalla-admin').hidden = false;
  $('#admin-user-nombre').textContent = USER.nombre_completo || USER.correo;
  const codAdmin = $('#admin-user-codigo');
  if (codAdmin) { codAdmin.textContent = USER.codigo || ''; codAdmin.hidden = !USER.codigo; }

 SCHEMA = await MegatlonDB.meta();

  // "Contenido del sitio" es solo del administrador.
  const esAdmin = USER.rol === 'admin';
  $('#btn-nav-contenido').hidden = !esAdmin;
  const marca = document.querySelector('.admin-brand span');
  $('#btn-nav-permisos').hidden = !esAdmin;
  if (marca) marca.textContent = esAdmin ? 'Administración' : (USER.rol === 'cajero' ? 'Panel cajero' : 'Panel entrenador');

  construirMenu();

  const primeraTabla = Object.keys(SCHEMA).find(t => !TABLAS_OCULTAS.includes(t));
  seleccionarTabla(primeraTabla);
}

const TABLAS_OCULTAS = [];

// ---------- Sección especial: Permisos por rol (solo admin) ----------
$('#btn-nav-permisos').addEventListener('click', seleccionarPermisos);

async function seleccionarPermisos() {
  TABLA_ACTUAL = null;
  $('#panel-especial').hidden = true;
  $('#panel-contenido').hidden = true;
  $$('#admin-nav button[data-tabla]').forEach(b => b.classList.remove('activo'));
  $('#btn-nav-contenido').classList.remove('activo');
  $('#btn-nav-permisos').classList.add('activo');
  $('#admin-titulo-seccion').textContent = 'Permisos por rol';
  $('#btn-nuevo').hidden = true;
  $('#admin-tabla').hidden = true;
  $('#admin-tabla-vacio').hidden = true;

  const cont = $('#panel-permisos');
  cont.hidden = false;
  cont.textContent = 'Cargando…';
  try {
    const { roles, tablas, permisos } = await MegatlonDB.permisos.obtener();
    const tiene = (rol, tabla, a) => permisos.some(p => p.rol === rol && p.tabla === tabla && p[a]);
    const ACC = [['ver', 'Ver'], ['crear', 'Crear'], ['editar', 'Editar'], ['eliminar', 'Eliminar']];
    const NOMBRE = { entrenador: 'Entrenador', cajero: 'Cajero' };
    let html = '<p class="permisos-ayuda">Marca qué tablas verá cada rol y qué podrá hacer. Se aplica según el rol del usuario que inicie sesión.</p>';
    roles.forEach(rol => {
      html += `<h3>${NOMBRE[rol] || rol}</h3><table class="admin-tabla permisos-tabla" data-rol="${rol}"><thead><tr><th>Tabla</th>${ACC.map(a => `<th>${a[1]}</th>`).join('')}</tr></thead><tbody>`;
      tablas.forEach(t => {
        html += `<tr data-tabla="${t.tabla}"><td>${t.icon || ''} ${t.label}</td>` +
          ACC.map(a => `<td><input type="checkbox" data-acc="${a[0]}" ${tiene(rol, t.tabla, a[0]) ? 'checked' : ''}></td>`).join('') + '</tr>';
      });
      html += '</tbody></table>';
    });
    html += '<p id="permisos-aviso" class="panel-contenido-ok" hidden></p><div class="modal-form-acciones"><button type="button" id="btn-guardar-permisos" class="btn-guardar">Guardar permisos</button></div>';
    cont.innerHTML = html;

    // Marcar crear/editar/eliminar implica poder ver la tabla.
    cont.querySelectorAll('input[data-acc]').forEach(cb => cb.addEventListener('change', () => {
      const fila = cb.closest('tr');
      if (cb.dataset.acc !== 'ver' && cb.checked) fila.querySelector('[data-acc="ver"]').checked = true;
      if (cb.dataset.acc === 'ver' && !cb.checked) fila.querySelectorAll('input').forEach(i => { i.checked = false; });
    }));

    $('#btn-guardar-permisos').addEventListener('click', async () => {
      const lista = [];
      cont.querySelectorAll('table[data-rol]').forEach(tb => {
        tb.querySelectorAll('tbody tr').forEach(tr => {
          const p = { rol: tb.dataset.rol, tabla: tr.dataset.tabla };
          tr.querySelectorAll('input[data-acc]').forEach(i => { p[i.dataset.acc] = i.checked; });
          lista.push(p);
        });
      });
      const aviso = $('#permisos-aviso');
      try { await MegatlonDB.permisos.guardar(lista); aviso.textContent = 'Permisos guardados ✓'; }
      catch (err) { aviso.textContent = 'No se pudo guardar: ' + err.message; }
      aviso.hidden = false;
      clearTimeout(aviso._t);
      aviso._t = setTimeout(() => { aviso.hidden = true; }, 2500);
    });
  } catch (err) {
    cont.textContent = 'Error: ' + err.message;
  }
}

// ---------- Menú lateral (una entrada por tabla) ----------
function construirMenu() {
  const nav = $('#admin-nav');
  // El botón "Contenido del sitio" ya está fijo en el HTML; solo se agregan
  // debajo los botones de las 14 tablas.
  nav.querySelectorAll('button[data-tabla]').forEach(b => b.remove());
  for (const [tabla, config] of Object.entries(SCHEMA)) {
    if (TABLAS_OCULTAS.includes(tabla)) continue;
    const btn = document.createElement('button');
    btn.textContent = `${config.icon || '•'} ${config.label}`;
    btn.dataset.tabla = tabla;
    btn.addEventListener('click', () => seleccionarTabla(tabla));
    nav.appendChild(btn);
  }
}

function seleccionarTabla(tabla) {
  FILTRO_TIPO = 'todas';
  $('#filtro-tipos').hidden = true;
  $('#panel-especial').hidden = true;
  $('#panel-permisos').hidden = true;
  $('#btn-nav-permisos').classList.remove('activo');
  if (tabla === 'asistencias') return seleccionarEspecial();
  TABLA_ACTUAL = tabla;
  $('#btn-nav-contenido').classList.remove('activo');
  $$('#admin-nav button[data-tabla]').forEach(b => b.classList.toggle('activo', b.dataset.tabla === tabla));
  $('#admin-titulo-seccion').textContent = SCHEMA[tabla].label;
  $('#panel-contenido').hidden = true;
  $('#btn-nuevo').hidden = !(SCHEMA[tabla].permisos && SCHEMA[tabla].permisos.crear);
  $('#admin-tabla').hidden = false;
  cargarTabla();
}

// ---------- Sección especial: Contenido del sitio (hero, contacto, redes) ----------
$('#btn-nav-contenido').addEventListener('click', seleccionarContenido);

async function seleccionarContenido() {
  TABLA_ACTUAL = null;
  $('#panel-permisos').hidden = true;
  $('#btn-nav-permisos').classList.remove('activo');
  $('#panel-especial').hidden = true;
  $$('#admin-nav button[data-tabla]').forEach(b => b.classList.remove('activo'));
  $('#btn-nav-contenido').classList.add('activo');
  $('#admin-titulo-seccion').textContent = 'Contenido del sitio';
  $('#btn-nuevo').hidden = true;
  $('#admin-tabla').hidden = true;
  $('#admin-tabla-vacio').hidden = true;

  const form = $('#panel-contenido');
  const datos = await MegatlonDB.cargarContenido();
  Object.entries(datos).forEach(([campo, valor]) => {
    const el = form.querySelector(`[name="${campo}"]`);
    if (el) el.value = valor ?? '';
  });
  $('#panel-contenido-guardado').hidden = true;
  form.hidden = false;
}

$('#panel-contenido [name="contacto_telefono"]').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 8); });
$('#panel-contenido').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const datos = {};
  form.querySelectorAll('input[name], textarea[name]').forEach(el => { datos[el.name] = el.value.trim(); });
  const aviso = $('#panel-contenido-guardado');
  try { await MegatlonDB.setContenido(datos); aviso.textContent = 'Cambios guardados ✓'; }
  catch (err) { aviso.textContent = 'No se pudo guardar: ' + err.message; }
  aviso.hidden = false;
  clearTimeout(aviso._t);
  aviso._t = setTimeout(() => { aviso.hidden = true; }, 2500);
});

// ---------- Listar ----------
async function cargarTabla() {
  const config = SCHEMA[TABLA_ACTUAL];
  const cols = config.listColumns || ['id', ...config.fields.map(f => f.name)];

  const theadRow = $('#admin-tabla-head');
  const permisos = config.permisos || {};
  const hayAcciones = Boolean(permisos.editar || permisos.eliminar);
  theadRow.innerHTML = cols.map(c => `<th>${etiquetaColumna(config, c)}</th>`).join('') +
    (hayAcciones ? '<th>Acciones</th>' : '');

  let filas = [];
  try {
    filas = await MegatlonDB.list(TABLA_ACTUAL);
  } catch (err) {
    alert('Error cargando datos: ' + err.message);
    return;
  }

  // Notificaciones: se separan por tipo (Pagos, Solicitudes, Inicios de sesión…) con pestañas.
  if (config.tipos) filas = aplicarFiltroTipos(filas, config);
  else $('#filtro-tipos').hidden = true;

  const tbody = $('#admin-tabla-body');
  tbody.innerHTML = '';
  $('#admin-tabla-vacio').hidden = filas.length > 0;
  $('#admin-tabla').style.display = filas.length > 0 ? '' : 'none';

  filas.forEach(fila => {
    const tr = document.createElement('tr');
    tr.innerHTML = cols.map(c => `<td>${valorCelda(fila, c, config)}</td>`).join('') +
      (hayAcciones
        ? `<td class="col-acciones">
             ${permisos.editar ? '<button class="btn-editar">Editar</button>' : ''}
             ${permisos.eliminar ? '<button class="btn-eliminar">Eliminar</button>' : ''}
           </td>`
        : '');
    const bEditar = tr.querySelector('.btn-editar');
    const bEliminar = tr.querySelector('.btn-eliminar');
    const bRecibo = tr.querySelector('.btn-recibo');
    if (bRecibo) bRecibo.addEventListener('click', () => abrirRecibo(fila));
    if (bEditar) bEditar.addEventListener('click', () => abrirModal(fila.id));
    if (bEliminar) bEliminar.addEventListener('click', () => eliminarRegistro(fila.id));
    tbody.appendChild(tr);
  });
}

function etiquetaColumna(config, col) {
  if (col === 'id') return 'ID';
  const f = config.fields.find(f => f.name === col);
  return f ? f.label : col;
}

// Código único del usuario (LK 1, LK 2 …), SIEMPRE debajo del nombre.
function lineaCodigo(codigo) {
  return codigo ? `<br><small class="codigo-usuario">${escapeHtml(String(codigo))}</small>` : '';
}

function valorCelda(fila, col, config) {
  // Campo de imagen: miniatura, no el texto base64.
  const campo = config && config.fields.find(f => f.name === col);
  if (campo && campo.type === 'image') {
    const val = fila[col];
    return val
      ? `<img class="celda-miniatura" src="${escapeHtml(String(val))}" alt=""/>`
      : '<span style="opacity:.4">—</span>';
  }

  // Notificaciones: el tipo se muestra como etiqueta de color.
  if (col === 'tipo' && config && config.tipos) {
    const t = config.tipos.find(x => x.valor === fila.tipo);
    return `<span class="chip-tipo chip-tipo--${escapeHtml(String(fila.tipo || 'otro'))}">${escapeHtml(t ? t.label : String(fila.tipo || 'Otras'))}</span>`;
  }

  // Si es un campo FK, mostramos la etiqueta legible (join hecho en data.js)
  // en vez del id crudo.
  const labelKey = `${col}_label`;
  if (fila[labelKey] !== undefined && fila[labelKey] !== null) {
    // Pagos: debajo de la membresía sale "Ver recibo" (si el cliente pagó con comprobante).
    const verRecibo = TABLA_ACTUAL === 'pagos' && col === 'membresia_id' && fila.tiene_comprobante
      ? '<br><button type="button" class="btn-recibo">🧾 Ver recibo</button>'
      : '';
    return escapeHtml(String(fila[labelKey])) + lineaCodigo(fila[`${col}_codigo`]) + verRecibo;
  }
  const val = fila[col];
  if (val === null || val === undefined) return '<span style="opacity:.4">—</span>';
  // Columnas que muestran el nombre de la persona (usuarios, mensajes, asistencias): código debajo.
  if ((col === 'nombre_completo' || col === 'nombre') && fila.codigo) return escapeHtml(String(val)) + lineaCodigo(fila.codigo);
  return escapeHtml(String(val));
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

// ---------- Notificaciones separadas por tipo ----------
function aplicarFiltroTipos(filas, config) {
  const barra = $('#filtro-tipos');
  const cuenta = {};
  filas.forEach(f => { const t = f.tipo || 'otro'; cuenta[t] = (cuenta[t] || 0) + 1; });
  const botones = [{ valor: 'todas', label: 'Todas', n: filas.length }]
    .concat(config.tipos.map(t => ({ valor: t.valor, label: t.label, n: cuenta[t.valor] || 0 })));
  barra.innerHTML = botones.map(b =>
    `<button type="button" data-tipo="${escapeHtml(b.valor)}" class="${b.valor === FILTRO_TIPO ? 'activo' : ''}">${escapeHtml(b.label)} <span>${b.n}</span></button>`
  ).join('');
  barra.hidden = false;
  barra.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    FILTRO_TIPO = b.dataset.tipo;
    cargarTabla();
  }));
  return FILTRO_TIPO === 'todas' ? filas : filas.filter(f => (f.tipo || 'otro') === FILTRO_TIPO);
}

// ---------- Pagos: Ver recibo ----------
// Muestra el recibo que guardó el cliente al pagar por QR (membresía, monto y
// la imagen del comprobante) para revisar si el pago fue correcto.
function fechaLegible(texto) {
  if (!texto) return '—';
  const t = String(texto).trim();
  const d = t.length <= 10 ? new Date(`${t}T12:00:00`) : new Date(`${t.replace(' ', 'T')}Z`);
  return isNaN(d.getTime()) ? t : d.toLocaleString('es-BO', t.length <= 10
    ? { day: '2-digit', month: 'long', year: 'numeric' }
    : { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

async function abrirRecibo(fila) {
  const cont = $('#recibo-contenido');
  cont.innerHTML = '<p class="admin-vacio">Cargando recibo…</p>';
  $('#modal-recibo').hidden = false;

  let pago;
  try {
    pago = await MegatlonDB.get('pagos', fila.id);
  } catch (err) {
    cont.innerHTML = `<p class="form-error">No se pudo cargar el recibo: ${escapeHtml(err.message)}</p>`;
    return;
  }

  const comprobante = pago.comprobante || '';
  const extension = (/^data:image\/(\w+)/.exec(comprobante) || [])[1] || 'jpg';
  const puedeAprobar = Boolean(SCHEMA.pagos.permisos && SCHEMA.pagos.permisos.editar) && pago.estado !== 'pagado';
  const dato = (etiqueta, valor) => `<div><dt>${etiqueta}</dt><dd>${escapeHtml(String(valor == null || valor === '' ? '—' : valor))}</dd></div>`;

  cont.innerHTML = `
    <div class="recibo-cabecera">
      <div><span class="recibo-marca">MEGATLÓN</span><h3>Recibo N° ${escapeHtml(String(pago.id))}</h3></div>
      <span class="chip-estado chip-estado--${escapeHtml(pago.estado || 'pendiente')}">${escapeHtml(pago.estado || 'pendiente')}</span>
    </div>
    <dl class="recibo-datos">
      <div><dt>Cliente</dt><dd>${escapeHtml(String(fila.cliente_id_label || '—'))}${lineaCodigo(fila.cliente_id_codigo)}</dd></div>
      ${dato('Membresía', fila.membresia_id_label)}
      ${dato('Monto', pago.monto != null ? 'Bs ' + pago.monto : '')}
      ${dato('Método de pago', pago.metodo_pago ? String(pago.metodo_pago).toUpperCase() : '')}
      ${dato('Fecha del pago', fechaLegible(pago.fecha_pago))}
      ${dato('Vence', pago.fecha_vencimiento ? fechaLegible(pago.fecha_vencimiento) : 'Se calcula al marcar como pagado')}
    </dl>
    <p class="recibo-subtitulo">Comprobante enviado por el cliente</p>
    ${comprobante
      ? `<a href="${escapeHtml(comprobante)}" target="_blank" rel="noopener" class="recibo-imagen" title="Abrir en grande"><img src="${escapeHtml(comprobante)}" alt="Comprobante de pago"/></a>`
      : '<p class="admin-vacio">Este pago no tiene comprobante.</p>'}
    <div class="modal-form-acciones">
      ${comprobante ? `<a class="btn-cancelar btn-link" href="${escapeHtml(comprobante)}" download="comprobante-pago-${escapeHtml(String(pago.id))}.${escapeHtml(extension)}">Descargar comprobante</a>` : ''}
      ${puedeAprobar ? '<button type="button" class="btn-guardar" id="btn-recibo-aprobar">Marcar como pagado</button>' : ''}
      <button type="button" class="btn-cancelar" id="btn-recibo-cerrar">Cerrar</button>
    </div>
    <p id="recibo-error" class="form-error" hidden></p>`;

  $('#btn-recibo-cerrar').addEventListener('click', cerrarRecibo);
  const aprobar = $('#btn-recibo-aprobar');
  if (aprobar) aprobar.addEventListener('click', async () => {
    aprobar.disabled = true;
    try {
      await MegatlonDB.update('pagos', pago.id, { estado: 'pagado' });
      cerrarRecibo();
      cargarTabla();
    } catch (err) {
      const e = $('#recibo-error');
      e.textContent = err.message;
      e.hidden = false;
      aprobar.disabled = false;
    }
  });
}

function cerrarRecibo() {
  $('#modal-recibo').hidden = true;
  $('#recibo-contenido').innerHTML = '';
}
$('#modal-recibo-cerrar').addEventListener('click', cerrarRecibo);
$('#modal-recibo').addEventListener('click', (e) => { if (e.target.id === 'modal-recibo') cerrarRecibo(); });

// ---------- Eliminar ----------
async function eliminarRegistro(id) {
  if (!confirm('¿Eliminar este registro? Esta acción no se puede deshacer.')) return;
  try {
    await MegatlonDB.remove(TABLA_ACTUAL, id);
    cargarTabla();
  } catch (err) {
    alert('No se pudo eliminar: ' + err.message);
  }
}

// ---------- Crear / Editar (modal genérico) ----------
$('#btn-nuevo').addEventListener('click', () => abrirModal(null));
$('#modal-cerrar').addEventListener('click', cerrarModal);
$('#modal-form').addEventListener('click', (e) => { if (e.target.id === 'modal-form') cerrarModal(); });

async function abrirModal(id) {
  REGISTRO_EDITANDO = id;
  const config = SCHEMA[TABLA_ACTUAL];
  $('#modal-titulo').textContent = id ? `Editar: ${config.label}` : `Nuevo: ${config.label}`;

  let registro = {};
  if (id) {
    try {
      registro = await MegatlonDB.get(TABLA_ACTUAL, id);
    } catch (err) {
      alert('No se pudo cargar el registro: ' + err.message);
      return;
    }
  }

  // Cargar opciones de los selects que son claves foráneas
  const opcionesFk = {};
  for (const f of config.fields) {
    if (f.type === 'fk') {
      try {
        opcionesFk[f.name] = await MegatlonDB.list(f.fk.table);
      } catch {
        opcionesFk[f.name] = [];
      }
    }
  }

  construirFormulario(config, registro, opcionesFk);
  $('#modal-form').hidden = false;
}

function cerrarModal() {
  $('#modal-form').hidden = true;
  REGISTRO_EDITANDO = null;
}

function construirFormulario(config, registro, opcionesFk) {
  const form = $('#form-registro');
  form.innerHTML = '';

  config.fields.forEach(f => {
    const label = document.createElement('label');
    if (f.readonly) label.classList.add('campo-readonly');
    const valorActual = registro[f.name] ?? f.default ?? '';

    let inputHtml = '';
    if (f.type === 'select') {
      inputHtml = `<select name="${f.name}" ${f.required ? 'required' : ''} ${f.readonly ? 'disabled' : ''}>
        ${f.options.map(op => `<option value="${op}" ${op == valorActual ? 'selected' : ''}>${op}</option>`).join('')}
      </select>`;
    } else if (f.type === 'fk') {
      const opciones = opcionesFk[f.name] || [];
      inputHtml = `<select name="${f.name}" ${f.required ? 'required' : ''}>
        <option value="">-- Selecciona --</option>
        ${opciones.map(op => `<option value="${op.id}" ${op.id == valorActual ? 'selected' : ''}>${escapeHtml(String(op[f.fk.display] || ('Registro ' + op.id)) + (op.codigo ? ' · ' + op.codigo : ''))}</option>`).join('')}
      </select>`;
    } else if (f.type === 'image') {
      const val = String(valorActual || '');
      inputHtml = `
        <div class="campo-imagen" data-max-lado="${f.maxLado || IMAGEN_MAX_LADO}" data-formato="${f.formato === 'png' ? 'png' : 'jpeg'}">
          <input type="hidden" name="${f.name}" value="${escapeHtml(val)}"/>
          <img class="campo-imagen-preview" src="${escapeHtml(val)}" alt="" ${val ? '' : 'hidden'}/>
          <div class="campo-imagen-acciones">
            <input type="file" class="campo-imagen-file" accept="image/*"/>
            <button type="button" class="campo-imagen-quitar" ${val ? '' : 'hidden'}>Quitar imagen</button>
          </div>
          <small class="campo-imagen-ayuda">JPG, PNG, WEBP o GIF. Se redimensiona sola a ${f.maxLado || IMAGEN_MAX_LADO}px.</small>
          <small class="campo-imagen-error" hidden></small>
        </div>`;
    } else if (f.type === 'textarea') {
      inputHtml = `<textarea name="${f.name}" ${f.required ? 'required' : ''} ${f.readonly ? 'disabled' : ''}>${escapeHtml(String(valorActual))}</textarea>`;
    } else {
      const tipoInput = ['text','email','password','number','date','time','datetime'].includes(f.type)
        ? (f.type === 'datetime' ? 'text' : f.type) : 'text';
      const attrStep = f.step ? `step="${f.step}"` : '';
      const placeholder = f.createOnly && registro.id ? 'Dejar vacío para no cambiar' : '';
      const esNuevo = !registro.id;
      const attrTel = f.soloTelefono ? 'data-solo-telefono inputmode="numeric" maxlength="8" pattern="\\d{7,8}" title="Solo números, 7 u 8 dígitos"' : '';
      const attrCarnet = f.soloCarnet ? 'data-solo-carnet inputmode="numeric" maxlength="10" pattern="\\d{5,10}" title="Solo números, de 5 a 10 dígitos"' : '';
      const attrNombre = f.soloNombre
        ? `data-solo-nombre minlength="2" maxlength="${f.maxLength || 80}" pattern="[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' .\\-]+" title="Solo letras, sin números ni símbolos"`
        : '';
      inputHtml = `<input type="${tipoInput}" name="${f.name}" value="${f.type === 'password' ? '' : escapeHtml(String(valorActual))}"
        placeholder="${placeholder}" ${attrStep} ${attrNombre} ${attrTel} ${attrCarnet} ${f.required && (!f.createOnly || esNuevo) ? 'required' : ''} ${f.readonly ? 'disabled' : ''}/>`;
    }

    label.innerHTML = `${f.label}${f.required ? ' *' : ''} ${inputHtml}`;
    form.appendChild(label);

    if (f.type === 'image') conectarCampoImagen(label);

    // Teléfono: solo dígitos, máximo 8. Correo: debe ser un correo válido.
    const inputTel = label.querySelector('input[data-solo-telefono]');
    if (inputTel) inputTel.addEventListener('input', () => { inputTel.value = inputTel.value.replace(/\D/g, '').slice(0, 8); });
    // Carnet de identidad: solo números (máx. 10).
    const inputCarnet = label.querySelector('input[data-solo-carnet]');
    if (inputCarnet) inputCarnet.addEventListener('input', () => { inputCarnet.value = inputCarnet.value.replace(/\D/g, '').slice(0, 10); });
    const inputCorreo = label.querySelector('input[type="email"]');
    if (inputCorreo) inputCorreo.setAttribute('pattern', '(?=[^@]*[A-Za-z])[A-Za-z0-9._%+\\-]+@[A-Za-z0-9\\-]+(\\.[A-Za-z0-9\\-]+)*\\.[A-Za-z]{2,}');

    // Nombres de persona: mientras escribe se quitan números y símbolos.
    const inputNombre = label.querySelector('input[data-solo-nombre]');
    if (inputNombre) {
      inputNombre.addEventListener('input', () => {
        inputNombre.value = inputNombre.value.replace(/[^\p{L}\s'.\-]/gu, '');
      });
    }
  });

  const errorP = document.createElement('p');
  errorP.className = 'form-error';
  errorP.id = 'form-registro-error';
  errorP.hidden = true;
  form.appendChild(errorP);

  const acciones = document.createElement('div');
  acciones.className = 'modal-form-acciones';
  acciones.innerHTML = `
    <button type="button" class="btn-cancelar">Cancelar</button>
    <button type="submit" class="btn-guardar">Guardar</button>
  `;
  form.appendChild(acciones);

  acciones.querySelector('.btn-cancelar').addEventListener('click', cerrarModal);
  form.onsubmit = guardarRegistro;
}

// ---------- Campo de imagen (adjuntar archivo) ----------
// La foto no se sube a una carpeta: se redimensiona en el navegador y se
// guarda como data URL (base64) en la columna de texto correspondiente.
// Así el <img> del index puede usarla directamente en su "src".
const IMAGEN_MAX_LADO = 800;
const IMAGEN_CALIDAD = 0.82;

function comprimirImagen(archivo, maxLado = IMAGEN_MAX_LADO, formato = 'jpeg') {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onerror = () => reject(new Error('No se pudo leer el archivo'));
    lector.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('El archivo no es una imagen válida'));
      img.onload = () => {
        const escala = Math.min(1, maxLado / Math.max(img.width, img.height));
        const lienzo = document.createElement('canvas');
        lienzo.width = Math.round(img.width * escala);
        lienzo.height = Math.round(img.height * escala);
        const ctx = lienzo.getContext('2d');
        if (formato !== 'png') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, lienzo.width, lienzo.height); } // fondo blanco si la imagen es transparente
        ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height);
        // PNG (sin pérdida) para cosas que deben verse nítidas, como un QR.
        resolve(formato === 'png' ? lienzo.toDataURL('image/png') : lienzo.toDataURL('image/jpeg', IMAGEN_CALIDAD));
      };
      img.src = lector.result;
    };
    lector.readAsDataURL(archivo);
  });
}

const IMAGEN_TIPOS_OK = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const IMAGEN_MAX_ORIGINAL = 10 * 1024 * 1024; // 10 MB antes de comprimir

function conectarCampoImagen(contenedor) {
  const oculto = contenedor.querySelector('input[type="hidden"]');
  const file = contenedor.querySelector('.campo-imagen-file');
  const preview = contenedor.querySelector('.campo-imagen-preview');
  const quitar = contenedor.querySelector('.campo-imagen-quitar');
  const error = contenedor.querySelector('.campo-imagen-error');

  const mostrarError = msg => {
    error.textContent = msg || '';
    error.hidden = !msg;
    contenedor.classList.toggle('campo-imagen--error', Boolean(msg));
  };

  file.addEventListener('change', async () => {
    const archivo = file.files && file.files[0];
    if (!archivo) return;

    // Validación antes de procesar nada
    if (!IMAGEN_TIPOS_OK.includes(archivo.type)) {
      mostrarError('Formato no permitido. Usa JPG, PNG, WEBP o GIF.');
      file.value = '';
      return;
    }
    if (archivo.size > IMAGEN_MAX_ORIGINAL) {
      mostrarError('La imagen pesa más de 10 MB. Elige una más liviana.');
      file.value = '';
      return;
    }

    try {
      const dataUrl = await comprimirImagen(archivo, Number(contenedor.dataset.maxLado) || IMAGEN_MAX_LADO, contenedor.dataset.formato || 'jpeg');
      mostrarError('');
      oculto.value = dataUrl;
      preview.src = dataUrl;
      preview.hidden = false;
      quitar.hidden = false;
    } catch (err) {
      mostrarError('No se pudo procesar la imagen: ' + err.message);
      file.value = '';
    }
  });

  quitar.addEventListener('click', () => {
    mostrarError('');
    oculto.value = '';
    preview.removeAttribute('src');
    preview.hidden = true;
    quitar.hidden = true;
    file.value = '';
  });
}

async function guardarRegistro(e) {
  e.preventDefault();
  const form = e.target;
  const config = SCHEMA[TABLA_ACTUAL];
  const errorP = $('#form-registro-error');
  errorP.hidden = true;

  const payload = {};
  config.fields.forEach(f => {
    if (f.readonly) return;
    const el = form.querySelector(`[name="${f.name}"]`);
    if (!el) return;
    let val = el.value;
    if (f.type === 'password' && !val) return; // no enviar si se dejó vacío al editar
    if (f.type === 'fk' && val === '') val = null;
    else if (f.type === 'fk') val = Number(val);
    if (f.type === 'number' && val !== '') val = Number(val);
    payload[f.name] = val;
  });

  try {
    if (REGISTRO_EDITANDO) {
      await MegatlonDB.update(TABLA_ACTUAL, REGISTRO_EDITANDO, payload);
    } else {
      await MegatlonDB.create(TABLA_ACTUAL, payload);
    }
    cerrarModal();
    cargarTabla();
  } catch (err) {
    errorP.textContent = err.message;
    errorP.hidden = false;
  }
}

// ---------- Arranque ----------
verificarSesionExistente();


// ---------- Vista especial: Asistencias (calendario + lupa) ----------
// La lógica y el dibujo están en js/asistencias.js.
async function seleccionarEspecial() {
  $('#panel-permisos').hidden = true;
  $('#btn-nav-permisos').classList.remove('activo');
  TABLA_ACTUAL = null;
  $('#btn-nav-contenido').classList.remove('activo');
  $$('#admin-nav button[data-tabla]').forEach(b => b.classList.toggle('activo', b.dataset.tabla === 'asistencias'));
  $('#admin-titulo-seccion').textContent = 'Asistencias';
  $('#btn-nuevo').hidden = true;
  $('#admin-tabla').hidden = true;
  $('#admin-tabla-vacio').hidden = true;
  $('#panel-contenido').hidden = true;
  const cont = $('#panel-especial');
  cont.hidden = false;
  await PanelAsistencias.montar(cont);
}
