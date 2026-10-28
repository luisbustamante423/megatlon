// ============ Contenido editable desde el panel (hero, contacto, redes) ============
// Se guarda con MegatlonDB.setContenido() en html/admin.html → "Contenido del
// sitio" y se lee aquí para pintarlo en la landing (js/data.js define
// MegatlonDB, cargado antes que este archivo).
// Título del hero: texto editable desde el panel. La última frase ("Vive mejor.")
// se resalta en verde lima. Se arma con nodos DOM (sin innerHTML) para que un
// texto escrito en el panel nunca pueda inyectar HTML.
function pintarTituloHero(texto) {
  const el = document.getElementById('hero-titulo');
  if (!el) return;
  const t = String(texto || '').trim();
  if (!t) return;
  el.textContent = '';
  // Separa en frases terminadas en punto; solo resalta si hay al menos dos.
  const frases = t.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [t];
  if (frases.length < 2) { el.textContent = t; return; }
  const ultima = frases.pop().trim();
  el.appendChild(document.createTextNode(frases.join('').trim() + ' '));
  const marca = document.createElement('span');
  marca.className = 'resaltado';
  marca.textContent = ultima;
  el.appendChild(marca);
}

function pintarContenidoSitio() {
  if (typeof MegatlonDB === 'undefined') return;
  const c = MegatlonDB.getContenido();
  const set = (id, texto) => { const el = document.getElementById(id); if (el) el.textContent = texto; };

  set('hero-ubicacion', c.hero_ubicacion);
  pintarTituloHero(c.hero_titulo);
  // El subtítulo del hero se muestra sin punto final ("El gimnasio más moderno de Cochabamba")
  set('hero-subtitulo', String(c.hero_subtitulo || '').replace(/\.\s*$/, ''));
  set('hero-stat1-numero', c.hero_stat1_numero);
  set('hero-stat1-etiqueta', c.hero_stat1_etiqueta);
  set('hero-stat2-numero', c.hero_stat2_numero);
  set('hero-stat2-etiqueta', c.hero_stat2_etiqueta);
  set('hero-stat3-numero', c.hero_stat3_numero);
  set('hero-stat3-etiqueta', c.hero_stat3_etiqueta);

  const setMultilinea = (id, texto) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = texto || '';
    el.style.whiteSpace = 'pre-line';
  };

  set('contacto-direccion', c.contacto_direccion);
  set('contacto-telefono', c.contacto_telefono);
  setMultilinea('contacto-horarios', c.contacto_horarios);

  set('footer-mensaje', c.footer_mensaje);
  set('footer-direccion', c.contacto_direccion);
  set('footer-telefono', c.contacto_telefono);
  setMultilinea('footer-horarios', c.contacto_horarios);

  // Mapa: acepta el src, el <iframe> completo pegado, o (si no es un enlace
  // para incrustar) muestra la dirección escrita en el mapa.
  const mapaEl = document.getElementById('contacto-mapa');
  if (mapaEl) {
    let src = String(c.contacto_mapa_src || '').trim();
    const m = /src\s*=\s*["']([^"']+)["']/i.exec(src);
    if (m) src = m[1];
    if (!/^https:\/\/(www\.)?google\.[a-z.]+\/maps\/embed|output=embed/i.test(src)) {
      src = c.contacto_direccion ? `https://maps.google.com/maps?q=${encodeURIComponent(c.contacto_direccion)}&output=embed` : '';
    }
    if (src && mapaEl.getAttribute('src') !== src) mapaEl.src = src;
  }

  const redes = {
    '.red-social--instagram': c.red_instagram,
    '.red-social--facebook': c.red_facebook,
    '.red-social--tiktok': c.red_tiktok,
    '.red-social--whatsapp': c.red_whatsapp
  };
  Object.entries(redes).forEach(([selector, url]) => {
    const a = document.querySelector(selector);
    if (a && url) a.href = url;
  });
}
pintarContenidoSitio();
// Trae lo guardado en la base de datos y vuelve a pintar la página.
if (typeof MegatlonDB !== 'undefined' && MegatlonDB.cargarContenido) {
  MegatlonDB.cargarContenido().then(pintarContenidoSitio);
}

// ============ Utilidades ============
function escaparHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto == null ? '' : String(texto);
  return div.innerHTML;
}

// Capa de imagen de fondo + oscurecedor, para que el texto blanco de la
// tarjeta se siga leyendo por encima de la foto. Si no hay imagen cargada
// en el panel, devuelve '' y la tarjeta queda como antes.
function capaFondo(imagen, alt) {
  if (!imagen) return '';
  return `
    <img class="tarjeta-fondo" src="${escaparHtml(imagen)}" alt="${escaparHtml(alt || '')}" loading="lazy" aria-hidden="true"/>
    <div class="tarjeta-oscurecedor" aria-hidden="true"></div>`;
}


const $id = (id) => document.getElementById(id);
const CL = (typeof MegatlonDB !== 'undefined' && MegatlonDB.cliente) ? MegatlonDB.cliente : null;

// Estado de la página según quién está conectado.
const ESTADO = {
  perfil: null,      // membresía, reservas… del cliente con sesión
  playlist: [],      // canciones guardadas en la base de datos
  planes: []         // planes públicos (para etiquetar los botones)
};

const sesionActiva = () => Boolean(CL && CL.sesion());
const nombreSesion = () => { const s = CL && CL.sesion(); return s && s.user ? s.user.nombre_completo : ''; };
// Código único del usuario (LK 1, LK 2 …): del perfil si ya cargó, si no del que guardó el inicio de sesión.
const codigoSesion = () => {
  if (typeof ESTADO !== 'undefined' && ESTADO.perfil && ESTADO.perfil.user && ESTADO.perfil.user.codigo) return ESTADO.perfil.user.codigo;
  const s = CL && CL.sesion();
  return s && s.user && s.user.codigo ? s.user.codigo : '';
};
function pintarCodigoSesion() {
  const c = sesionActiva() ? codigoSesion() : '';
  ['nav-usuario-codigo', 'hero-codigo'].forEach(id => {
    const el = $id(id);
    if (el) { el.textContent = c; el.hidden = !c; }
  });
}

// Aviso flotante breve.
function toast(texto, tipo) {
  let el = $id('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = texto;
  el.className = 'toast toast--visible' + (tipo === 'error' ? ' toast--error' : '');
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.classList.remove('toast--visible'); }, 3800);
}

