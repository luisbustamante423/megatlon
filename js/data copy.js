// ============ Capa de datos — Megatlón ============
// El panel funciona 100% en el navegador (sin necesitar levantar el
// servidor Node): todo se guarda en localStorage, en la misma
// estructura de 14 tablas que server/schema.js.
//
// Cuando quieras conectar tu base de datos real, tienes el backend
// completo en /server (Node + Express + SQLite) listo para usar: solo
// hay que apuntar este archivo a esa API en vez de localStorage.
// (ver README.md, sección "Conectar tu base de datos real").

(function (global) {
  const SCHEMA = {
    usuarios: {
      label: 'Usuarios', icon: '👤',
      fields: [
        { name: 'nombre_completo', label: 'Nombre completo', type: 'text', required: true },
        { name: 'correo', label: 'Correo', type: 'email', required: true },
        { name: 'telefono', label: 'Teléfono', type: 'text' },
        { name: 'contraseña', label: 'Contraseña', type: 'password', required: true, createOnly: true },
        { name: 'rol', label: 'Rol', type: 'select', options: ['admin', 'entrenador', 'cliente'], required: true },
        { name: 'estado', label: 'Estado', type: 'select', options: ['activo', 'inactivo'], default: 'activo' },
        { name: 'fecha_registro', label: 'Fecha registro', type: 'datetime', readonly: true }
      ],
      listColumns: ['id', 'nombre_completo', 'correo', 'rol', 'estado'],
      hideFromList: ['contraseña']
    },
    entrenadores: {
      label: 'Entrenadores', icon: '🏋️',
      fields: [
        { name: 'usuario_id', label: 'Usuario', type: 'fk', fk: { table: 'usuarios', display: 'nombre_completo' }, required: true },
        { name: 'especialidad', label: 'Especialidad', type: 'text' },
        { name: 'experiencia', label: 'Experiencia', type: 'text' }
      ],
      listColumns: ['id', 'usuario_id', 'especialidad', 'experiencia']
    },
    clientes: {
      label: 'Clientes', icon: '🧍',
      fields: [
        { name: 'usuario_id', label: 'Usuario', type: 'fk', fk: { table: 'usuarios', display: 'nombre_completo' }, required: true },
        { name: 'peso', label: 'Peso (kg)', type: 'number', step: '0.1' },
        { name: 'altura', label: 'Altura (m)', type: 'number', step: '0.01' },
        { name: 'objetivo', label: 'Objetivo', type: 'text' },
        { name: 'nivel', label: 'Nivel', type: 'select', options: ['principiante', 'intermedio', 'avanzado'] },
        { name: 'entrenador_id', label: 'Entrenador', type: 'fk', fk: { table: 'entrenadores', display: 'especialidad' } },
        { name: 'fecha_inscripcion', label: 'Fecha inscripción', type: 'datetime', readonly: true }
      ],
      listColumns: ['id', 'usuario_id', 'nivel', 'objetivo', 'entrenador_id']
    },
    membresias: {
      label: 'Membresías', icon: '💳',
      fields: [
        { name: 'nombre', label: 'Nombre', type: 'text', required: true },
        { name: 'precio', label: 'Precio (Bs)', type: 'number', step: '0.01', required: true },
        { name: 'duracion_dias', label: 'Duración (días)', type: 'number', required: true },
        { name: 'beneficios', label: 'Beneficios', type: 'textarea' },
        { name: 'estado', label: 'Estado', type: 'select', options: ['activa', 'inactiva'], default: 'activa' }
      ],
      listColumns: ['id', 'nombre', 'precio', 'duracion_dias', 'estado']
    },
    pagos: {
      label: 'Pagos', icon: '💵',
      fields: [
        { name: 'cliente_id', label: 'Cliente', type: 'fk', fk: { table: 'clientes', display: 'objetivo' }, required: true },
        { name: 'membresia_id', label: 'Membresía', type: 'fk', fk: { table: 'membresias', display: 'nombre' }, required: true },
        { name: 'monto', label: 'Monto (Bs)', type: 'number', step: '0.01', required: true },
        { name: 'metodo_pago', label: 'Método de pago', type: 'select', options: ['efectivo', 'qr'] },
        { name: 'fecha_vencimiento', label: 'Fecha vencimiento', type: 'date' },
        { name: 'estado', label: 'Estado', type: 'select', options: ['pagado', 'pendiente', 'vencido'], default: 'pagado' },
        { name: 'fecha_pago', label: 'Fecha de pago', type: 'datetime', readonly: true }
      ],
      listColumns: ['id', 'cliente_id', 'membresia_id', 'monto', 'estado', 'fecha_vencimiento']
    },
    clases: {
      label: 'Clases', icon: '🧘',
      fields: [
        { name: 'nombre', label: 'Nombre', type: 'text', required: true },
        { name: 'entrenador_id', label: 'Entrenador', type: 'fk', fk: { table: 'entrenadores', display: 'especialidad' } },
        { name: 'horario', label: 'Horario', type: 'text' },
        { name: 'cupos', label: 'Cupos', type: 'number' }
      ],
      listColumns: ['id', 'nombre', 'entrenador_id', 'horario', 'cupos']
    },
    reservas: {
      label: 'Reservas', icon: '📅',
      fields: [
        { name: 'cliente_id', label: 'Cliente', type: 'fk', fk: { table: 'clientes', display: 'objetivo' }, required: true },
        { name: 'clase_id', label: 'Clase', type: 'fk', fk: { table: 'clases', display: 'nombre' }, required: true },
        { name: 'fecha', label: 'Fecha', type: 'datetime', readonly: true }
      ],
      listColumns: ['id', 'cliente_id', 'clase_id', 'fecha']
    },
    asistencias: {
      label: 'Asistencias', icon: '✅',
      fields: [
        { name: 'cliente_id', label: 'Cliente', type: 'fk', fk: { table: 'clientes', display: 'objetivo' }, required: true },
        { name: 'fecha', label: 'Fecha', type: 'date', required: true },
        { name: 'hora_entrada', label: 'Hora entrada', type: 'time' },
        { name: 'hora_salida', label: 'Hora salida', type: 'time' },
        { name: 'metodo', label: 'Método', type: 'select', options: ['manual', 'qr'] }
      ],
      listColumns: ['id', 'cliente_id', 'fecha', 'hora_entrada', 'hora_salida']
    },
    rutinas: {
      label: 'Rutinas', icon: '📋',
      fields: [
        { name: 'nombre', label: 'Nombre', type: 'text', required: true },
        { name: 'objetivo', label: 'Objetivo', type: 'text' },
        { name: 'nivel', label: 'Nivel', type: 'select', options: ['principiante', 'intermedio', 'avanzado'] },
        { name: 'entrenador_id', label: 'Entrenador', type: 'fk', fk: { table: 'entrenadores', display: 'especialidad' } },
        { name: 'fecha_creacion', label: 'Fecha creación', type: 'datetime', readonly: true }
      ],
      listColumns: ['id', 'nombre', 'nivel', 'entrenador_id']
    },
    ejercicios: {
      label: 'Ejercicios', icon: '💪',
      fields: [
        { name: 'nombre', label: 'Nombre', type: 'text', required: true },
        { name: 'grupo_muscular', label: 'Grupo muscular', type: 'text' },
        { name: 'descripcion', label: 'Descripción', type: 'textarea' },
        { name: 'dificultad', label: 'Dificultad', type: 'select', options: ['baja', 'media', 'alta'] }
      ],
      listColumns: ['id', 'nombre', 'grupo_muscular', 'dificultad']
    },
    rutina_ejercicios: {
      label: 'Rutina - Ejercicios', icon: '🔗',
      fields: [
        { name: 'rutina_id', label: 'Rutina', type: 'fk', fk: { table: 'rutinas', display: 'nombre' }, required: true },
        { name: 'ejercicio_id', label: 'Ejercicio', type: 'fk', fk: { table: 'ejercicios', display: 'nombre' }, required: true },
        { name: 'series', label: 'Series', type: 'number' },
        { name: 'repeticiones', label: 'Repeticiones', type: 'number' },
        { name: 'descanso_segundos', label: 'Descanso (seg)', type: 'number' }
      ],
      listColumns: ['id', 'rutina_id', 'ejercicio_id', 'series', 'repeticiones']
    },
    progreso: {
      label: 'Progreso', icon: '📈',
      fields: [
        { name: 'cliente_id', label: 'Cliente', type: 'fk', fk: { table: 'clientes', display: 'objetivo' }, required: true },
        { name: 'peso', label: 'Peso (kg)', type: 'number', step: '0.1' },
        { name: 'imc', label: 'IMC', type: 'number', step: '0.01' },
        { name: 'medidas', label: 'Medidas', type: 'textarea' },
        { name: 'fecha', label: 'Fecha', type: 'datetime', readonly: true }
      ],
      listColumns: ['id', 'cliente_id', 'peso', 'imc', 'fecha']
    },
    inventario: {
      label: 'Inventario', icon: '📦',
      fields: [
        { name: 'nombre_producto', label: 'Producto', type: 'text', required: true },
        { name: 'categoria', label: 'Categoría', type: 'text' },
        { name: 'stock', label: 'Stock', type: 'number' },
        { name: 'precio', label: 'Precio (Bs)', type: 'number', step: '0.01' }
      ],
      listColumns: ['id', 'nombre_producto', 'categoria', 'stock', 'precio']
    },
    notificaciones: {
      label: 'Notificaciones', icon: '🔔',
      fields: [
        { name: 'usuario_id', label: 'Usuario', type: 'fk', fk: { table: 'usuarios', display: 'nombre_completo' }, required: true },
        { name: 'mensaje', label: 'Mensaje', type: 'textarea', required: true },
        { name: 'leido', label: 'Leído', type: 'select', options: ['0', '1'], default: '0' },
        { name: 'fecha', label: 'Fecha', type: 'datetime', readonly: true }
      ],
      listColumns: ['id', 'usuario_id', 'mensaje', 'leido', 'fecha']
    }
  };

  const DB_KEY = 'megatlon_db_v1';
  const SESSION_KEY = 'megatlon_session_v1';
  const SALT = 'megatlon_v1_salt';

  function ahoraSql() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  async function sha256(texto) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  async function hashPassword(plano) {
    return sha256(SALT + ':' + plano);
  }

  function tablasVacias() {
    const out = {};
    for (const t of Object.keys(SCHEMA)) out[t] = [];
    return out;
  }

  function leerDB() {
    try {
      const raw = localStorage.getItem(DB_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
  function escribirDB(data) {
    localStorage.setItem(DB_KEY, JSON.stringify(data));
  }

  let DB_LISTA = null; // promesa de inicialización, para no sembrar dos veces en paralelo
  async function obtenerDB() {
    if (DB_LISTA) return DB_LISTA;
    DB_LISTA = (async () => {
      let data = leerDB();
      if (!data) {
        data = tablasVacias();
        data.usuarios.push({
          id: 1,
          nombre_completo: 'Administrador',
          correo: 'lb8879195@gmail.com',
          telefono: '',
          contraseña: await hashPassword('Luis12345@'),
          rol: 'admin',
          fecha_registro: ahoraSql(),
          estado: 'activo'
        });
        data.membresias.push(
          { id: 1, nombre: 'Pase Diario', precio: 25, duracion_dias: 1, beneficios: 'Acceso a todas las zonas. Sin permanencia ni contrato. Vestidores y casilleros. Ideal para probar el gimnasio.', estado: 'activa' },
          { id: 2, nombre: 'Básico', precio: 130, duracion_dias: 30, beneficios: 'Acceso total en horario regular. Evaluación inicial gratuita. Rutina de fuerza y cardio. Comunidad Megatlón.', estado: 'activa' },
          { id: 3, nombre: 'Plus', precio: 180, duracion_dias: 30, beneficios: 'Acceso 24/7. 3 clases grupales por semana. Evaluación y rutina personalizada. 1 asesoría nutricional al mes.', estado: 'activa' },
          { id: 4, nombre: 'Premium', precio: 250, duracion_dias: 30, beneficios: 'Acceso 24/7 con 1 invitado al mes. Clases grupales ilimitadas. Plan 1:1 mensual con tu coach. Sauna y zona de recuperación.', estado: 'activa' }
        );
        escribirDB(data);
      } else {
        // completar tablas que falten si el schema creció desde el último guardado
        let cambio = false;
        for (const t of Object.keys(SCHEMA)) {
          if (!Array.isArray(data[t])) { data[t] = []; cambio = true; }
        }
        // migración: si venías de una versión anterior sin membresías cargadas,
        // sembrar las 4 reales de la landing (solo si la tabla está vacía, para
        // no pisar membresías que ya hayas creado tú mismo).
        if (data.membresias.length === 0) {
          data.membresias.push(
            { id: 1, nombre: 'Pase Diario', precio: 25, duracion_dias: 1, beneficios: 'Acceso a todas las zonas. Sin permanencia ni contrato. Vestidores y casilleros. Ideal para probar el gimnasio.', estado: 'activa' },
            { id: 2, nombre: 'Básico', precio: 130, duracion_dias: 30, beneficios: 'Acceso total en horario regular. Evaluación inicial gratuita. Rutina de fuerza y cardio. Comunidad Megatlón.', estado: 'activa' },
            { id: 3, nombre: 'Plus', precio: 180, duracion_dias: 30, beneficios: 'Acceso 24/7. 3 clases grupales por semana. Evaluación y rutina personalizada. 1 asesoría nutricional al mes.', estado: 'activa' },
            { id: 4, nombre: 'Premium', precio: 250, duracion_dias: 30, beneficios: 'Acceso 24/7 con 1 invitado al mes. Clases grupales ilimitadas. Plan 1:1 mensual con tu coach. Sauna y zona de recuperación.', estado: 'activa' }
          );
          cambio = true;
        }
        if (cambio) escribirDB(data);
      }
      return data;
    })();
    return DB_LISTA;
  }

  function siguienteId(filas) {
    return filas.reduce((max, f) => Math.max(max, f.id || 0), 0) + 1;
  }

  async function list(tabla) {
    const data = await obtenerDB();
    const config = SCHEMA[tabla];
    const filas = (data[tabla] || []).slice().sort((a, b) => b.id - a.id);
    return filas.map((fila) => {
      const out = { ...fila };
      config.fields.forEach((f) => {
        if (f.type === 'fk') {
          const ref = (data[f.fk.table] || []).find((r) => r.id === fila[f.name]);
          out[`${f.name}_label`] = ref ? ref[f.fk.display] : null;
        }
      });
      return out;
    });
  }

  async function get(tabla, id) {
    const data = await obtenerDB();
    const fila = (data[tabla] || []).find((r) => r.id === Number(id));
    if (!fila) throw new Error('No encontrado');
    return { ...fila };
  }

  async function create(tabla, payload) {
    const data = await obtenerDB();
    const config = SCHEMA[tabla];
    const fila = { id: siguienteId(data[tabla] || []) };
    for (const f of config.fields) {
      let val = payload[f.name];
      if (val === undefined) val = f.default !== undefined ? f.default : null;
      if (f.type === 'password' && val) val = await hashPassword(val);
      if (f.readonly && f.type === 'datetime') val = ahoraSql();
      fila[f.name] = val;
    }
    data[tabla].push(fila);
    escribirDB(data);
    return { ...fila };
  }

  async function update(tabla, id, payload) {
    const data = await obtenerDB();
    const config = SCHEMA[tabla];
    const filas = data[tabla] || [];
    const idx = filas.findIndex((r) => r.id === Number(id));
    if (idx === -1) throw new Error('No encontrado');
    const actual = { ...filas[idx] };
    for (const [k, v] of Object.entries(payload)) {
      const f = config.fields.find((fl) => fl.name === k);
      if (!f || f.readonly) continue;
      if (f.type === 'password') {
        if (v) actual[k] = await hashPassword(v);
        continue;
      }
      actual[k] = v;
    }
    filas[idx] = actual;
    escribirDB(data);
    return { ...actual };
  }

  async function remove(tabla, id) {
    const data = await obtenerDB();
    // protección simple de integridad referencial, como hacía el backend
    for (const [t, cfg] of Object.entries(SCHEMA)) {
      for (const f of cfg.fields) {
        if (f.type === 'fk' && f.fk.table === tabla) {
          const usado = (data[t] || []).some((r) => r[f.name] === Number(id));
          if (usado) throw new Error(`No se puede eliminar: hay registros relacionados en "${cfg.label}"`);
        }
      }
    }
    const filas = data[tabla] || [];
    const idx = filas.findIndex((r) => r.id === Number(id));
    if (idx === -1) throw new Error('No encontrado');
    filas.splice(idx, 1);
    escribirDB(data);
    return true;
  }

  // ---------- sesión / login ----------
  function codificar(obj) {
    return btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
  }
  function decodificar(str) {
    return JSON.parse(decodeURIComponent(escape(atob(str))));
  }

  async function login(correo, contraseña) {
    const data = await obtenerDB();
    const user = (data.usuarios || []).find((u) => u.correo === correo);
    if (!user) throw new Error('Credenciales inválidas');
    const hash = await hashPassword(contraseña);
    if (hash !== user.contraseña) throw new Error('Credenciales inválidas');
    if (user.estado !== 'activo') throw new Error('Usuario inactivo');
    const sesion = {
      id: user.id, correo: user.correo, rol: user.rol,
      nombre_completo: user.nombre_completo, exp: Date.now() + 8 * 60 * 60 * 1000
    };
    const token = codificar(sesion);
    localStorage.setItem(SESSION_KEY, token);
    return { token, user: { id: user.id, nombre_completo: user.nombre_completo, correo: user.correo, rol: user.rol } };
  }

  function me() {
    const token = localStorage.getItem(SESSION_KEY);
    if (!token) throw new Error('No autenticado');
    let sesion;
    try { sesion = decodificar(token); } catch { throw new Error('Sesión inválida'); }
    if (!sesion.exp || sesion.exp < Date.now()) {
      localStorage.removeItem(SESSION_KEY);
      throw new Error('Sesión expirada');
    }
    return sesion;
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
  }

  function meta() {
    return SCHEMA;
  }

  // ---------- Contenido del sitio (lo que se ve en el inicio) ----------
  // Guardado aparte de las 14 tablas, en su propia llave de localStorage.
  // Esto es lo que llena el hero, contacto y redes sociales de la landing
  // (html/index.html) y se edita desde la sección "Contenido del sitio"
  // del panel (js/admin.js).
  const CONTENIDO_KEY = 'megatlon_contenido_v1';

  function contenidoPorDefecto() {
    return {
      hero_ubicacion: 'Cochabamba · Bolivia',
      hero_titulo: 'Entrena más fuerte. Vive mejor.',
      hero_subtitulo: 'El gimnasio más moderno de Cochabamba.',
      hero_stat1_numero: '+2.500',
      hero_stat1_etiqueta: 'Socios activos',
      hero_stat2_numero: '24/7',
      hero_stat2_etiqueta: 'Acceso Élite',
      hero_stat3_numero: '+30',
      hero_stat3_etiqueta: 'Clases semanales',
      contacto_direccion: 'Av. Ballivián, Cochabamba, Bolivia',
      contacto_telefono: '+591 700 00000',
      contacto_horarios: 'Lun a Dom · 06:00 - 22:00',
      footer_mensaje: 'Megatlón Cochabamba. Fuerza, disciplina y alto rendimiento.',
      red_instagram: '',
      red_facebook: '',
      red_tiktok: '',
      red_whatsapp: ''
    };
  }

  function getContenido() {
    try {
      const raw = localStorage.getItem(CONTENIDO_KEY);
      if (!raw) return contenidoPorDefecto();
      return { ...contenidoPorDefecto(), ...JSON.parse(raw) };
    } catch {
      return contenidoPorDefecto();
    }
  }

  function setContenido(datos) {
    const actual = getContenido();
    const nuevo = { ...actual, ...datos };
    localStorage.setItem(CONTENIDO_KEY, JSON.stringify(nuevo));
    return nuevo;
  }

  global.MegatlonDB = {
    list, get, create, update, remove, login, me, logout, meta,
    getContenido, setContenido
  };
})(window);
