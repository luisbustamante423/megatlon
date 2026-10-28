// ============ Capa de datos — Megatlón ============
// Conectada al backend Node + Express + SQLite.
// El panel administrativo utiliza la API real de /server.

(function (global) {

  // Si el HTML se abre desde el propio servidor Node (puerto 3000) usamos
  // rutas relativas. Si se abre desde otro origen (ej. Live Server :5500,
  // o directo con file://), apuntamos igual al backend Node en localhost:3000.
  const BACKEND_PORT = '3000';
  const mismoOrigenQueBackend =
    location.protocol.startsWith('http') && (location.port === BACKEND_PORT || location.port === '');

  const API_BASE = mismoOrigenQueBackend
    ? '/api'
    : `${location.protocol.startsWith('http') ? location.protocol : 'http:'}//${location.hostname || 'localhost'}:${BACKEND_PORT}/api`;

  const SESSION_KEY = 'megatlon_session_v2';

  let TOKEN = null;

  // --------------------------------------------------
  // Sesión
  // --------------------------------------------------

  function cargarToken() {
    try {
      const sesion = localStorage.getItem(SESSION_KEY);

      if (!sesion) {
        TOKEN = null;
        return null;
      }

      const datos = JSON.parse(sesion);
      TOKEN = datos.token || null;

      return TOKEN;

    } catch {
      TOKEN = null;
      return null;
    }
  }

  function guardarSesion(data) {
    TOKEN = data.token;

    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify(data)
    );
  }

  function limpiarSesion() {
    TOKEN = null;
    localStorage.removeItem(SESSION_KEY);
  }

  // --------------------------------------------------
  // Petición general a la API
  // --------------------------------------------------

  async function request(ruta, opciones = {}) {

    if (!TOKEN) {
      cargarToken();
    }

    const headers = {
      'Content-Type': 'application/json',
      ...(opciones.headers || {})
    };

    if (TOKEN) {
      headers.Authorization = `Bearer ${TOKEN}`;
    }

    const respuesta = await fetch(
      `${API_BASE}${ruta}`,
      {
        ...opciones,
        headers
      }
    );

    let datos = null;

    try {
      datos = await respuesta.json();
    } catch {
      datos = null;
    }

    if (!respuesta.ok) {

      const mensaje =
        datos?.error ||
        `Error HTTP ${respuesta.status}`;

      throw new Error(mensaje);
    }

    return datos;
  }

  // --------------------------------------------------
  // LOGIN
  // --------------------------------------------------

  async function login(correo, contraseña) {

    const data = await request(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({
          correo,
          contraseña
        })
      }
    );

    guardarSesion(data);

    return data;
  }

  // --------------------------------------------------
  // USUARIO ACTUAL
  // --------------------------------------------------

  async function me() {

    if (!TOKEN) {
      cargarToken();
    }

    if (!TOKEN) {
      throw new Error('No autenticado');
    }

    return await request('/auth/me');
  }

  // --------------------------------------------------
  // CERRAR SESIÓN
  // --------------------------------------------------

  function logout() {

    limpiarSesion();
  }

  // --------------------------------------------------
  // METADATOS
  // --------------------------------------------------

  async function meta() {

    return await request('/meta');
  }

  // --------------------------------------------------
  // LISTAR
  // --------------------------------------------------

  async function list(tabla) {

    return await request(`/${tabla}`);
  }

  // --------------------------------------------------
  // OBTENER UNO
  // --------------------------------------------------

  async function get(tabla, id) {

    return await request(
      `/${tabla}/${id}`
    );
  }

  // --------------------------------------------------
  // CREAR
  // --------------------------------------------------

  async function create(tabla, payload) {

    return await request(
      `/${tabla}`,
      {
        method: 'POST',
        body: JSON.stringify(payload)
      }
    );
  }

  // --------------------------------------------------
  // ACTUALIZAR
  // --------------------------------------------------

  async function update(tabla, id, payload) {

    return await request(
      `/${tabla}/${id}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload)
      }
    );
  }

  // --------------------------------------------------
  // ELIMINAR
  // --------------------------------------------------

  async function remove(tabla, id) {

    return await request(
      `/${tabla}/${id}`,
      {
        method: 'DELETE'
      }
    );
  }

  // --------------------------------------------------
  // LECTURA PÚBLICA (sin login) para pintar la landing
  // --------------------------------------------------

  async function peticionPublica(ruta) {

    const respuesta = await fetch(`${API_BASE}/public${ruta}`);

    if (!respuesta.ok) {
      throw new Error(`Error HTTP ${respuesta.status}`);
    }

    return await respuesta.json();
  }

  async function membresiasPublicas() {

    return await peticionPublica('/membresias');
  }

  async function clasesPublicas() {

    return await peticionPublica('/clases');
  }

  async function entrenadoresPublicos() {

    return await peticionPublica('/entrenadores');
  }

  async function instalacionesPublicas() {

    return await peticionPublica('/instalaciones');
  }

  // QR de pago que subió el admin (el más reciente). { imagen: null } si no hay.
  async function qrPublico() {

    return await peticionPublica('/qr');
  }

  async function testimoniosPublicos() {

    return await peticionPublica('/testimonios');
  }

  // --------------------------------------------------
  // SESIÓN DE CLIENTE (landing): login por código de correo
  // --------------------------------------------------
  //
  // Se guarda aparte de la sesión del panel admin (otra clave), para que
  // iniciar sesión en la página nunca pise la sesión del administrador.
  //

  const CLIENTE_KEY = 'megatlon_cliente_v1';

  function clienteSesion() {
    try {
      const raw = localStorage.getItem(CLIENTE_KEY);
      const datos = raw ? JSON.parse(raw) : null;
      return datos && datos.token ? datos : null;
    } catch {
      return null;
    }
  }

  function clienteGuardarSesion(datos) {
    localStorage.setItem(CLIENTE_KEY, JSON.stringify(datos));
  }

  function clienteSalir() {
    localStorage.removeItem(CLIENTE_KEY);
  }

  async function llamar(ruta, opciones = {}, conSesion = false) {
    const headers = { 'Content-Type': 'application/json', ...(opciones.headers || {}) };
    if (conSesion) {
      const ses = clienteSesion();
      if (ses) headers.Authorization = `Bearer ${ses.token}`;
    }

    let respuesta;
    try {
      respuesta = await fetch(`${API_BASE}${ruta}`, { ...opciones, headers });
    } catch {
      throw new Error('No hay conexión con el servidor. ¿Está encendido?');
    }

    let cuerpo = null;
    try { cuerpo = await respuesta.json(); } catch { cuerpo = null; }

    if (!respuesta.ok) {
      const error = new Error((cuerpo && cuerpo.error) || `Error HTTP ${respuesta.status}`);
      error.status = respuesta.status;
      // Sesión vencida o usuario borrado: se limpia para pedir login de nuevo.
      if (conSesion && respuesta.status === 401) clienteSalir();
      throw error;
    }
    return cuerpo;
  }

  const enviar = (datos, metodo = 'POST') => ({ method: metodo, body: JSON.stringify(datos) });

  const cliente = {
    sesion: clienteSesion,
    salir: clienteSalir,

    async entrar(nombre, correo, telefono, carnet, peso, altura) {
      const datos = await llamar('/public/auth/entrar', enviar({ nombre, correo, telefono, carnet, peso, altura }));
      clienteGuardarSesion(datos);
      return datos;
    },

    perfil: () => llamar('/cliente/perfil', {}, true),
    solicitarMembresia: (membresia_id) => llamar('/cliente/membresia', enviar({ membresia_id }), true),
    // Pago por QR: manda el comprobante (imagen en data URL) y devuelve el recibo.
    pagarPorQr: (membresia_id, comprobante) => llamar('/cliente/pago-qr', enviar({ membresia_id, comprobante }), true),
    // Mi progreso: peso y altura, antes y después.
    progreso: () => llamar('/cliente/progreso', {}, true),
    actualizarProgreso: (datos) => llamar('/cliente/progreso', enviar(datos, 'PUT'), true),
    reservarClase: (clase_id) => llamar('/cliente/reservas', enviar({ clase_id }), true),
    enviarMensaje: (mensaje, calificacion) => llamar('/cliente/mensaje', enviar({ mensaje, calificacion }), true),

    playlist: () => llamar('/cliente/musica', {}, true),
    guardarCancion: (cancion) => llamar('/cliente/musica', enviar(cancion), true),
    quitarCancion: (video_id) => llamar(`/cliente/musica/${encodeURIComponent(video_id)}`, { method: 'DELETE' }, true),

    // La búsqueda de música no pide sesión: escuchar es libre.
    buscarMusica: (q) => llamar(`/public/musica/buscar?q=${encodeURIComponent(q)}`)
  };

  // --------------------------------------------------
  // CONTENIDO DEL SITIO
  // --------------------------------------------------
  //
  // Se guarda en la tabla contenido_sitio de SQLite.
  //

  const CONTENIDO_KEY = 'megatlon_contenido_v1';

  function contenidoPorDefecto() {

    return {

      hero_ubicacion: 'Cochabamba · Bolivia',

      hero_titulo: 'Entrena más fuerte. Vive mejor.',

      hero_subtitulo:
        'El gimnasio más moderno de Cochabamba.',

      hero_stat1_numero: '+2.500',

      hero_stat1_etiqueta: 'Socios activos',

      hero_stat2_numero: '24/7',

      hero_stat2_etiqueta: 'Acceso Élite',

      hero_stat3_numero: '+30',

      hero_stat3_etiqueta: 'Clases semanales',

      contacto_direccion:
        'Av. Ballivián, Cochabamba, Bolivia',

      contacto_telefono:
        '62668272',

      contacto_horarios:
        'Lunes-viernes: 6:00 AM – 10:00 PM\nSábado: 8:00 AM – 2:00 PM\nDomingo: Cerrado',

      contacto_mapa_src:
        'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3807.4194340960457!2d-66.15705012616652!3d-17.391647564307444!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x93e373f7ec6f5e77%3A0xb9deabd148ad350e!2sMegatlon%20Fitness%20Club!5e0!3m2!1ses-419!2sbo!4v1788465656991!5m2!1ses-419!2sbo',

      footer_mensaje:
        'Megatlón Cochabamba. Fuerza, disciplina y alto rendimiento.',

      red_instagram: 'https://instagram.com/kox_zyx',

      red_facebook: 'https://facebook.com/megatlon',

      red_tiktok: 'https://tiktok.com/@luisbustamante000',

      red_whatsapp: 'https://wa.me/59162668272'
    };
  }

  // Caché en memoria: getContenido() sigue siendo síncrono para la landing.
  // La verdad está en la base de datos (tabla contenido_sitio).
  let contenidoCache = null;

  function getContenido() {
    return { ...contenidoPorDefecto(), ...(contenidoCache || {}) };
  }

  // Trae el contenido guardado del servidor (público, sin login).
  async function cargarContenido() {
    try {
      const r = await fetch(`${API_BASE}/public/contenido`);
      if (r.ok) contenidoCache = await r.json();
    } catch { /* sin conexión: se usan los valores por defecto */ }
    return getContenido();
  }

  // Guarda en la base de datos (solo admin).
  async function setContenido(datos) {
    const guardado = await request('/panel/contenido', { method: 'PUT', body: JSON.stringify(datos) });
    contenidoCache = guardado;
    return getContenido();
  }

  // --------------------------------------------------
  // API PÚBLICA
  // --------------------------------------------------

  global.MegatlonDB = {

    list,
    get,
    create,
    update,
    remove,

    login,
    me,
    logout,

    meta,

    // Panel → Asistencias
    panel: {
      asistencias: () => request('/panel/asistencias'),
      marcarAsistencia: (cliente_id, fecha, presente) =>
        request('/panel/asistencias/marcar', { method: 'POST', body: JSON.stringify({ cliente_id, fecha, presente }) }),
      cambiarDias: (pago_id, dias) =>
        request('/panel/asistencias/dias', { method: 'POST', body: JSON.stringify({ pago_id, dias }) })
    },

    membresiasPublicas,
    clasesPublicas,
    entrenadoresPublicos,
    instalacionesPublicas,
    testimoniosPublicos,
    qrPublico,
    cliente,

    getContenido,
    cargarContenido,
    setContenido,

    // Panel → Permisos por rol (solo admin)
    permisos: {
      obtener: () => request('/panel/permisos'),
      guardar: (permisos) => request('/panel/permisos', { method: 'PUT', body: JSON.stringify({ permisos }) })
    }

  };

})(window);