function fechaLarga(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d) ? '—' : d.toLocaleDateString('es-BO', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ============ Pedir inicio de sesión ============
// Reservar, inscribirse o guardar una canción sin sesión lleva aquí:
// baja al formulario de "Da el primer paso" y lo resalta.
function pedirLogin(mensaje) {
  const aviso = $id('sesion-aviso');
  const caja = $id('caja-sesion');
  if (aviso) { aviso.textContent = mensaje || 'Inicia sesión para continuar.'; aviso.hidden = false; }
  if (caja) { caja.classList.remove('pulso'); void caja.offsetWidth; caja.classList.add('pulso'); }
  const seccion = $id('contacto');
  if (seccion) seccion.scrollIntoView({ behavior: 'smooth', block: 'start' });
  setTimeout(() => { const i = $id('login-nombre'); if (i && i.offsetParent) i.focus({ preventScroll: true }); }, 700);
}

// ============ Enlaces a WhatsApp con mensaje precargado ============
// "Inscribirme" y "Reservar" (con sesión iniciada) abren WhatsApp con
// el mensaje ya escrito, usando el número guardado en "Contenido del
// sitio" (Redes > WhatsApp) del panel admin.
const WHATSAPP_POR_DEFECTO = '59162668272';

function whatsappHref(mensaje) {
  let numero = WHATSAPP_POR_DEFECTO;
  if (typeof MegatlonDB !== 'undefined' && MegatlonDB.getContenido) {
    const digitos = String(MegatlonDB.getContenido().red_whatsapp || '').replace(/\D/g, '');
    if (digitos) numero = digitos;
  }
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}


// Abre WhatsApp: la ventana se abre ya (dentro del clic) para que el
// navegador no la bloquee, y se completa al terminar de guardar.
function abrirVentanaWhatsapp() {
  try { return window.open('about:blank', '_blank'); } catch { return null; }
}
function irAWhatsapp(ventana, mensaje) {
  const url = whatsappHref(mensaje);
  if (ventana && !ventana.closed) ventana.location.href = url;
  else window.location.href = url;
}

// Botones fijos del HTML (se usan si el backend no responde): también
// exigen sesión, aunque sin id no se puede registrar en la base.
function prepararBotonesEstaticos() {
  document.querySelectorAll('[data-fallback="membresias"] article').forEach(art => {
    const nombre = art.querySelector('h3')?.textContent?.trim();
    const boton = [...art.querySelectorAll('a')].find(a => a.textContent.trim() === 'Inscribirme');
    if (nombre && boton) {
      boton.setAttribute('href', '#membresias');
      boton.removeAttribute('target');
      boton.dataset.accion = 'inscribir';
      boton.dataset.planNombre = nombre;
    }
  });
  document.querySelectorAll('[data-fallback="clases"] article').forEach(art => {
    const nombre = art.querySelector('h3')?.textContent?.trim();
    const boton = [...art.querySelectorAll('a')].find(a => a.textContent.trim() === 'Reservar');
    if (nombre && boton) {
      boton.setAttribute('href', '#clases');
      boton.removeAttribute('target');
      boton.dataset.accion = 'reservar';
      boton.dataset.claseNombre = nombre;
    }
  });
}
prepararBotonesEstaticos();

// ============ Membresías y clases reales del panel admin ============
// Si el backend responde con datos, se reemplazan las tarjetas fijas del
// HTML. Si falla (servidor apagado, sin internet, etc.) se quedan las
// tarjetas de siempre — por eso el contenedor tiene "data-fallback".
async function pintarMembresiasReales() {
  if (typeof MegatlonDB === 'undefined' || !MegatlonDB.membresiasPublicas) return;

  const contenedor = document.querySelector('[data-fallback="membresias"]');
  if (!contenedor) return;

  try {
    const membresias = await MegatlonDB.membresiasPublicas();
    if (!membresias || membresias.length === 0) return;
    ESTADO.planes = membresias;

    const destacadaIndex = Math.floor((membresias.length - 1) / 2);

    contenedor.innerHTML = membresias.map((m, i) => `
      <article class="panel relative flex flex-col p-7 transition-transform duration-500 hover:-translate-y-2${m.imagen ? ' tarjeta-con-fondo' : ''}${i === destacadaIndex ? ' brillo-rojo border-primary/60' : ''}">
        ${capaFondo(m.imagen, m.nombre)}
        ${i === destacadaIndex ? '<span class="absolute -top-3 left-7 z-20 rounded-full bg-primary px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-primary-foreground">Más elegido</span>' : ''}
        <h3 class="text-3xl">${escaparHtml(m.nombre)}</h3>
        <p class="mt-4 flex items-end gap-2"><span class="titular text-5xl text-primary">Bs ${escaparHtml(m.precio)}</span><span class="pb-1 text-xs uppercase tracking-widest text-muted-foreground">/ ${escaparHtml(m.duracion_dias)} días</span></p>
        <ul class="mt-6 flex-1 space-y-3 text-sm">
          ${(m.beneficios || '').split('\n').filter(Boolean).map(b => `<li class="flex gap-2 text-muted-foreground">${escaparHtml(b)}</li>`).join('')}
        </ul>
        <a class="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium cursor-pointer transition-colors bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80 h-10 rounded-md px-8 mt-7 font-bold uppercase tracking-widest" href="#membresias" role="button" data-accion="inscribir" data-plan-id="${escaparHtml(m.id)}" data-plan-nombre="${escaparHtml(m.nombre)}" data-plan-precio="${escaparHtml(m.precio)}" data-plan-dias="${escaparHtml(m.duracion_dias)}">Inscribirme</a>
      </article>
    `).join('');
    actualizarBotonesPlanes();
  } catch {
    // sin conexión al backend: se quedan las tarjetas fijas del HTML
  }
}
pintarMembresiasReales();

async function pintarClasesReales() {
  if (typeof MegatlonDB === 'undefined' || !MegatlonDB.clasesPublicas) return;

  const contenedor = document.querySelector('[data-fallback="clases"]');
  if (!contenedor) return;

  try {
    const clases = await MegatlonDB.clasesPublicas();
    if (!clases || clases.length === 0) return;

    contenedor.innerHTML = clases.map(c => `
      <article class="panel group relative p-6 transition-colors hover:border-primary/60${c.imagen ? ' tarjeta-con-fondo' : ''}">
        ${capaFondo(c.imagen, c.nombre)}
        <div class="flex items-start justify-between gap-3">
          <h3 class="text-2xl">${escaparHtml(c.nombre)}</h3>
        </div>
        <dl class="mt-5 space-y-2 text-sm">
          <div class="flex items-center gap-2 text-muted-foreground">${escaparHtml(c.horario || 'Horario a confirmar')}</div>
          <div class="flex items-center gap-2 text-muted-foreground">${escaparHtml(c.cupos != null ? c.cupos + ' cupos disponibles' : '')}</div>
          <div class="text-xs uppercase tracking-widest text-muted-foreground">${c.entrenador ? 'Coach: ' + escaparHtml(c.entrenador) : ''}</div>
        </dl>
        <a class="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium cursor-pointer transition-colors bg-primary text-primary-foreground shadow hover:bg-primary/90 h-10 rounded-md px-8 mt-6 w-full font-bold uppercase tracking-widest" href="#clases" role="button" data-accion="reservar" data-clase-id="${escaparHtml(c.id)}" data-clase-nombre="${escaparHtml(c.nombre)}" data-clase-horario="${escaparHtml(c.horario || '')}">Reservar</a>
      </article>
    `).join('');
    actualizarBotonesClases();
  } catch {
    // sin conexión al backend: se quedan las tarjetas fijas del HTML
  }
}
pintarClasesReales();

// ============ Entrenadores reales del panel admin ============
// Misma lógica que membresías y clases: si el backend responde, se
// reemplazan las tarjetas fijas; si no, se quedan las de siempre.
// La foto viene como data URL desde la columna "foto" de la tabla
// entrenadores (se carga en el panel con "Adjuntar archivo").
const FOTOS_POR_DEFECTO = [
  '../assets/coach-1-bM0K_CCt.jpg',
  '../assets/coach-2-DqnxVgHH.jpg',
  '../assets/coach-3-BHvKqmCc.jpg',
  '../assets/coach-4-C6Uj-21L.jpg'
];

async function pintarEntrenadoresReales() {
  if (typeof MegatlonDB === 'undefined' || !MegatlonDB.entrenadoresPublicos) return;

  const contenedor = document.querySelector('[data-fallback="entrenadores"]');
  if (!contenedor) return;

  try {
    const entrenadores = await MegatlonDB.entrenadoresPublicos();
    if (!entrenadores || entrenadores.length === 0) return;

    contenedor.innerHTML = entrenadores.map((e, i) => {
      const foto = e.foto || FOTOS_POR_DEFECTO[i % FOTOS_POR_DEFECTO.length];
      const nombre = e.nombre || 'Entrenador';
      return `
      <article class="zoom-hover panel group relative h-[26rem]">
        <img alt="Entrenador ${escaparHtml(nombre)}" class="h-full w-full object-cover object-top" height="960" loading="lazy" src="${escaparHtml(foto)}" width="768"/>
        <div aria-hidden="true" class="absolute inset-0" style="background:var(--gradient-oscuro)"></div>
        <div class="absolute inset-x-0 bottom-0 p-6">
          <p class="text-[10px] font-bold uppercase tracking-[0.35em] text-primary">${escaparHtml(e.especialidad || 'Entrenamiento general')}</p>
          <h3 class="mt-2 text-2xl">${escaparHtml(nombre)}</h3>
          <p class="mt-1 text-xs uppercase tracking-widest text-muted-foreground">${escaparHtml(e.experiencia || '')}</p>
        </div>
      </article>`;
    }).join('');
  } catch {
    // sin conexión al backend: se quedan las tarjetas fijas del HTML
  }
}
pintarEntrenadoresReales();


// Año dinámico en el footer
const anioEl = document.getElementById('anio-actual');
if (anioEl) anioEl.textContent = new Date().getFullYear();

// Menú móvil: mostrar/ocultar nav en pantallas chicas
const btnMenu = document.getElementById('btn-menu-movil');
const nav = document.getElementById('nav-principal');
if (btnMenu && nav) {
  const cerrarMenu = () => {
    nav.classList.remove('nav-movil-abierto');
    btnMenu.setAttribute('aria-expanded', 'false');
    btnMenu.setAttribute('aria-label', 'Abrir menú');
  };
  btnMenu.addEventListener('click', () => {
    const abierto = nav.classList.toggle('nav-movil-abierto');
    btnMenu.setAttribute('aria-expanded', abierto ? 'true' : 'false');
    btnMenu.setAttribute('aria-label', abierto ? 'Cerrar menú' : 'Abrir menú');
  });
  // Cerrar el menú al hacer click en un link
  nav.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', cerrarMenu);
  });
  // Cerrar con Escape, al tocar fuera del encabezado o al pasar a pantalla ancha
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarMenu(); });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('header')) cerrarMenu();
  });
  window.matchMedia('(min-width: 1024px)').addEventListener('change', cerrarMenu);
}


