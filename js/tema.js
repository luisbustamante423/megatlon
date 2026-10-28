// ============ Tema claro / oscuro — Megatlón ============
// La preferencia se guarda en localStorage y se aplica en todas las
// páginas del sitio (landing y panel admin), ya que ambas cargan este
// archivo y comparten las mismas variables de color (css/styles.css +
// css/tema.css).
(function () {
  const CLAVE_TEMA = 'megatlon_tema';

  function aplicarTema(tema) {
    document.documentElement.classList.toggle('light', tema === 'claro');
  }

  function obtenerTema() {
    try {
      return localStorage.getItem(CLAVE_TEMA) === 'claro' ? 'claro' : 'oscuro';
    } catch {
      return 'oscuro';
    }
  }

  function alternarTema() {
    const nuevo = obtenerTema() === 'claro' ? 'oscuro' : 'claro';
    try { localStorage.setItem(CLAVE_TEMA, nuevo); } catch {}
    aplicarTema(nuevo);
  }

  function iniciar() {
    // Puede haber más de un botón (ej. admin.html tiene uno en la
    // pantalla de login y otro en la barra lateral del panel).
    document.querySelectorAll('.btn-tema').forEach((btn) => {
      btn.addEventListener('click', alternarTema);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
