// ============ Panel → Asistencias ============
// Aparecen solos todos los usuarios con membresía pagada (el servidor los
// arma en server/asistencias.js). Cada uno se abre en un calendario donde se
// toca un día para poner o quitar el check, y se pueden poner más o menos
// días de membresía. La lupa busca por nombre, correo o carnet de identidad.
//
// Se carga antes de admin.js, que llama a PanelAsistencias.montar(contenedor).

const PanelAsistencias = (function () {
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const SEMANA = [['L', 'lunes'], ['M', 'martes'], ['M', 'miércoles'], ['J', 'jueves'], ['V', 'viernes'], ['S', 'sábado'], ['D', 'domingo']];

  const E = { raiz: null, usuarios: [], hoy: '', filtro: '', abierto: null, meses: {} };

  // ---------- utilidades ----------
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sinAcentos = (t) => String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const compacto = (t) => String(t == null ? '' : t).toUpperCase().replace(/[\s-]/g, '');
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (iso) => { if (!iso) return '—'; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
  const porId = (id) => E.usuarios.find(u => u.cliente_id === Number(id));
  const enPeriodo = (u, f) => f >= u.inicio && f <= u.vence;
  const contar = (u) => u.fechas.filter(f => enPeriodo(u, f)).length;
  const mesInicial = (u) => (u.vigente ? E.hoy : u.vence).slice(0, 7);

  // ---------- búsqueda (lupa) ----------
  function coincide(u, filtro) {
    const q = sinAcentos(filtro).trim();
    if (!q) return true;
    if (sinAcentos(u.nombre).includes(q) || sinAcentos(u.correo).includes(q)) return true;
    const c = compacto(filtro);
    // Código único (LK 3): "lk3", "LK 3" o "lk" (todos). Con número, tiene que ser exacto (LK 3 no trae a LK 30).
    const cod = compacto(u.codigo || '');
    if (cod && /^LK\d*$/.test(c) && (c === 'LK' || cod === c)) return true;
    // El carnet solo se compara si lo escrito trae algún número (así "lp" no trae a medio mundo).
    return /\d/.test(c) && compacto(u.carnet).includes(c);
  }

  const filtrados = () => E.usuarios.filter(u => coincide(u, E.filtro));

  // ---------- HTML ----------
  function htmlMes(u) {
    const ym = E.meses[u.cliente_id] || mesInicial(u);
    const [y, m] = ym.split('-').map(Number);
    const primero = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // semana desde el lunes
    const total = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const marcados = new Set(u.fechas);

    let celdas = '';
    for (let i = 0; i < primero; i++) celdas += '<span class="asis-hueco"></span>';
    for (let d = 1; d <= total; d++) {
      const f = `${y}-${pad(m)}-${pad(d)}`;
      const asistio = marcados.has(f);
      const dentro = enPeriodo(u, f);
      const futuro = f > E.hoy;
      const clases = ['asis-dia', asistio && 'asistio', dentro && 'en-periodo', futuro && 'futuro', f === E.hoy && 'hoy'].filter(Boolean).join(' ');
      celdas += `<button type="button" class="${clases}" data-u="${u.cliente_id}" data-dia="${f}" aria-pressed="${asistio}" aria-label="${d} de ${MESES[m - 1]} de ${y}${asistio ? ', asistió' : ''}"${dentro && !futuro ? '' : ' disabled'}>${d}</button>`;
    }

    return `
      <div class="asis-mes">
        <button type="button" class="asis-nav" data-u="${u.cliente_id}" data-mes="-1" aria-label="Mes anterior">&#8249;</button>
        <span>${MESES[m - 1]} ${y}</span>
        <button type="button" class="asis-nav" data-u="${u.cliente_id}" data-mes="1" aria-label="Mes siguiente">&#8250;</button>
      </div>
      <div class="asis-grid">
        ${SEMANA.map(([l, n]) => `<span class="asis-sem" title="${n}">${l}</span>`).join('')}
        ${celdas}
      </div>`;
  }

  function htmlCalendario(u) {
    return `
      <div class="asis-calendario" id="asis-cal-${u.cliente_id}">
        <div class="asis-cal-top">
          <div class="asis-cal-mes">${htmlMes(u)}</div>
          <div class="asis-dias" role="group" aria-label="Días de la membresía">
            <span>Días de membresía</span>
            <button type="button" class="asis-nav" data-u="${u.cliente_id}" data-dias="-1" aria-label="Quitar un día">&minus;</button>
            <input type="number" class="asis-dias-input" data-u="${u.cliente_id}" min="1" max="365" step="1" value="${u.dias}" aria-label="Cantidad de días de la membresía"/>
            <button type="button" class="asis-nav" data-u="${u.cliente_id}" data-dias="1" aria-label="Agregar un día">+</button>
          </div>
        </div>
        <p class="asis-nota">Del ${fmt(u.inicio)} al ${fmt(u.vence)}. Toca un día para poner o quitar el check. Los días de afuera de la membresía están apagados: súmale días arriba si hace falta.</p>
      </div>`;
  }

  function htmlUsuario(u) {
    const abierto = E.abierto === u.cliente_id;
    const inicial = esc((u.nombre || '?').trim().charAt(0).toUpperCase());
    return `
      <article class="asis-usuario${abierto ? ' abierto' : ''}" data-usuario="${u.cliente_id}">
        <button type="button" class="asis-cabecera" data-abrir="${u.cliente_id}" aria-expanded="${abierto}" aria-controls="asis-cal-${u.cliente_id}">
          <span class="asis-avatar" aria-hidden="true">${inicial}</span>
          <span class="asis-quien">
            <strong>${esc(u.nombre)}</strong>
            ${u.codigo ? `<small class="codigo-usuario">${esc(u.codigo)}</small>` : ''}
            <small>${u.carnet ? 'CI ' + esc(u.carnet) : 'Sin carnet'}${u.membresia ? ' · ' + esc(u.membresia) : ''}</small>
          </span>
          <span class="asis-estado ${u.vigente ? 'vigente' : 'vencida'}">${u.vigente ? 'Vigente' : 'Vencida'}</span>
          <span class="asis-resumen"><b>${contar(u)}</b> ${contar(u) === 1 ? 'día' : 'días'}<small>vence ${fmt(u.vence)}</small></span>
          <span class="asis-flecha" aria-hidden="true">&#9662;</span>
        </button>
        ${abierto ? htmlCalendario(u) : ''}
      </article>`;
  }

  // ---------- dibujo ----------
  function pintarLista() {
    const lista = E.raiz.querySelector('.asis-lista');
    const visibles = filtrados();
    const vigentes = E.usuarios.filter(u => u.vigente).length;
    E.raiz.querySelector('.asis-contador').textContent = E.filtro.trim()
      ? `${visibles.length} de ${E.usuarios.length} usuarios`
      : `${E.usuarios.length} ${E.usuarios.length === 1 ? 'usuario' : 'usuarios'} con membresía pagada · ${vigentes} ${vigentes === 1 ? 'vigente' : 'vigentes'}`;

    if (!E.usuarios.length) {
      lista.innerHTML = '<p class="asis-vacio">Todavía no hay usuarios con membresía pagada. Cuando marques un pago como «pagado», el usuario aparece aquí solo.</p>';
    } else if (!visibles.length) {
      lista.innerHTML = `<p class="asis-vacio">Nadie coincide con «${esc(E.filtro.trim())}». Prueba con el nombre, el código (ej. LK 3) o el carnet completo.</p>`;
    } else {
      lista.innerHTML = visibles.map(htmlUsuario).join('');
    }
  }

  function pintarUsuario(id, foco) {
    const u = porId(id);
    const art = E.raiz.querySelector(`[data-usuario="${id}"]`);
    if (!u || !art) return;
    art.outerHTML = htmlUsuario(u);
    if (foco) { const el = E.raiz.querySelector(foco); if (el) el.focus({ preventScroll: true }); }
  }

  function aviso(texto) {
    const p = E.raiz.querySelector('.asis-aviso');
    if (!p) return;
    p.textContent = texto || '';
    p.hidden = !texto;
  }

  // ---------- acciones ----------
  function alternar(id) {
    const anterior = E.abierto;
    E.abierto = anterior === id ? null : id;
    if (anterior && anterior !== id) pintarUsuario(anterior);
    pintarUsuario(id, `[data-abrir="${id}"]`);
    aviso('');
  }

  function moverMes(id, delta) {
    const u = porId(id);
    if (!u) return;
    const [y, m] = (E.meses[id] || mesInicial(u)).split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    E.meses[id] = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
    pintarUsuario(id, `[data-u="${id}"][data-mes="${delta}"]`);
  }

  async function alternarDia(id, fecha) {
    const u = porId(id);
    if (!u) return;
    const presente = !u.fechas.includes(fecha);
    const boton = E.raiz.querySelector(`[data-u="${id}"][data-dia="${fecha}"]`);
    if (boton) boton.disabled = true;
    try {
      await MegatlonDB.panel.marcarAsistencia(u.cliente_id, fecha, presente);
      u.fechas = presente ? [...u.fechas, fecha].sort() : u.fechas.filter(f => f !== fecha);
      u.asistidos = contar(u);
      aviso('');
    } catch (err) {
      aviso(err.message);
    }
    pintarUsuario(id, `[data-u="${id}"][data-dia="${fecha}"]`);
  }

  async function cambiarDias(id, dias) {
    const u = porId(id);
    if (!u) return;
    if (!Number.isInteger(dias) || dias < 1 || dias > 365) {
      aviso('Los días de la membresía deben ser un número entre 1 y 365.');
      return pintarUsuario(id, `[data-u="${id}"].asis-dias-input`);
    }
    if (dias === u.dias) return;
    try {
      const r = await MegatlonDB.panel.cambiarDias(u.pago_id, dias);
      u.dias = r.dias;
      u.vence = r.vence;
      u.vigente = r.vigente;
      u.asistidos = contar(u);
      aviso('');
    } catch (err) {
      aviso(err.message);
    }
    pintarUsuario(id, `[data-u="${id}"].asis-dias-input`);
  }

  // ---------- eventos (un solo juego, por delegación) ----------
  function alClic(e) {
    const abrir = e.target.closest('[data-abrir]');
    if (abrir) return alternar(Number(abrir.dataset.abrir));

    const mes = e.target.closest('[data-mes]');
    if (mes) return moverMes(Number(mes.dataset.u), Number(mes.dataset.mes));

    const dia = e.target.closest('[data-dia]');
    if (dia && !dia.disabled) return alternarDia(Number(dia.dataset.u), dia.dataset.dia);

    const dias = e.target.closest('button[data-dias]');
    if (dias) {
      const u = porId(dias.dataset.u);
      if (u) cambiarDias(u.cliente_id, u.dias + Number(dias.dataset.dias));
    }
  }

  function alCambiar(e) {
    const campo = e.target.closest('.asis-dias-input');
    if (campo) cambiarDias(Number(campo.dataset.u), Number(campo.value));
  }

  function alEscribir(e) {
    if (e.target.id !== 'asis-buscar') return;
    E.filtro = e.target.value;
    const visibles = filtrados();
    // Si la búsqueda deja a una sola persona, se abre su calendario directo.
    E.abierto = E.filtro.trim() && visibles.length === 1 ? visibles[0].cliente_id : null;
    pintarLista();
  }

  // ---------- entrada ----------
  async function montar(cont) {
    E.raiz = cont;
    cont.innerHTML = '<p class="asis-vacio">Cargando…</p>';

    let datos;
    try {
      datos = await MegatlonDB.panel.asistencias();
    } catch (err) {
      cont.innerHTML = `<p class="asis-vacio">No se pudieron cargar las asistencias: ${esc(err.message)}</p>`;
      return;
    }

    E.usuarios = datos.usuarios || [];
    E.hoy = datos.hoy;
    E.filtro = '';
    E.abierto = null;
    E.meses = {};

    cont.innerHTML = `
      <div class="asis-barra">
        <label class="asis-buscar" role="search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg>
          <input id="asis-buscar" type="search" placeholder="Buscar por nombre, carnet o código (ej. LK 3)" aria-label="Buscar por nombre, carnet o código (ej. LK 3)" autocomplete="off"/>
        </label>
        <span class="asis-contador" aria-live="polite"></span>
      </div>
      <p class="asis-aviso" role="alert" hidden></p>
      <div class="asis-lista"></div>`;

    // Se asignan como propiedades: si se vuelve a entrar a la vista, no se duplican.
    cont.onclick = alClic;
    cont.onchange = alCambiar;
    cont.oninput = alEscribir;

    pintarLista();
    const buscar = cont.querySelector('#asis-buscar');
    if (buscar) buscar.focus({ preventScroll: true });
  }

  return { montar };
})();