// ============ Instalaciones reales del panel admin ============
// El carrusel de instalaciones se arma desde la tabla "instalaciones".
// Aquí NO se aplica el oscurecedor fuerte: se mantiene el degradado
// original (--gradient-oscuro), igual que en las tarjetas de coaches.
const INSTALACIONES_POR_DEFECTO = [
  '../assets/inst-pesas-Be_y5pCa.jpg',
  '../assets/inst-cardio-KFzJrqbS.jpg',
  '../assets/inst-funcional-CSszA911.jpg',
  '../assets/inst-clases-BKOaOwFI.jpg'
];

async function pintarInstalacionesReales() {
  if (typeof MegatlonDB === 'undefined' || !MegatlonDB.instalacionesPublicas) return;

  const contenedor = document.querySelector('[data-fallback="instalaciones"]');
  if (!contenedor) return;

  try {
    const instalaciones = await MegatlonDB.instalacionesPublicas();
    if (!instalaciones || instalaciones.length === 0) return;

    contenedor.innerHTML = instalaciones.map((ins, i) => {
      const img = ins.imagen || INSTALACIONES_POR_DEFECTO[i % INSTALACIONES_POR_DEFECTO.length];
      return `
      <div class="min-w-0 shrink-0 basis-full sm:basis-1/2 lg:basis-1/3 pl-4">
        <article class="zoom-hover panel group relative h-80">
          <img alt="${escaparHtml(ins.nombre)}" class="h-full w-full object-cover" height="768" loading="lazy" src="${escaparHtml(img)}" width="1024"/>
          <div class="absolute inset-0" style="background:var(--gradient-oscuro)"></div>
          <div class="absolute inset-x-0 bottom-0 p-6">
            <h3 class="text-2xl">${escaparHtml(ins.nombre)}</h3>
            <p class="mt-1 text-sm text-muted-foreground">${escaparHtml(ins.descripcion || '')}</p>
            <span class="mt-3 block h-1 w-0 bg-primary transition-all duration-500 group-hover:w-16"></span>
          </div>
        </article>
      </div>`;
    }).join('');
  } catch {
    // sin conexión al backend: se queda el carrusel fijo del HTML
  }
}
pintarInstalacionesReales();


