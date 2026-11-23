/**
 * api.js - Puente entre la app y Apps Script.
 *
 * La app fue escrita para Apps Script (google.script.run). Aquí se emula esa
 * misma interfaz, pero enviando las llamadas por fetch a la Web App de Apps
 * Script, así el resto del código funciona sin cambios:
 *
 *   google.script.run
 *     .withSuccessHandler(fn)
 *     .withFailureHandler(fn)
 *     .nombreDeLaFuncion(arg1, arg2);
 *
 * El cuerpo se envía como text/plain para que el navegador no haga
 * "preflight" de CORS (Apps Script no responde a OPTIONS).
 */
(function () {
  const TIEMPO_MAX_MS = 120000; // 2 minutos (las fotos pueden tardar en redes lentas)

  async function llamarApi(metodo, args) {
    const url = (window.APP_CONFIG && window.APP_CONFIG.API_URL) || '';
    if (!url || url.indexOf('PEGA_AQUI') !== -1) {
      throw new Error('Falta configurar API_URL en el archivo config.js.');
    }

    const control = new AbortController();
    const temporizador = setTimeout(() => control.abort(), TIEMPO_MAX_MS);

    let resp;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ metodo: metodo, args: args }),
        redirect: 'follow',
        signal: control.signal
      });
    } catch (err) {
      if (err && err.name === 'AbortError') {
        throw new Error('El servidor tardó demasiado en responder. Intenta de nuevo.');
      }
      throw new Error('No hay conexión con el servidor. Revisa tu internet y la URL de config.js.');
    } finally {
      clearTimeout(temporizador);
    }

    let datos;
    try {
      datos = await resp.json();
    } catch (err) {
      throw new Error('El servidor no respondió con datos válidos. Verifica que la implementación de Apps Script tenga acceso para "Cualquier persona".');
    }

    if (!datos || datos.ok !== true) {
      throw new Error((datos && datos.error) || 'Error del servidor.');
    }
    return datos.resultado;
  }

  function crearEjecutor(exito, fallo) {
    return new Proxy({}, {
      get: function (_, nombre) {
        if (nombre === 'withSuccessHandler') return (fn) => crearEjecutor(fn, fallo);
        if (nombre === 'withFailureHandler') return (fn) => crearEjecutor(exito, fn);
        return function () {
          const args = Array.prototype.slice.call(arguments);
          llamarApi(String(nombre), args)
            .then((res) => { if (exito) exito(res); })
            .catch((err) => {
              if (fallo) fallo(err);
              else console.error(err);
            });
        };
      }
    });
  }

  window.google = window.google || {};
  window.google.script = { run: crearEjecutor(null, null) };
})();
