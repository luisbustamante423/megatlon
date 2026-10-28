/**
 * Definición de cada tabla del gimnasio.
 * Esto es la fuente única de verdad: las rutas CRUD genéricas (routes.js)
 * y el formulario del panel admin (js/admin.js, vía GET /api/meta)
 * se construyen a partir de esto. Para agregar un campo nuevo a una
 * tabla, se edita solo aquí.
 *
 * type: 'text' | 'textarea' | 'number' | 'email' | 'password' | 'date' |
 *       'time' | 'datetime' | 'select' | 'fk' | 'image'
 * image: campo de archivo. El navegador redimensiona la imagen y la guarda
 *        como data URL (base64) en una columna TEXT. Opcionales: maxLado (px,
 *        por defecto 800) y formato ('png' para conservar nitidez, p. ej. un QR).
 * fk:   { table, display } -> tabla referenciada y campo a mostrar en el <select>.
 *        Para clientes y entrenadores, display = 'usuario_id_label' (el nombre del usuario).
 */

const schema = {
  usuarios: {
    label: 'Usuarios',
    icon: '👤',
    fields: [
      { name: 'nombre_completo', label: 'Nombre completo', type: 'text', required: true, soloNombre: true, maxLength: 80 },
      { name: 'correo', label: 'Correo', type: 'email', required: true },
      { name: 'telefono', label: 'Teléfono', type: 'text', soloTelefono: true, maxLength: 8 },
      { name: 'carnet', label: 'Carnet de identidad (solo números)', type: 'text', soloCarnet: true, maxLength: 10 },
      { name: 'contraseña', label: 'Contraseña', type: 'password', required: true, createOnly: true },
      { name: 'rol', label: 'Rol', type: 'select', options: ['admin', 'entrenador', 'cajero', 'cliente'], required: true },
      { name: 'estado', label: 'Estado', type: 'select', options: ['activo', 'inactivo'], default: 'activo' },
      { name: 'fecha_registro', label: 'Fecha registro', type: 'datetime', readonly: true }
    ],
    listColumns: ['id', 'nombre_completo', 'carnet', 'correo', 'rol', 'estado'],
    hideFromList: ['contraseña']
  },

  entrenadores: {
    label: 'Entrenadores',
    icon: '🏋️',
    fields: [
      { name: 'usuario_id', label: 'Usuario', type: 'fk', fk: { table: 'usuarios', display: 'nombre_completo' }, required: true },
      { name: 'especialidad', label: 'Especialidad', type: 'text' },
      { name: 'experiencia', label: 'Experiencia', type: 'text' },
      { name: 'foto', label: 'Foto', type: 'image' }
    ],
    listColumns: ['id', 'foto', 'usuario_id', 'especialidad', 'experiencia']
  },

  clientes: {
    label: 'Clientes',
    icon: '🧍',
    fields: [
      { name: 'usuario_id', label: 'Usuario', type: 'fk', fk: { table: 'usuarios', display: 'nombre_completo' }, required: true },
      { name: 'peso', label: 'Peso (kg) — antes', type: 'number', step: '0.1', min: 0 },
      { name: 'altura', label: 'Altura (m) — antes', type: 'number', step: '0.01', min: 0 },
      { name: 'peso_despues', label: 'Peso (kg) — después', type: 'number', step: '0.1', min: 0 },
      { name: 'altura_despues', label: 'Altura (m) — después', type: 'number', step: '0.01', min: 0 },
      { name: 'fecha_inscripcion', label: 'Fecha inscripción', type: 'datetime', readonly: true }
    ],
    listColumns: ['id', 'usuario_id', 'peso', 'altura', 'peso_despues', 'altura_despues', 'fecha_inscripcion']
  },

  membresias: {
    label: 'Membresías',
    icon: '💳',
    fields: [
      { name: 'nombre', label: 'Nombre', type: 'text', required: true },
      { name: 'precio', label: 'Precio (Bs)', type: 'number', step: '0.01', required: true },
      { name: 'duracion_dias', label: 'Duración (días)', type: 'number', required: true },
      { name: 'beneficios', label: 'Beneficios', type: 'textarea' },
      { name: 'estado', label: 'Estado', type: 'select', options: ['activa', 'inactiva'], default: 'activa' },
      { name: 'imagen', label: 'Imagen de fondo', type: 'image' }
    ],
    listColumns: ['id', 'imagen', 'nombre', 'precio', 'duracion_dias', 'estado']
  },

  pagos: {
    label: 'Pagos',
    icon: '💵',
    fields: [
      { name: 'cliente_id', label: 'Cliente', type: 'fk', fk: { table: 'clientes', display: 'usuario_id_label' }, required: true },
      { name: 'membresia_id', label: 'Membresía', type: 'fk', fk: { table: 'membresias', display: 'nombre' }, required: true },
      { name: 'monto', label: 'Monto (Bs)', type: 'number', step: '0.01', required: true },
      { name: 'metodo_pago', label: 'Método de pago', type: 'select', options: ['efectivo', 'qr'] },
      { name: 'fecha_vencimiento', label: 'Fecha vencimiento', type: 'date' },
      { name: 'estado', label: 'Estado', type: 'select', options: ['pagado', 'pendiente', 'vencido'], default: 'pagado' },
      { name: 'comprobante', label: 'Comprobante de pago (imagen)', type: 'image', maxLado: 1400 },
      { name: 'fecha_pago', label: 'Fecha de pago', type: 'datetime', readonly: true }
    ],
    // En la tabla, bajo la membresía aparece "Ver recibo" (lo dibuja js/admin.js).
    listColumns: ['id', 'cliente_id', 'membresia_id', 'monto', 'estado', 'fecha_vencimiento']
  },

  clases: {
    label: 'Clases',
    icon: '🧘',
    fields: [
      { name: 'nombre', label: 'Nombre', type: 'text', required: true },
      { name: 'entrenador_id', label: 'Entrenador', type: 'fk', fk: { table: 'entrenadores', display: 'usuario_id_label' } },
      { name: 'horario', label: 'Horario', type: 'text' },
      { name: 'cupos', label: 'Cupos', type: 'number' },
      { name: 'imagen', label: 'Imagen de fondo', type: 'image' }
    ],
    listColumns: ['id', 'imagen', 'nombre', 'entrenador_id', 'horario', 'cupos']
  },

  instalaciones: {
    label: 'Instalaciones',
    icon: '🏋️',
    fields: [
      { name: 'nombre', label: 'Nombre', type: 'text', required: true, maxLength: 60 },
      { name: 'descripcion', label: 'Descripción', type: 'textarea', maxLength: 200 },
      { name: 'imagen', label: 'Imagen', type: 'image' },
      { name: 'orden', label: 'Orden', type: 'number', min: 0, default: 0 }
    ],
    listColumns: ['id', 'imagen', 'nombre', 'descripcion', 'orden']
  },

  mensajes_contacto: {
    label: 'Mensajes de contacto',
    icon: '📩',
    fields: [
      { name: 'nombre', label: 'Nombre', type: 'text', required: true, maxLength: 80, soloNombre: true },
      { name: 'correo', label: 'Correo', type: 'email' },
      { name: 'carnet', label: 'Carnet de identidad (solo números, para crear el usuario)', type: 'text', soloCarnet: true, maxLength: 10, virtual: true },
      { name: 'contraseña', label: 'Contraseña (crea el usuario)', type: 'password', createOnly: true },
      { name: 'mensaje', label: 'Mensaje', type: 'textarea', maxLength: 600 },
      { name: 'calificacion', label: 'Calificación (estrellas)', type: 'select', options: ['', '1', '2', '3', '4', '5'] },
      { name: 'destacado', label: 'Mostrar en la página (Historias reales): 1 = sí, 0 = no', type: 'select', options: ['0', '1'], default: '0' },
      { name: 'leido', label: 'Leído', type: 'select', options: ['0', '1'], default: '0' },
      { name: 'usuario_id', label: 'Usuario', type: 'fk', fk: { table: 'usuarios', display: 'nombre_completo' }, readonly: true },
      { name: 'fecha', label: 'Fecha', type: 'datetime', readonly: true }
    ],
    listColumns: ['id', 'nombre', 'correo', 'mensaje', 'calificacion', 'destacado', 'fecha']
  },

  musica: {
    label: 'Música (playlists)',
    icon: '🎵',
    fields: [
      { name: 'usuario_id', label: 'Usuario', type: 'fk', fk: { table: 'usuarios', display: 'nombre_completo' }, required: true },
      { name: 'titulo', label: 'Título', type: 'text', required: true, maxLength: 200 },
      { name: 'canal', label: 'Canal / artista', type: 'text', maxLength: 120 },
      { name: 'video_id', label: 'ID del video de YouTube', type: 'text', required: true, maxLength: 11 },
      { name: 'consulta', label: 'Búsqueda original', type: 'text', maxLength: 100 },
      { name: 'fecha', label: 'Fecha', type: 'datetime', readonly: true }
    ],
    listColumns: ['id', 'usuario_id', 'titulo', 'canal', 'fecha']
  },

  reservas: {
    label: 'Reservas',
    icon: '📅',
    fields: [
      { name: 'cliente_id', label: 'Cliente', type: 'fk', fk: { table: 'clientes', display: 'usuario_id_label' }, required: true },
      { name: 'clase_id', label: 'Clase', type: 'fk', fk: { table: 'clases', display: 'nombre' }, required: true },
      { name: 'fecha', label: 'Fecha', type: 'datetime', readonly: true }
    ],
    listColumns: ['id', 'cliente_id', 'clase_id', 'fecha']
  },

  asistencias: {
    label: 'Asistencias',
    icon: '✅',
    fields: [
      { name: 'cliente_id', label: 'Cliente', type: 'fk', fk: { table: 'clientes', display: 'usuario_id_label' }, required: true },
      { name: 'nombre', label: 'Nombre', type: 'text', readonly: true },
      { name: 'dias_presentes', label: 'Días presentes (AAAA-MM-DD separados por coma)', type: 'textarea', soloFechas: true },
      { name: 'fecha', label: 'Última asistencia', type: 'date', readonly: true },
      { name: 'metodo', label: 'Método', type: 'select', options: ['manual', 'qr'] }
    ],
    listColumns: ['id', 'cliente_id', 'nombre', 'dias_presentes']
  },

  notificaciones: {
    label: 'Notificaciones',
    icon: '🔔',
    // El panel las separa por "tipo" (pestañas: Pagos, Solicitudes, Inicios de sesión…).
    tipos: [
      { valor: 'pago', label: 'Pagos' },
      { valor: 'solicitud', label: 'Solicitudes' },
      { valor: 'inicio_sesion', label: 'Inicios de sesión' },
      { valor: 'reserva', label: 'Reservas' },
      { valor: 'mensaje', label: 'Mensajes' },
      { valor: 'otro', label: 'Otras' }
    ],
    fields: [
      { name: 'usuario_id', label: 'Usuario', type: 'fk', fk: { table: 'usuarios', display: 'nombre_completo' }, required: true },
      { name: 'tipo', label: 'Tipo', type: 'select', options: ['pago', 'solicitud', 'inicio_sesion', 'reserva', 'mensaje', 'otro'], default: 'otro' },
      { name: 'mensaje', label: 'Mensaje', type: 'textarea', required: true },
      { name: 'leido', label: 'Leído', type: 'select', options: ['0', '1'], default: '0' },
      { name: 'fecha', label: 'Fecha', type: 'datetime', readonly: true }
    ],
    listColumns: ['id', 'tipo', 'usuario_id', 'mensaje', 'leido', 'fecha']
  },

  imagen_qr: {
    label: 'QR',
    icon: '🔳',
    // El QR de pago que ve el cliente en la página. Se usa el más reciente:
    // para cambiarlo, agrega uno nuevo (con "+ Nuevo" → adjuntar archivo).
    fields: [
      { name: 'imagen', label: 'Imagen del QR (adjuntar archivo)', type: 'image', required: true, maxLado: 1400, formato: 'png' },
      { name: 'fecha', label: 'Fecha', type: 'datetime', readonly: true }
    ],
    listColumns: ['id', 'imagen', 'fecha']
  }
};

module.exports = schema;