// ============ Acciones que exigen sesión: inscribirse y reservar ============
document.addEventListener('click', (e) => {
  const boton = e.target.closest('[data-accion]');
  if (!boton) return;
  const accion = boton.dataset.accion;

  if (accion === 'inscribir') { e.preventDefault(); inscribirse(boton); }
  else if (accion === 'reservar') { e.preventDefault(); reservarClase(boton); }
  else if (accion === 'login') { e.preventDefault(); pedirLogin(boton.dataset.mensaje); }
  else if (accion === 'ir-planes') {
    e.preventDefault();
    const g = $id('membresias-grid-wrap');
    if (g) g.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});

// "Inscribirme" (con sesión iniciada) abre una ventana con dos opciones:
//   1) Preguntar e inscribirme por WhatsApp  → inscribirPorWhatsapp()
//   2) Inscribirme desde la aplicación web   → pago por QR (js/inscripcion.js)
function inscribirse(boton) {
  if (!sesionActiva()) return pedirLogin('Inicia sesión para inscribirte a un plan.');

  const plan = {
    id: boton.dataset.planId || '',
    nombre: boton.dataset.planNombre || 'seleccionado',
    precio: boton.dataset.planPrecio || '',
    dias: boton.dataset.planDias || ''
  };

  // Tarjetas fijas del HTML (sin id: el servidor no respondió): solo se puede por WhatsApp.
  if (!plan.id || typeof Inscripcion === 'undefined') {
    const ventana = abrirVentanaWhatsapp();
    return inscribirPorWhatsapp(plan, ventana, boton);
  }
  Inscripcion.abrir(plan, boton);
}

// Opción WhatsApp: registra la solicitud (queda "pendiente" en Pagos) y abre
// WhatsApp con el mensaje ya escrito. Es la misma función de siempre.
// "ventana" se abre dentro del clic para que el navegador no la bloquee.
async function inscribirPorWhatsapp(plan, ventana, boton) {
  const { id, nombre, precio, dias } = plan;
  const detalle = precio ? ` (Bs ${precio}${dias ? ' / ' + dias + ' días' : ''})` : '';
  const actual = ESTADO.perfil && ESTADO.perfil.membresia;
  const persona = nombreSesion();

  let mensaje = `Hola, soy ${persona}. Quiero inscribirme al plan ${nombre}${detalle}.`;
  if (actual && actual.nombre) {
    mensaje = String(actual.membresia_id) === String(id)
      ? `Hola, soy ${persona}. Quiero renovar mi plan ${nombre}${detalle}.`
      : `Hola, soy ${persona}. Quiero cambiar mi plan ${actual.nombre} al plan ${nombre}${detalle}.`;
  }

  if (boton) boton.classList.add('cargando');
  try {
    if (id) {
      await CL.solicitarMembresia(Number(id));
      await cargarPerfil();
    }
    irAWhatsapp(ventana, mensaje);
    toast('Solicitud enviada. Te esperamos en WhatsApp para confirmar tu pago.');
    return true;
  } catch (err) {
    if (ventana) ventana.close();
    manejarErrorSesion(err);
    return false;
  } finally {
    if (boton) boton.classList.remove('cargando');
  }
}

async function reservarClase(boton) {
  if (!sesionActiva()) return pedirLogin('Inicia sesión para reservar tu clase.');

  const nombre = boton.dataset.claseNombre || 'seleccionada';
  const id = boton.dataset.claseId;
  const horario = boton.dataset.claseHorario;
  const mensaje = `Hola, soy ${nombreSesion()}. Quiero reservar la clase ${nombre}${horario ? ' (' + horario + ')' : ''}.`;

  const ventana = abrirVentanaWhatsapp();
  boton.classList.add('cargando');
  try {
    if (id) {
      await CL.reservarClase(Number(id));
      await cargarPerfil();
    }
    irAWhatsapp(ventana, mensaje);
    toast('Clase reservada. Confirma tu cupo por WhatsApp.');
  } catch (err) {
    if (ventana) ventana.close();
    manejarErrorSesion(err);
  } finally {
    boton.classList.remove('cargando');
  }
}

// Si la sesión venció, la página vuelve al estado sin sesión.
function manejarErrorSesion(err) {
  if (err && err.status === 401) {
    aplicarSesionUI();
    pedirLogin('Tu sesión venció. Inicia sesión otra vez.');
  } else {
    toast((err && err.message) || 'No se pudo completar la acción.', 'error');
  }
}

// ============ Mi membresía (solo con sesión) ============
async function cargarPerfil() {
  if (!sesionActiva()) { ESTADO.perfil = null; pintarMiMembresia(); pintarMiProgreso(); return; }
  try {
    ESTADO.perfil = await CL.perfil();
  } catch (err) {
    if (err && err.status === 401) { aplicarSesionUI(); return; }
    ESTADO.perfil = null;
  }
  pintarCodigoSesion();
  pintarMiMembresia();
  pintarMiProgreso();
  actualizarBotonesPlanes();
  actualizarBotonesClases();
}

function pintarMiMembresia() {
  const caja = $id('mi-membresia');
  const titulo = $id('membresias-titulo');
  const desc = $id('membresias-desc');
  if (!caja) return;

  const perfil = ESTADO.perfil;
  if (!sesionActiva() || !perfil) {
    caja.hidden = true;
    caja.innerHTML = '';
    if (titulo) titulo.textContent = 'Elige tu plan';
    if (desc) desc.textContent = 'Planes flexibles, sin letra chica. Todos incluyen evaluación inicial y acceso a la comunidad Megatlón.';
    return;
  }

  const m = perfil.membresia;
  const pend = perfil.solicitud_pendiente;
  let html = '';

  if (m) {
    const total = Number(m.duracion_dias) || 0;
    const dias = m.dias_restantes;
    const pct = total && dias != null ? Math.max(0, Math.min(100, Math.round((dias / total) * 100))) : 0;
    const vigente = m.vigente;
    html += `
      <article class="mm-card panel">
        <div class="mm-cabecera">
          <div>
            <span class="mm-chip">Tu membresía</span>
            <h3 class="mm-nombre">${escaparHtml(m.nombre || 'Plan')}</h3>
            ${codigoSesion() ? `<small class="codigo-usuario">${escaparHtml(nombreSesion())} · ${escaparHtml(codigoSesion())}</small>` : ''}
          </div>
          <span class="mm-estado ${vigente ? 'mm-estado--ok' : 'mm-estado--vencida'}">${vigente ? 'Activa' : 'Vencida'}</span>
        </div>
        <div class="mm-cuerpo">
          <div class="mm-dias">
            <span class="mm-dias-num">${dias != null ? escaparHtml(dias) : '—'}</span>
            <span class="mm-dias-txt">${dias === 1 ? 'día restante' : 'días restantes'}</span>
          </div>
          <dl class="mm-datos">
            <div><dt>Te inscribiste</dt><dd>${escaparHtml(fechaLarga(m.inicio))}</dd></div>
            <div><dt>${vigente ? 'Vence' : 'Venció'}</dt><dd>${escaparHtml(fechaLarga(m.vence))}</dd></div>
            <div><dt>Duración</dt><dd>${total ? escaparHtml(total) + ' días' : '—'}</dd></div>
            <div><dt>Precio</dt><dd>${m.precio != null ? 'Bs ' + escaparHtml(m.precio) : '—'}</dd></div>
          </dl>
        </div>
        <div class="mm-barra" role="img" aria-label="${pct}% de la membresía restante"><span style="width:${pct}%"></span></div>
        <div class="mm-acciones">
          <button type="button" class="mm-boton" data-accion="ir-planes">${vigente ? 'Cambiar o mejorar mi plan' : 'Renovar mi plan'}</button>
        </div>
      </article>`;
  } else {
    html += `
      <article class="mm-card mm-card--vacia panel">
        <span class="mm-chip">Tu membresía</span>
        <h3 class="mm-nombre">Todavía no tienes un plan activo</h3>
        <p class="text-sm text-muted-foreground">Elige uno abajo y te lo activamos apenas confirmemos tu pago.</p>
        <div class="mm-acciones"><button type="button" class="mm-boton" data-accion="ir-planes">Ver planes</button></div>
      </article>`;
  }

  if (pend) {
    html += pend.en_revision
      ? `<p class="mm-pendiente">Pago por QR en revisión: <strong>${escaparHtml(pend.membresia || 'plan')}</strong>. Se activa cuando el gimnasio confirme tu comprobante.</p>`
      : `<p class="mm-pendiente">Solicitud pendiente: <strong>${escaparHtml(pend.membresia || 'plan')}</strong>. Se activa cuando el gimnasio confirme tu pago.</p>`;
  }
  if (perfil.reservas && perfil.reservas.length) {
    const nombres = [...new Set(perfil.reservas.map(r => r.clase).filter(Boolean))];
    html += `<p class="mm-reservas">Tus clases reservadas: ${nombres.map(escaparHtml).join(' · ')}</p>`;
  }

  caja.innerHTML = html;
  caja.hidden = false;
  if (titulo) titulo.textContent = m ? 'Cambia o mejora tu plan' : 'Elige tu plan';
  if (desc) desc.textContent = m
    ? 'Elige otro plan y lo activamos cuando confirmemos tu pago.'
    : 'Planes flexibles, sin letra chica. Todos incluyen evaluación inicial y acceso a la comunidad Megatlón.';
}

function actualizarBotonesPlanes() {
  const m = ESTADO.perfil && ESTADO.perfil.membresia;
  document.querySelectorAll('[data-accion="inscribir"][data-plan-id]').forEach(btn => {
    let texto = 'Inscribirme';
    if (sesionActiva() && m) {
      texto = String(m.membresia_id) === btn.dataset.planId ? 'Renovar' : 'Cambiar a este plan';
    }
    btn.textContent = texto;
  });
}

function actualizarBotonesClases() {
  const reservadas = new Set(((ESTADO.perfil && ESTADO.perfil.reservas) || []).map(r => r.clase));
  document.querySelectorAll('[data-accion="reservar"][data-clase-id]').forEach(btn => {
    const ya = sesionActiva() && reservadas.has(btn.dataset.claseNombre);
    btn.textContent = ya ? 'Reservada ✓' : 'Reservar';
    btn.classList.toggle('reservada', ya);
  });
}

// ============ Mi progreso: peso y altura, antes y después (solo con sesión) ============
// El "antes" se pide al iniciar sesión. Aquí el cliente puede actualizar el
// "después" (y corregir el "antes"); se guarda en la base de datos
// (tablas clientes y progreso).
function numTexto(v) { return v == null ? '' : String(v); }

function categoriaImc(v) {
  if (v == null) return null;
  if (v < 18.5) return { texto: 'Bajo peso', emoji: '🥶', clase: 'aviso' };
  if (v < 25) return { texto: 'Peso saludable', emoji: '😎', clase: 'bien' };
  if (v < 30) return { texto: 'Sobrepeso', emoji: '😅', clase: 'aviso' };
  return { texto: 'Obesidad', emoji: '😟', clase: 'mal' };
}

// Estado general del progreso: emoji animado + mensaje (bien / igual / mal / sin datos).
function estadoProgreso(p) {
  if (!p || p.peso_despues == null || p.peso == null) {
    return { clase: 'inicio', emoji: '💪', titulo: '¡Empieza tu cambio!', texto: 'Escribe tu peso actual abajo y guárdalo para ver cómo vas.', diff: null };
  }
  const diff = Math.round((p.peso_despues - p.peso) * 10) / 10;
  if (diff < 0) return { clase: 'bien', emoji: '🎉', titulo: '¡Vas muy bien!', texto: `Has perdido ${Math.abs(diff)} kg. ¡Sigue así, campeón!`, diff };
  if (diff === 0) return { clase: 'igual', emoji: '😐', titulo: 'Sigues igual', texto: 'Tu peso se mantiene. ¡Un empujón más y lo logras!', diff };
  return { clase: 'mal', emoji: '😟', titulo: 'Vas por mal camino', texto: `Has subido ${diff} kg. ¡No te rindas, tú puedes volver a la ruta!`, diff };
}

function pintarMiProgreso() {
  const caja = $id('mi-progreso');
  if (!caja) return;
  const p = ESTADO.perfil && ESTADO.perfil.progreso;
  if (!sesionActiva() || !ESTADO.perfil || !p) { caja.hidden = true; caja.innerHTML = ''; return; }

  const campo = (name, etiqueta, valor, ph) =>
    `<label class="mp-campo"><span>${etiqueta}</span><input name="${name}" type="text" inputmode="decimal" maxlength="5" autocomplete="off" placeholder="${ph}" value="${escaparHtml(numTexto(valor))}"/></label>`;
  // "Antes": solo se muestra, no se puede editar (no es un input).
  const fijo = (etiqueta, valor, unidad) =>
    `<div class="mp-campo mp-campo--fijo"><span>${etiqueta}</span><div class="mp-fijo" aria-readonly="true" title="Este dato se guardó al registrarte y no se puede cambiar">🔒 ${valor == null ? '—' : escaparHtml(String(valor)) + ' ' + unidad}</div></div>`;

  const est = estadoProgreso(p);
  const imcValor = p.imc_despues != null ? p.imc_despues : p.imc_antes;
  const cat = categoriaImc(imcValor);
  const diffTxt = est.diff == null ? '—' : (est.diff === 0 ? '0 kg' : `${est.diff > 0 ? '+' : '−'}${Math.abs(est.diff)} kg`);
  const pesoActual = p.peso_despues != null ? `${escaparHtml(String(p.peso_despues))} kg` : '—';
  const flecha = est.diff == null ? '' : (est.diff < 0 ? '⬇️' : est.diff > 0 ? '⬆️' : '➡️');

  caja.innerHTML = `
    <article class="mm-card mp-card panel">
      <div class="mm-cabecera">
        <div>
          <span class="mm-chip">Mi progreso</span>
          <h3 class="mm-nombre">Antes y después</h3>
          ${codigoSesion() ? `<small class="codigo-usuario">${escaparHtml(nombreSesion())} · ${escaparHtml(codigoSesion())}</small>` : ''}
        </div>
      </div>

      <div class="mp-banner mp-banner--${est.clase}" role="status">
        <span class="mp-emoji" aria-hidden="true">${est.emoji}</span>
        <div class="mp-banner-texto">
          <strong>${escaparHtml(est.titulo)}</strong>
          <span>${escaparHtml(est.texto)}</span>
        </div>
      </div>

      <div class="mp-stats">
        <div class="mp-stat">
          <span class="mp-stat-et">Peso inicial</span>
          <span class="mp-stat-num">${p.peso != null ? escaparHtml(String(p.peso)) : '—'}<small> kg</small></span>
        </div>
        <div class="mp-stat">
          <span class="mp-stat-et">Peso actual</span>
          <span class="mp-stat-num">${p.peso_despues != null ? escaparHtml(String(p.peso_despues)) : '—'}<small> kg</small></span>
        </div>
        <div class="mp-stat mp-stat--${est.clase}">
          <span class="mp-stat-et">Diferencia</span>
          <span class="mp-stat-num">${flecha} ${diffTxt}</span>
        </div>
        <div class="mp-stat mp-stat--${cat ? cat.clase : 'inicio'}">
          <span class="mp-stat-et">Índice de masa corporal</span>
          <span class="mp-stat-num">${cat ? cat.emoji : ''} ${imcValor != null ? escaparHtml(String(imcValor)) : '—'}</span>
          <span class="mp-stat-sub">${cat ? cat.texto : 'Sin datos'}</span>
        </div>
      </div>

      <form id="form-progreso" class="mp-form" novalidate>
        <div class="mp-cols">
          <fieldset class="mp-col">
            <legend>Antes (registro)</legend>
            ${fijo('Peso', p.peso, 'kg')}
            ${fijo('Altura', p.altura, 'm')}
          </fieldset>
          <fieldset class="mp-col mp-col--editable">
            <legend>Después (editable)</legend>
            ${campo('peso_despues', 'Peso (kg)', p.peso_despues, 'ej. 68')}
            ${campo('altura_despues', 'Altura (m)', p.altura_despues, 'ej. 1.75')}
          </fieldset>
        </div>
        <div class="mm-acciones">
          <button type="submit" class="mm-boton">Actualizar mi progreso</button>
        </div>
        <p id="mp-status" class="sesion-status" hidden></p>
      </form>
    </article>`;
  caja.hidden = false;

  const form = $id('form-progreso');
  form.querySelectorAll('input').forEach(i => i.addEventListener('input', () => { i.value = i.value.replace(/[^0-9.,]/g, ''); }));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const st = $id('mp-status');
    const boton = form.querySelector('button[type="submit"]');
    const datos = {};
    new FormData(form).forEach((v, k) => { datos[k] = String(v).trim(); });
    st.hidden = true;
    boton.disabled = true;
    const texto = boton.textContent;
    boton.textContent = 'Guardando...';
    try {
      const r = await CL.actualizarProgreso(datos);
      ESTADO.perfil.progreso = r.progreso;
      pintarMiProgreso();
      toast('Progreso actualizado.');
    } catch (err) {
      if (err.status === 401) manejarErrorSesion(err);
      else { st.textContent = err.message; st.className = 'sesion-status sesion-status--error'; st.hidden = false; }
      boton.disabled = false;
      boton.textContent = texto;
    }
  });
}

