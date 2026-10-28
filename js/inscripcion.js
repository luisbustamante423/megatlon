// ============ Ventana de inscripción (después de "Inscribirme") ============
// Se abre cuando un cliente con sesión iniciada pulsa "Inscribirme".
//
//   1. Opciones ........ "Preguntar e inscribirme por WhatsApp"  → igual que siempre (abre WhatsApp)
//                        "Inscribirme desde la aplicación web"   → sigue abajo
//   2. Pago ............ "Pagar por QR"
//   3. QR .............. muestra el QR que el admin subió en el panel (tabla QR);
//                        debajo: "Paga y pulsa Continuar" + aviso de guardar el comprobante
//   4. Comprobante ..... pide adjuntar la imagen; al adjuntarla aparece "Continuar"
//   5. Recibo .......... membresía, monto y comprobante; "Descargar" o "Ignorar".
//                        El recibo queda guardado: el admin lo ve en Pagos → "Ver recibo".
//
// Usa funciones y constantes de js/landing.js (se carga antes): $id, CL, toast,
// escaparHtml, nombreSesion, cargarPerfil, manejarErrorSesion, abrirVentanaWhatsapp,
// inscribirPorWhatsapp. Los estilos están en css/inscripcion.css.

const Inscripcion = (function () {
  let overlay = null;
  let cuerpo = null;
  let S = null;          // estado: { plan, paso, qr, comprobante, recibo, ocupado }
  let botonOrigen = null;

  const COMPROBANTE_TIPOS = ['image/jpeg', 'image/png', 'image/webp'];
  const COMPROBANTE_MAX_ORIGINAL = 10 * 1024 * 1024; // antes de comprimir
  const COMPROBANTE_MAX_LADO = 1200;

  const ICONO_WHATSAPP = '<svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true"><path d="M12.04 2a9.9 9.9 0 0 0-8.5 14.96L2 22l5.2-1.5A9.9 9.9 0 1 0 12.04 2zm0 1.8a8.1 8.1 0 1 1-4.2 15.03l-.3-.18-3.08.88.9-3-.2-.31A8.1 8.1 0 0 1 12.04 3.8zm-3 3.9c-.2 0-.5.07-.77.37-.26.3-1 1-1 2.4s1.03 2.8 1.17 3c.15.2 2 3.2 4.95 4.4 2.45.97 2.95.78 3.48.73.53-.05 1.7-.7 1.94-1.37.24-.67.24-1.25.17-1.37-.07-.12-.27-.2-.57-.35-.3-.15-1.7-.84-1.97-.94-.27-.1-.47-.15-.67.15-.2.3-.77.94-.94 1.13-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.8-1.5-1.77-1.67-2.07-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.66-1.6-.9-2.2-.24-.57-.5-.5-.67-.5h-.57z"/></svg>';
  const ICONO_WEB = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 21h8M12 18v3"/></svg>';
  const ICONO_QR = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h3M20 17v4"/></svg>';

  const esc = (t) => escaparHtml(t);

  // ---------- armado de la ventana ----------
  function crear() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.id = 'modal-inscripcion';
    overlay.className = 'insc-overlay';
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="insc-caja" role="dialog" aria-modal="true" aria-labelledby="insc-titulo">
        <button type="button" class="insc-cerrar" aria-label="Cerrar">&times;</button>
        <div class="insc-cuerpo" tabindex="-1"></div>
      </div>`;
    document.body.appendChild(overlay);
    cuerpo = overlay.querySelector('.insc-cuerpo');

    // "Volver" (un solo oyente: sirve aunque la pantalla se redibuje, como la del QR).
    cuerpo.addEventListener('click', (e) => {
      const b = e.target.closest('[data-volver]');
      if (b && S && !S.ocupado) ir(b.dataset.volver);
    });
    overlay.querySelector('.insc-cerrar').addEventListener('click', cerrar);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) cerrar(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && overlay && !overlay.hidden) cerrar(); });
  }

  function abrir(plan, boton) {
    crear();
    botonOrigen = boton || null;
    S = { plan, paso: 'opciones', qr: undefined, comprobante: '', recibo: null, ocupado: false };
    overlay.hidden = false;
    document.documentElement.classList.add('insc-abierto');
    pintar();
  }

  function cerrar() {
    if (!overlay || overlay.hidden || (S && S.ocupado)) return;
    overlay.hidden = true;
    document.documentElement.classList.remove('insc-abierto');
    const huboRecibo = S && S.paso === 'recibo';
    S = null;
    cuerpo.innerHTML = '';
    if (huboRecibo) cargarPerfil();
    if (botonOrigen && botonOrigen.focus) { try { botonOrigen.focus({ preventScroll: true }); } catch (e) { /* nada */ } }
  }

  function ir(paso) {
    S.paso = paso;
    pintar();
  }

  const resumenPlan = () => {
    const p = S.plan;
    const detalle = [p.precio ? `Bs ${esc(p.precio)}` : '', p.dias ? `${esc(p.dias)} días` : ''].filter(Boolean).join(' · ');
    return `<div class="insc-plan"><span class="insc-plan-etiqueta">Plan</span><strong>${esc(p.nombre)}</strong>${detalle ? `<span>${detalle}</span>` : ''}</div>`;
  };

  const volver = (destino) => `<button type="button" class="insc-btn insc-btn--suave" data-volver="${destino}">Volver</button>`;

  // ---------- pantallas ----------
  function pintar() {
    const paso = S.paso;
    if (paso === 'opciones') pasoOpciones();
    else if (paso === 'pago') pasoPago();
    else if (paso === 'qr') pasoQr();
    else if (paso === 'comprobante') pasoComprobante();
    else if (paso === 'recibo') pasoRecibo();
    // Lleva el foco a la ventana para que Esc / Tab funcionen desde ahí.
    try { cuerpo.focus({ preventScroll: true }); } catch (e) { /* nada */ }
    overlay.querySelector('.insc-caja').scrollTop = 0;
  }

  // 1) Opciones
  function pasoOpciones() {
    cuerpo.innerHTML = `
      <h3 id="insc-titulo" class="insc-titulo">¿Cómo quieres inscribirte?</h3>
      ${resumenPlan()}
      <div class="insc-opciones">
        <button type="button" class="insc-opcion" data-ir="whatsapp">
          <span class="insc-opcion-icono">${ICONO_WHATSAPP}</span>
          <span class="insc-opcion-texto"><strong>Preguntar e inscribirme por WhatsApp</strong><small>Te atendemos por chat y confirmamos tu pago.</small></span>
        </button>
        <button type="button" class="insc-opcion" data-ir="web">
          <span class="insc-opcion-icono">${ICONO_WEB}</span>
          <span class="insc-opcion-texto"><strong>Inscribirme desde la aplicación web</strong><small>Paga aquí mismo y envía tu comprobante.</small></span>
        </button>
      </div>`;

    cuerpo.querySelector('[data-ir="whatsapp"]').addEventListener('click', async () => {
      if (S.ocupado) return;
      // La ventana de WhatsApp se abre ya, dentro del clic, para que el navegador no la bloquee.
      const ventana = abrirVentanaWhatsapp();
      S.ocupado = true;
      const ok = await inscribirPorWhatsapp(S.plan, ventana, botonOrigen);
      if (S) S.ocupado = false;
      if (ok) cerrar();
    });
    cuerpo.querySelector('[data-ir="web"]').addEventListener('click', () => ir('pago'));
  }

  // 2) Cómo pagar
  function pasoPago() {
    cuerpo.innerHTML = `
      <h3 id="insc-titulo" class="insc-titulo">Elige cómo pagar</h3>
      ${resumenPlan()}
      <div class="insc-opciones">
        <button type="button" class="insc-opcion" data-ir="qr">
          <span class="insc-opcion-icono">${ICONO_QR}</span>
          <span class="insc-opcion-texto"><strong>Pagar por QR</strong><small>Escanea el código desde la app de tu banco.</small></span>
        </button>
      </div>
      <div class="insc-acciones">${volver('opciones')}</div>`;
    cuerpo.querySelector('[data-ir="qr"]').addEventListener('click', () => ir('qr'));
  }

  // 3) QR (la imagen la sube el admin en el panel → QR)
  async function cargarQr() {
    if (S.qr !== undefined) return;
    S.qr = null;
    try {
      const r = await MegatlonDB.qrPublico();
      S.qr = r && r.imagen ? r.imagen : '';
    } catch (e) {
      S.qr = '';
    }
  }

  async function pasoQr() {
    cuerpo.innerHTML = `
      <h3 id="insc-titulo" class="insc-titulo">Paga con QR</h3>
      ${resumenPlan()}
      <div class="insc-qr insc-qr--cargando" id="insc-qr-caja"><span>Cargando QR…</span></div>
      <div class="insc-acciones">${volver('pago')}</div>`;

    const paso = S.paso;
    await cargarQr();
    if (!S || S.paso !== paso) return; // se cerró o cambió de pantalla mientras cargaba

    const hay = Boolean(S.qr);
    cuerpo.innerHTML = `
      <h3 id="insc-titulo" class="insc-titulo">Paga con QR</h3>
      ${resumenPlan()}
      ${hay
        ? `<div class="insc-qr"><img src="${esc(S.qr)}" alt="Código QR para pagar tu membresía"/></div>
           <p class="insc-paga">Paga y pulsa <strong>Continuar</strong></p>
           <p class="insc-importante"><span aria-hidden="true">⚠️</span> <strong>Importante:</strong> guarda el comprobante de tu pago.</p>`
        : `<div class="insc-qr insc-qr--vacio"><span>El gimnasio todavía no cargó el QR de pago.<br/>Puedes inscribirte por WhatsApp.</span></div>`}
      <div class="insc-acciones">
        ${volver('pago')}
        ${hay ? '<button type="button" class="insc-btn" id="insc-continuar-qr">Continuar</button>' : '<button type="button" class="insc-btn" data-volver="opciones">Ver otras opciones</button>'}
      </div>`;
    const sig = $id('insc-continuar-qr');
    if (sig) sig.addEventListener('click', () => ir('comprobante'));
  }

  // 4) Adjuntar el comprobante
  function comprimir(archivo) {
    return new Promise((resolve, reject) => {
      const lector = new FileReader();
      lector.onerror = () => reject(new Error('No se pudo leer el archivo.'));
      lector.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('El archivo no es una imagen válida.'));
        img.onload = () => {
          const escala = Math.min(1, COMPROBANTE_MAX_LADO / Math.max(img.width, img.height));
          const lienzo = document.createElement('canvas');
          lienzo.width = Math.max(1, Math.round(img.width * escala));
          lienzo.height = Math.max(1, Math.round(img.height * escala));
          const ctx = lienzo.getContext('2d');
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, lienzo.width, lienzo.height);
          ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height);
          resolve(lienzo.toDataURL('image/jpeg', 0.85));
        };
        img.src = lector.result;
      };
      lector.readAsDataURL(archivo);
    });
  }

  function pasoComprobante() {
    cuerpo.innerHTML = `
      <h3 id="insc-titulo" class="insc-titulo">Adjunta tu comprobante</h3>
      ${resumenPlan()}
      <p class="insc-texto">Sube la captura o la foto del comprobante de tu pago por QR.</p>
      <label class="insc-archivo" id="insc-archivo">
        <input type="file" id="insc-file" accept="image/jpeg,image/png,image/webp" />
        <span class="insc-archivo-texto" id="insc-archivo-texto">Elegir imagen del comprobante</span>
      </label>
      <img class="insc-vista" id="insc-vista" alt="Vista previa del comprobante" hidden />
      <p class="insc-error" id="insc-error" role="alert" hidden></p>
      <div class="insc-acciones">
        ${volver('qr')}
        <button type="button" class="insc-btn" id="insc-continuar" hidden>Continuar</button>
      </div>`;

    const file = $id('insc-file');
    const vista = $id('insc-vista');
    const err = $id('insc-error');
    const boton = $id('insc-continuar');
    const textoArchivo = $id('insc-archivo-texto');

    const mostrarError = (msg) => { err.textContent = msg || ''; err.hidden = !msg; };
    const mostrarAdjunto = () => {
      vista.src = S.comprobante;
      vista.hidden = false;
      boton.hidden = false;         // el botón Continuar aparece cuando ya hay comprobante
      textoArchivo.textContent = 'Cambiar imagen';
    };
    if (S.comprobante) mostrarAdjunto();

    file.addEventListener('change', async () => {
      const archivo = file.files && file.files[0];
      if (!archivo) return;
      mostrarError('');
      if (!COMPROBANTE_TIPOS.includes(archivo.type)) { mostrarError('Formato no permitido. Usa una imagen JPG, PNG o WEBP.'); file.value = ''; return; }
      if (archivo.size > COMPROBANTE_MAX_ORIGINAL) { mostrarError('La imagen pesa más de 10 MB. Elige una más liviana.'); file.value = ''; return; }
      try {
        S.comprobante = await comprimir(archivo);
        mostrarAdjunto();
      } catch (e) {
        S.comprobante = '';
        vista.hidden = true;
        boton.hidden = true;
        mostrarError(e.message);
        file.value = '';
      }
    });

    boton.addEventListener('click', async () => {
      if (!S.comprobante || S.ocupado) return;
      S.ocupado = true;
      boton.disabled = true;
      const texto = boton.textContent;
      boton.textContent = 'Enviando…';
      mostrarError('');
      try {
        const r = await CL.pagarPorQr(Number(S.plan.id), S.comprobante);
        S.recibo = r.recibo;
        S.ocupado = false;
        cargarPerfil(); // la página ya muestra "Pago por QR en revisión"
        ir('recibo');
      } catch (e) {
        S.ocupado = false;
        boton.disabled = false;
        boton.textContent = texto;
        if (e && e.status === 401) { cerrar(); manejarErrorSesion(e); return; }
        mostrarError(e.message || 'No se pudo enviar el comprobante. Intenta de nuevo.');
      }
    });
  }

  // 5) Recibo
  const fechaHora = (iso) => {
    const d = new Date(iso);
    return isNaN(d) ? '—' : d.toLocaleString('es-BO', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  function pasoRecibo() {
    const r = S.recibo;
    cuerpo.innerHTML = `
      <div class="insc-recibo">
        <div class="insc-recibo-cab">
          <span class="insc-plan-etiqueta">Megatlón</span>
          <h3 id="insc-titulo" class="insc-titulo">Recibo de pago</h3>
          <small>N° ${esc(r.numero)}</small>
        </div>
        <dl class="insc-recibo-datos">
          <div><dt>Cliente</dt><dd>${esc(r.cliente)}${r.codigo ? `<br><small class="codigo-usuario">${esc(r.codigo)}</small>` : ''}</dd></div>
          <div><dt>Membresía</dt><dd>${esc(r.membresia)}</dd></div>
          <div><dt>Monto</dt><dd>Bs ${esc(r.monto)}</dd></div>
          <div><dt>Método</dt><dd>Pago por ${esc(r.metodo)}</dd></div>
          <div><dt>Fecha</dt><dd>${esc(fechaHora(r.fecha))}</dd></div>
          <div><dt>Estado</dt><dd><span class="insc-estado">En revisión</span></dd></div>
        </dl>
        <p class="insc-recibo-sub">Tu comprobante</p>
        <img class="insc-recibo-img" src="${esc(S.comprobante)}" alt="Comprobante de pago" />
        <p class="insc-nota">Guardamos tu recibo. Activamos tu membresía apenas confirmemos tu pago.</p>
      </div>
      <div class="insc-acciones">
        <button type="button" class="insc-btn insc-btn--suave" id="insc-ignorar">Ignorar</button>
        <button type="button" class="insc-btn" id="insc-descargar">Descargar</button>
      </div>`;
    $id('insc-ignorar').addEventListener('click', cerrar);
    $id('insc-descargar').addEventListener('click', descargarRecibo);
  }

  // Dibuja el recibo en una imagen PNG (con el comprobante dentro) y la descarga.
  function cargarImagen(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('No se pudo preparar la imagen.'));
      img.src = src;
    });
  }

  async function descargarRecibo() {
    const r = S.recibo;
    const boton = $id('insc-descargar');
    try {
      if (boton) boton.disabled = true;
      const foto = await cargarImagen(S.comprobante);
      const W = 900, M = 48;
      const filas = [
        ['Cliente', r.cliente],
        ['Membresía', r.membresia],
        ['Monto', `Bs ${r.monto}`],
        ['Método', `Pago por ${r.metodo}`],
        ['Fecha', fechaHora(r.fecha)],
        ['Estado', 'En revisión']
      ];
      const escala = Math.min((W - M * 2) / foto.width, 760 / foto.height, 1.6);
      const fw = Math.round(foto.width * escala), fh = Math.round(foto.height * escala);
      const altoCab = 150, altoFilas = filas.length * 46 + 24;
      const H = altoCab + altoFilas + 70 + fh + 110;

      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);

      // cabecera
      g.fillStyle = '#000'; g.fillRect(0, 0, W, altoCab);
      g.fillStyle = '#9bdb4d';
      g.font = '700 54px Anton, Impact, "Arial Narrow", sans-serif';
      g.textBaseline = 'alphabetic';
      g.fillText('MEGATLÓN', M, 78);
      g.font = '600 24px Barlow, Arial, sans-serif';
      g.fillStyle = '#ffffff';
      g.fillText(`Recibo de pago  ·  N° ${r.numero}`, M, 118);

      // datos
      let y = altoCab + 52;
      filas.forEach(([k, v]) => {
        g.fillStyle = '#6b7280'; g.font = '600 20px Barlow, Arial, sans-serif';
        g.fillText(k.toUpperCase(), M, y);
        g.fillStyle = '#111'; g.font = '700 26px Barlow, Arial, sans-serif';
        g.textAlign = 'right'; g.fillText(String(v), W - M, y); g.textAlign = 'left';
        g.strokeStyle = '#e5e7eb'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(M, y + 14); g.lineTo(W - M, y + 14); g.stroke();
        y += 46;
      });

      // comprobante
      y += 34;
      g.fillStyle = '#6b7280'; g.font = '600 20px Barlow, Arial, sans-serif';
      g.fillText('COMPROBANTE', M, y);
      y += 18;
      g.drawImage(foto, Math.round((W - fw) / 2), y, fw, fh);
      g.strokeStyle = '#d1d5db'; g.strokeRect(Math.round((W - fw) / 2) - .5, y - .5, fw + 1, fh + 1);
      y += fh + 56;

      g.fillStyle = '#6b7280'; g.font = '500 20px Barlow, Arial, sans-serif'; g.textAlign = 'center';
      g.fillText('Activamos tu membresía apenas confirmemos tu pago.', W / 2, y);

      const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
      if (!blob) throw new Error('No se pudo crear la imagen.');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `recibo-megatlon-${r.numero}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast('Recibo descargado.');
    } catch (e) {
      toast(e.message || 'No se pudo descargar el recibo.', 'error');
    } finally {
      if (boton) boton.disabled = false;
    }
  }

  return { abrir, cerrar };
})();