// ============ Inicio de sesión por código (sección "Da el primer paso") ============
function statusSesion(texto, tipo) {
  const p = $id('sesion-status');
  if (!p) return;
  if (!texto) { p.hidden = true; return; }
  p.textContent = texto;
  p.className = 'sesion-status' + (tipo === 'error' ? ' sesion-status--error' : tipo === 'ok' ? ' sesion-status--ok' : '');
  p.hidden = false;
}

function mostrarPasoLogin(paso) {
  const f1 = $id('form-login-1');
  const fm = $id('form-mensaje');
  if (f1) f1.hidden = paso !== 1;
  if (fm) fm.hidden = paso !== 3;
}

function conectarLogin() {
  const f1 = $id('form-login-1');
  const fm = $id('form-mensaje');
  if (!f1 || !CL) return;

  const ocupado = (form, si, textoOcupado) => {
    const b = form.querySelector('button[type="submit"]');
    if (!b) return;
    if (si) { b.dataset.texto = b.textContent; b.textContent = textoOcupado; b.disabled = true; }
    else { b.textContent = b.dataset.texto || b.textContent; b.disabled = false; }
  };

  // Mientras escribe: el nombre no admite números ni símbolos, el teléfono solo dígitos (máx. 8).
  const campoNombre = $id('login-nombre');
  const campoTel = $id('login-telefono');
  const campoCarnet = $id('login-carnet');
  const campoPeso = $id('login-peso');
  const campoAltura = $id('login-altura');
  // Carnet de identidad: solo números (máx. 10).
  if (campoCarnet) campoCarnet.addEventListener('input', () => {
    campoCarnet.value = campoCarnet.value.replace(/\D/g, '').slice(0, 10);
  });
  // Peso y altura: solo números, punto o coma.
  [campoPeso, campoAltura].forEach(c => { if (c) c.addEventListener('input', () => { c.value = c.value.replace(/[^0-9.,]/g, ''); }); });
  if (campoNombre) campoNombre.addEventListener('input', () => {
    campoNombre.value = campoNombre.value.replace(/[^\p{L}\s'.\-]/gu, '');
  });
  if (campoTel) campoTel.addEventListener('input', () => {
    campoTel.value = campoTel.value.replace(/\D/g, '').slice(0, 8);
  });

  const marcar = (campo) => {
    if (!campo) return;
    campo.classList.remove('campo-invalido'); void campo.offsetWidth; campo.classList.add('campo-invalido');
    campo.focus();
    setTimeout(() => campo.classList.remove('campo-invalido'), 1500);
  };

  // Nombre + correo + teléfono → sesión iniciada al instante
  f1.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = campoNombre.value.trim().replace(/\s+/g, ' ');
    const correo = $id('login-correo').value.trim().toLowerCase();
    const telefono = campoTel.value.trim();
    const digitos = telefono.replace(/\D/g, '');
    const carnet = (campoCarnet ? campoCarnet.value : '').replace(/\s+/g, '');
    const peso = Number(String(campoPeso ? campoPeso.value : '').trim().replace(',', '.'));
    let altura = Number(String(campoAltura ? campoAltura.value : '').trim().replace(',', '.'));
    if (altura >= 100 && altura <= 250) altura = altura / 100; // escribió centímetros

    if (!nombre) { marcar(campoNombre); return statusSesion('Escribe tu nombre.', 'error'); }
    if (nombre.length < 2 || !/^\p{L}[\p{L}\s'.\-]*$/u.test(nombre)) { marcar(campoNombre); return statusSesion('El nombre solo puede tener letras, sin números.', 'error'); }
    if (!/^(?=[^@]*[A-Za-z])[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,}$/.test(correo)) { marcar($id('login-correo')); return statusSesion('Escribe un correo válido (con letras y @, no solo números).', 'error'); }
    if (!/^\d{5,10}$/.test(carnet)) { marcar(campoCarnet); return statusSesion('El carnet de identidad solo acepta números (de 5 a 10 dígitos, ej. 1234567).', 'error'); }
    if (digitos.length < 7 || digitos.length > 8) { marcar(campoTel); return statusSesion('Escribe un teléfono válido: solo números, de 7 a 8 dígitos.', 'error'); }
    if (!(peso >= 20 && peso <= 400)) { marcar(campoPeso); return statusSesion('Escribe tu peso en kilos (entre 20 y 400, ej. 70 o 70.5).', 'error'); }
    if (!(altura >= 0.5 && altura <= 2.5)) { marcar(campoAltura); return statusSesion('Escribe tu altura en metros (ej. 1.75) o en centímetros (ej. 175).', 'error'); }

    statusSesion('');
    ocupado(f1, true, 'Entrando...');
    try {
      await CL.entrar(nombre, correo, telefono, carnet, String(peso), String(altura));
      f1.reset();
      aplicarSesionUI();
      // Vuelve al inicio: ahí se ve el nombre en rojo junto al título
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
      toast(`¡Bienvenido, ${nombreSesion()}!`);
    } catch (err) {
      statusSesion(err.message, 'error');
    } finally {
      ocupado(f1, false);
    }
  });

  // Mensaje para la página (solo con sesión)
  let estrellas = 5;
  const cajaEstrellas = $id('mensaje-estrellas');
  if (cajaEstrellas) {
    const pintar = () => {
      cajaEstrellas.innerHTML = Array.from({ length: 5 }, (_, i) =>
        `<button type="button" class="estrella-btn${i < estrellas ? ' activa' : ''}" data-valor="${i + 1}" aria-label="${i + 1} estrellas" role="radio" aria-checked="${i + 1 === estrellas}">&#9733;</button>`
      ).join('');
    };
    cajaEstrellas.addEventListener('click', (e) => {
      const b = e.target.closest('[data-valor]');
      if (b) { estrellas = Number(b.dataset.valor); pintar(); }
    });
    pintar();
  }

  if (fm) fm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const texto = $id('mensaje-texto').value.trim();
    if (!texto) return statusSesion('Escribe tu mensaje.', 'error');
    ocupado(fm, true, 'Enviando...');
    try {
      await CL.enviarMensaje(texto, estrellas);
      $id('mensaje-texto').value = '';
      statusSesion('¡Gracias! Tu mensaje llegó al gimnasio.', 'ok');
    } catch (err) {
      if (err.status === 401) manejarErrorSesion(err); else statusSesion(err.message, 'error');
    } finally {
      ocupado(fm, false);
    }
  });

  const salir = $id('btn-salir');
  if (salir) salir.addEventListener('click', () => {
    CL.salir();
    ESTADO.perfil = null;
    ESTADO.playlist = [];
    aplicarSesionUI();
    toast('Sesión cerrada.');
  });
}

// Cambia toda la página según haya o no sesión.
function aplicarSesionUI() {
  const activa = sesionActiva();
  const nombre = nombreSesion();

  // Cabecera
  const navIniciar = $id('nav-iniciar');
  const navUsuario = $id('nav-usuario');
  if (navIniciar) navIniciar.hidden = activa;
  if (navUsuario) navUsuario.hidden = !activa;
  if ($id('nav-usuario-nombre')) $id('nav-usuario-nombre').textContent = nombre;
  pintarCodigoSesion();

  // Portada: "Entrena más fuerte. Vive mejor. <Nombre>" con el nombre en rojo
  const heroNombre = $id('hero-nombre');
  if (heroNombre) { heroNombre.textContent = nombre; heroNombre.hidden = !activa; }

  // Sección "Da el primer paso": login ↔ mensaje
  const sub = $id('contacto-subtitulo');
  if (activa) {
    mostrarPasoLogin(3);
    if ($id('mensaje-nombre')) $id('mensaje-nombre').textContent = nombre;
    if (sub) sub.textContent = 'Sesión iniciada';
    if ($id('sesion-aviso')) $id('sesion-aviso').hidden = true;
  } else {
    mostrarPasoLogin(1);
    if (sub) sub.textContent = 'Iniciar sesión';
  }
  statusSesion('');

  document.documentElement.classList.toggle('con-sesion', activa);

  // Contenido que depende del usuario
  if (activa) {
    cargarPerfil();
    cargarPlaylist();
  } else {
    ESTADO.perfil = null;
    ESTADO.playlist = [];
    pintarMiMembresia();
    pintarMiProgreso();
    actualizarBotonesPlanes();
    actualizarBotonesClases();
    pintarPlaylist();
    pintarResultados();
  }
}

// ============ Música: buscador de YouTube + playlist en la base de datos ============
// Buscar reproduce el primer resultado en el mini-reproductor flotante
// (esquina inferior derecha), que sigue sonando mientras se navega el resto
// de la página. El corazón guarda la canción en la tabla "musica" de la
// base de datos, ligada al usuario que inició sesión.
const MUSICA = {
  resultados: [],
  actual: null,
  cola: [],
  indice: -1,
  player: null,
  sinApi: false
};

const formMusica = $id('form-musica');
const inputMusica = $id('input-musica');
const cajaReproduciendo = $id('musica-reproduciendo');
const textoReproduciendo = $id('musica-reproduciendo-texto');
const btnGuardarCancion = $id('btn-guardar-cancion');
const listaResultados = $id('lista-musica');
const listaPlaylist = $id('lista-playlist');
const reproductorFlotante = $id('reproductor-flotante');
const reproductorTitulo = $id('reproductor-titulo');

function estadoMusica(texto, tipo) {
  const p = $id('musica-estado');
  if (!p) return;
  if (!texto) { p.hidden = true; return; }
  p.textContent = texto;
  p.className = 'musica-estado' + (tipo === 'error' ? ' musica-estado--error' : '');
  p.hidden = false;
}

const estaGuardada = (videoId) => ESTADO.playlist.some(c => c.video_id === videoId);

function cargarApiYouTube() {
  return new Promise((resolve, reject) => {
    if (window.YT && window.YT.Player) return resolve();
    const anterior = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { if (typeof anterior === 'function') anterior(); resolve(); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => reject(new Error('No cargó la API de YouTube'));
    document.head.appendChild(s);
    setTimeout(() => reject(new Error('La API de YouTube tardó demasiado')), 10000);
  });
}

function iconoReproduccion(sonando) {
  const pausa = $id('rp-icono-pausa');
  const play = $id('rp-icono-play');
  if (pausa) pausa.hidden = !sonando;
  if (play) play.hidden = sonando;
}

function alTerminarOFallar() {
  if (MUSICA.indice + 1 < MUSICA.cola.length) siguienteCancion();
  else iconoReproduccion(false);
}

async function crearReproductor(videoId) {
  await cargarApiYouTube();
  return new Promise((resolve) => {
    MUSICA.player = new window.YT.Player('yt-player', {
      width: '100%',
      height: '100%',
      videoId,
      playerVars: { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1 },
      events: {
        onReady: (ev) => { try { ev.target.playVideo(); } catch {} resolve(ev.target); },
        onStateChange: (ev) => {
          const S = window.YT.PlayerState;
          if (ev.data === S.ENDED) alTerminarOFallar();
          else iconoReproduccion(ev.data === S.PLAYING || ev.data === S.BUFFERING);
        },
        onError: () => {
          estadoMusica('Ese video no permite reproducirse aquí. Pasamos al siguiente.', 'error');
          alTerminarOFallar();
        }
      }
    });
  });
}

// Plan B si el navegador bloquea la API de YouTube: iframe simple.
function reproducirConIframe(videoId) {
  MUSICA.sinApi = true;
  const wrap = document.querySelector('.rp-video');
  if (!wrap) return;
  wrap.innerHTML = `<iframe src="https://www.youtube.com/embed/${encodeURIComponent(videoId)}?autoplay=1&playsinline=1&rel=0" title="Reproductor de música" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
  if ($id('rp-play')) $id('rp-play').hidden = true;
}

async function reproducir(pista, cola, indice) {
  if (!pista) return;
  MUSICA.actual = pista;
  MUSICA.cola = cola && cola.length ? cola : [pista];
  MUSICA.indice = indice != null && indice >= 0 ? indice : 0;

  if (reproductorFlotante) reproductorFlotante.classList.add('activo');
  if (reproductorTitulo) reproductorTitulo.textContent = pista.titulo;
  if (textoReproduciendo) textoReproduciendo.textContent = `Reproduciendo: ${pista.titulo}`;
  if (cajaReproduciendo) cajaReproduciendo.classList.add('activo');
  actualizarCorazonMusica();
  pintarResultados();
  pintarPlaylist();

  try {
    if (MUSICA.sinApi) reproducirConIframe(pista.video_id);
    else if (MUSICA.player && MUSICA.player.loadVideoById) MUSICA.player.loadVideoById(pista.video_id);
    else await crearReproductor(pista.video_id);
    iconoReproduccion(true);
  } catch {
    reproducirConIframe(pista.video_id);
  }
}

function siguienteCancion() {
  const i = MUSICA.indice + 1;
  if (i < MUSICA.cola.length) reproducir(MUSICA.cola[i], MUSICA.cola, i);
}
function anteriorCancion() {
  const i = MUSICA.indice - 1;
  if (i >= 0) reproducir(MUSICA.cola[i], MUSICA.cola, i);
}

function actualizarCorazonMusica() {
  if (!btnGuardarCancion) return;
  const guardada = MUSICA.actual && estaGuardada(MUSICA.actual.video_id);
  btnGuardarCancion.innerHTML = guardada ? '&#9829;' : '&#9825;';
  btnGuardarCancion.classList.toggle('guardada', Boolean(guardada));
}

// Guardar / quitar del corazón. Sin sesión pide iniciar sesión.
async function alternarGuardada(pista) {
  if (!pista) return;
  if (!sesionActiva()) return pedirLogin('Inicia sesión para guardar canciones en tu playlist.');
  try {
    if (estaGuardada(pista.video_id)) await CL.quitarCancion(pista.video_id);
    else await CL.guardarCancion({ video_id: pista.video_id, titulo: pista.titulo, canal: pista.canal, consulta: pista.consulta || '' });
    await cargarPlaylist();
  } catch (err) {
    manejarErrorSesion(err);
  }
}

async function cargarPlaylist() {
  if (!sesionActiva()) { ESTADO.playlist = []; pintarPlaylist(); pintarResultados(); return; }
  try {
    ESTADO.playlist = await CL.playlist();
  } catch (err) {
    if (err && err.status === 401) { aplicarSesionUI(); return; }
    ESTADO.playlist = [];
  }
  pintarPlaylist();
  pintarResultados();
  actualizarCorazonMusica();
}

function htmlCancion(c, extra) {
  const sonando = MUSICA.actual && MUSICA.actual.video_id === c.video_id;
  return `
    <button type="button" class="ic-play" data-reproducir="${escaparHtml(c.video_id)}" title="Reproducir">
      <img class="ic-mini" src="${escaparHtml(c.miniatura || 'https://i.ytimg.com/vi/' + c.video_id + '/mqdefault.jpg')}" alt="" loading="lazy" width="64" height="36"/>
      <span class="ic-textos">
        <span class="ic-titulo">${escaparHtml(c.titulo)}</span>
        <span class="ic-canal">${escaparHtml(c.canal || '')}</span>
      </span>
      ${sonando ? '<span class="ic-ecualizador" aria-label="Sonando"><i></i><i></i><i></i></span>' : ''}
    </button>
    ${extra}`;
}

function pintarResultados() {
  if (!listaResultados) return;
  listaResultados.innerHTML = '';
  MUSICA.resultados.forEach((c, i) => {
    const li = document.createElement('li');
    const guardada = estaGuardada(c.video_id);
    li.className = 'item-cancion' + (MUSICA.actual && MUSICA.actual.video_id === c.video_id ? ' sonando' : '');
    li.innerHTML = htmlCancion(c, `<button type="button" class="ic-corazon${guardada ? ' guardada' : ''}" data-guardar="${escaparHtml(c.video_id)}" aria-label="${guardada ? 'Quitar de mi playlist' : 'Guardar en mi playlist'}" title="${guardada ? 'Quitar de mi playlist' : 'Guardar en mi playlist'}">${guardada ? '&#9829;' : '&#9825;'}</button>`);
    li.querySelector('[data-reproducir]').addEventListener('click', () => reproducir(c, MUSICA.resultados, i));
    li.querySelector('[data-guardar]').addEventListener('click', () => alternarGuardada(c));
    listaResultados.appendChild(li);
  });
}

function pintarPlaylist() {
  if (!listaPlaylist) return;
  const btnTodo = $id('btn-reproducir-todo');
  listaPlaylist.innerHTML = '';

  if (!sesionActiva()) {
    if (btnTodo) btnTodo.hidden = true;
    listaPlaylist.innerHTML = `<li class="text-sm text-muted-foreground">Inicia sesión para guardar y escuchar tu playlist. <button type="button" class="sesion-link" data-accion="login" data-mensaje="Inicia sesión para ver tu playlist.">Iniciar sesión</button></li>`;
    return;
  }

  if (ESTADO.playlist.length === 0) {
    if (btnTodo) btnTodo.hidden = true;
    listaPlaylist.innerHTML = '<li id="playlist-vacio" class="text-sm text-muted-foreground">Todavía no hay canciones. Busca y presiona el corazón.</li>';
    return;
  }

  if (btnTodo) btnTodo.hidden = false;
  ESTADO.playlist.forEach((c, i) => {
    const li = document.createElement('li');
    li.className = 'item-cancion' + (MUSICA.actual && MUSICA.actual.video_id === c.video_id ? ' sonando' : '');
    li.innerHTML = htmlCancion(c, `<button type="button" class="item-playlist-quitar" title="Quitar de la playlist" aria-label="Quitar de la playlist">&times;</button>`);
    li.querySelector('[data-reproducir]').addEventListener('click', () => reproducir(c, ESTADO.playlist, i));
    li.querySelector('.item-playlist-quitar').addEventListener('click', () => alternarGuardada(c));
    listaPlaylist.appendChild(li);
  });
}

if (formMusica && inputMusica && CL) {
  formMusica.addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = inputMusica.value.trim();
    if (!q) return;
    estadoMusica('Buscando en YouTube...');
    const boton = formMusica.querySelector('button[type="submit"]');
    if (boton) boton.disabled = true;
    try {
      const resultados = await CL.buscarMusica(q);
      MUSICA.resultados = resultados.map(r => ({ ...r, consulta: q }));
      estadoMusica('');
      pintarResultados();
      // Suena el primer resultado en segundo plano; los demás quedan listados
      reproducir(MUSICA.resultados[0], MUSICA.resultados, 0);
    } catch (err) {
      MUSICA.resultados = [];
      pintarResultados();
      estadoMusica(err.message, 'error');
    } finally {
      if (boton) boton.disabled = false;
    }
  });
}

if (btnGuardarCancion) btnGuardarCancion.addEventListener('click', () => alternarGuardada(MUSICA.actual));

const btnTodo = $id('btn-reproducir-todo');
if (btnTodo) btnTodo.addEventListener('click', () => reproducir(ESTADO.playlist[0], ESTADO.playlist, 0));

if ($id('rp-next')) $id('rp-next').addEventListener('click', siguienteCancion);
if ($id('rp-prev')) $id('rp-prev').addEventListener('click', anteriorCancion);
if ($id('rp-play')) $id('rp-play').addEventListener('click', () => {
  const p = MUSICA.player;
  if (!p || !p.getPlayerState) return;
  if (p.getPlayerState() === window.YT.PlayerState.PLAYING) p.pauseVideo(); else p.playVideo();
});

const btnReproductorCerrar = $id('btn-reproductor-cerrar');
if (btnReproductorCerrar) {
  btnReproductorCerrar.addEventListener('click', () => {
    try { if (MUSICA.player && MUSICA.player.stopVideo) MUSICA.player.stopVideo(); } catch {}
    if (MUSICA.sinApi) {
      const wrap = document.querySelector('.rp-video');
      if (wrap) wrap.innerHTML = '<div id="yt-player"></div>';
      MUSICA.sinApi = false;
      MUSICA.player = null;
      if ($id('rp-play')) $id('rp-play').hidden = false;
    }
    reproductorFlotante.classList.remove('activo');
    MUSICA.actual = null;
    if (cajaReproduciendo) cajaReproduciendo.classList.remove('activo');
    actualizarCorazonMusica();
    pintarResultados();
    pintarPlaylist();
  });
}

// ============ Mensajes que el admin eligió mostrar en la página ============
// La sección arranca oculta: solo aparece si en el panel (Mensajes de
// contacto) hay al menos un mensaje marcado para mostrarse.
function estrellasSvg(activa) {
  return `<svg aria-hidden="true" class="lucide lucide-star size-3.5 text-primary${activa ? ' fill-primary' : ' fill-none stroke-current'}" fill="none" height="24" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg"><path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"></path></svg>`;
}

async function pintarMensajesElegidos() {
  const seccion = $id('testimonios');
  const contenedor = document.querySelector('[data-fallback="testimonios"]');
  if (!seccion || !contenedor || typeof MegatlonDB === 'undefined' || !MegatlonDB.testimoniosPublicos) return;

  try {
    const mensajes = await MegatlonDB.testimoniosPublicos();
    if (!mensajes || mensajes.length === 0) { seccion.hidden = true; return; }

    contenedor.innerHTML = mensajes.map((t) => {
      const n = Math.max(0, Math.min(5, Number(t.calificacion) || 5));
      const inicial = (String(t.nombre || '?').trim()[0] || '?').toUpperCase();
      return `
      <figure class="panel p-6 transition-transform hover:-translate-y-1">
        <div class="flex items-center gap-3">
          <span class="avatar-inicial" aria-hidden="true">${escaparHtml(inicial)}</span>
          <div>
            <figcaption class="font-semibold">${escaparHtml(t.nombre)}</figcaption>
            <div class="flex gap-0.5">
              ${Array.from({ length: 5 }, (_, s) => estrellasSvg(s < n)).join('')}
            </div>
          </div>
        </div>
        <blockquote class="mt-4 text-sm text-muted-foreground">&ldquo;${escaparHtml(t.mensaje || '')}&rdquo;</blockquote>
      </figure>`;
    }).join('');
    seccion.hidden = false;
  } catch {
    seccion.hidden = true;
  }
}

// ============ Animación de entrada al hacer scroll ============
function activarRevelado() {
  if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const io = new IntersectionObserver((entradas) => {
    entradas.forEach(en => { if (en.isIntersecting) { en.target.classList.add('visto'); io.unobserve(en.target); } });
  }, { threshold: 0.08, rootMargin: '0px 0px -6% 0px' });
  document.querySelectorAll('main section:not(:first-child) > .contenedor').forEach(el => {
    el.classList.add('revelar');
    io.observe(el);
  });
}

// ============ Logo del menú con efecto máquina de escribir ============
// Escribe "egatlón" junto a la M del logo, espera, lo borra y vuelve a empezar.
function activarMaquinaEscribir() {
  const el = $id('logo-tipeo');
  if (!el) return;
  const texto = 'egatlón'; // la M es la imagen del logo
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = texto; return; }
  let i = 0, borrando = false;
  const paso = () => {
    if (!borrando) {
      i++;
      el.textContent = texto.slice(0, i);
      if (i === texto.length) { borrando = true; return setTimeout(paso, 2600); }
      return setTimeout(paso, 120 + Math.random() * 70);
    }
    i--;
    el.textContent = texto.slice(0, i);
    if (i === 0) { borrando = false; return setTimeout(paso, 600); }
    setTimeout(paso, 55);
  };
  el.textContent = '';
  setTimeout(paso, 500);
}

// ============ Arranque ============
activarMaquinaEscribir();
conectarLogin();
aplicarSesionUI();
pintarMensajesElegidos();
activarRevelado();
