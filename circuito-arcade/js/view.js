/**
 * VISTA (MVC): presentación e interacción.
 * Solo lee el modelo; nunca lo modifica.
 *
 * Contenido: VistaCircuito (dibujo en Canvas) · VistaInterfaz (marcador, ajustes, avisos, diálogos)
 */
import { CONFIG } from './model.js';

// ══════════════════════════════════════════════════════════════════════
// Vista del lienzo (Canvas API)
// ══════════════════════════════════════════════════════════════════════

/**
 * VISTA del lienzo: dibuja con Canvas API el circuito, los obstáculos y los coches.
 * Solo lee el modelo; nunca lo modifica.
 *
 * Los colores NO están escritos aquí: se leen de las variables CSS de :root
 * (diseño cromático centralizado en css/cromatico.css).
 */
export class VistaCircuito {
  constructor(canvas, modelo) {
    this.canvas = canvas;
    this.canvas.width = CONFIG.lienzo.ancho;
    this.canvas.height = CONFIG.lienzo.alto;
    this.ctx = canvas.getContext('2d');
    this.colores = this.#leerPaleta();
    this.fuente = getComputedStyle(document.documentElement).getPropertyValue('--fuente-display').trim();
    // El circuito es estático: se dibuja una vez en un lienzo auxiliar y luego se copia
    this.fondo = this.#prerenderizarCircuito(modelo.circuito, modelo.posicionesParrilla);
  }

  /** Ciclo limpiar-pintar de cada fotograma. */
  dibujar(modelo) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.fondo, 0, 0);

    // Orden de pintado = orden de capas: manchas, conos, rivales, jugador
    for (const o of modelo.obstaculos) if (o.tipo === 'aceite') this.#dibujarAceite(o);
    for (const o of modelo.obstaculos) if (o.tipo === 'cono') this.#dibujarCono(o);
    const coches = [...modelo.coches].sort((a, b) => a.esJugador - b.esJugador);
    for (const coche of coches) this.#dibujarCoche(coche);

    if ((modelo.estado === 'espera' || modelo.estado === 'salida') && modelo.jugador) {
      this.#dibujarEtiqueta(modelo.jugador);
    }
  }

  // ───────────────────────── Paleta ─────────────────────────

  #leerPaleta() {
    const nombres = ['cesped', 'cesped-franja', 'asfalto', 'bordillo-a', 'bordillo-b', 'linea', 'meta-a', 'meta-b',
      'cono', 'cono-franja', 'aceite', 'aceite-brillo', 'rueda', 'cabina', 'cristal', 'sombra', 'contorno-jugador', 'etiqueta'];
    const paleta = Object.fromEntries(nombres.map((n) => [n, this.#resolverColor(`--color-${n}`)]));
    paleta.coches = Array.from({ length: CONFIG.coloresCoche }, (_, i) => this.#resolverColor(`--color-coche-${i + 1}`));
    return paleta;
  }

  /**
   * Las variables usan hsl() con calc(); para dárselas al Canvas se resuelven
   * a un color final aplicándolas temporalmente a un elemento y leyendo su color computado.
   */
  #resolverColor(variable) {
    const previo = this.canvas.style.color;
    this.canvas.style.color = `var(${variable})`;
    const color = getComputedStyle(this.canvas).color;
    this.canvas.style.color = previo;
    return color;
  }

  // ───────────────────────── Circuito (estático) ─────────────────────────

  #prerenderizarCircuito(circuito, parrilla) {
    const lienzo = document.createElement('canvas');
    lienzo.width = this.canvas.width;
    lienzo.height = this.canvas.height;
    const ctx = lienzo.getContext('2d');
    const c = this.colores;

    // Césped con franjas
    ctx.fillStyle = c.cesped;
    ctx.fillRect(0, 0, lienzo.width, lienzo.height);
    ctx.fillStyle = c['cesped-franja'];
    for (let x = 0; x < lienzo.width; x += 80) ctx.fillRect(x, 0, 40, lienzo.height);

    const trazar = () => {
      ctx.beginPath();
      circuito.trazado.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
    };
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // Bordillos: trazo ancho bicolor (discontinuo encima de continuo)
    trazar();
    ctx.lineWidth = circuito.anchura + 14;
    ctx.strokeStyle = c['bordillo-a'];
    ctx.stroke();
    // Los trazos discontinuos con extremo redondeado se solaparían: extremo recto
    ctx.lineCap = 'butt';
    ctx.setLineDash([14, 14]);
    ctx.strokeStyle = c['bordillo-b'];
    ctx.stroke();
    ctx.setLineDash([]);

    // Asfalto
    ctx.lineWidth = circuito.anchura;
    ctx.strokeStyle = c.asfalto;
    ctx.stroke();

    // Línea central discontinua
    ctx.lineWidth = 2;
    ctx.setLineDash([14, 18]);
    ctx.strokeStyle = c.linea;
    ctx.stroke();
    ctx.setLineDash([]);

    this.#dibujarMeta(ctx, circuito);
    this.#dibujarParrilla(ctx, parrilla);
    return lienzo;
  }

  #dibujarMeta(ctx, circuito) {
    const p = circuito.punto(0);
    const casilla = 7;
    const mitad = circuito.anchura / 2;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(circuito.direccion(0));
    for (let fila = 0; fila < 2; fila++) {
      for (let k = 0, y = -mitad; y < mitad; k++, y += casilla) {
        ctx.fillStyle = (k + fila) % 2 === 0 ? this.colores['meta-a'] : this.colores['meta-b'];
        ctx.fillRect(fila * casilla - casilla, y, casilla, Math.min(casilla, mitad - y));
      }
    }
    ctx.restore();
  }

  #dibujarParrilla(ctx, parrilla) {
    const { largo, ancho } = CONFIG.coche;
    ctx.strokeStyle = this.colores.linea;
    ctx.lineWidth = 2;
    for (const hueco of parrilla) {
      ctx.save();
      ctx.translate(hueco.x, hueco.y);
      ctx.rotate(hueco.angulo);
      // Marca en "U" abierta hacia delante
      ctx.beginPath();
      ctx.moveTo(largo / 2 + 2, -ancho / 2 - 4);
      ctx.lineTo(-largo / 2 - 2, -ancho / 2 - 4);
      ctx.lineTo(-largo / 2 - 2, ancho / 2 + 4);
      ctx.lineTo(largo / 2 + 2, ancho / 2 + 4);
      ctx.stroke();
      ctx.restore();
    }
  }

  // ───────────────────────── Entidades ─────────────────────────

  #dibujarCoche(coche) {
    const { largo: L, ancho: W } = CONFIG.coche;
    const ctx = this.ctx;
    const c = this.colores;
    ctx.save();
    // Penalizado: parpadea mientras está inmovilizado
    if (coche.penalizado) ctx.globalAlpha = Math.floor(coche.tiempoPenalizacion * 10) % 2 ? 0.25 : 0.9;
    ctx.translate(coche.x, coche.y);
    ctx.rotate(coche.angulo);

    // Sombra desplazada
    ctx.fillStyle = c.sombra;
    ctx.beginPath();
    ctx.roundRect(-L / 2 + 2, -W / 2 + 3, L, W, 6);
    ctx.fill();

    // Ruedas
    ctx.fillStyle = c.rueda;
    for (const rx of [-L * 0.3, L * 0.28]) {
      ctx.fillRect(rx - 5, -W / 2 - 2, 10, 4);
      ctx.fillRect(rx - 5, W / 2 - 2, 10, 4);
    }

    // Carrocería
    ctx.beginPath();
    ctx.roundRect(-L / 2, -W / 2, L, W, 6);
    ctx.fillStyle = c.coches[coche.color - 1];
    ctx.fill();
    if (coche.esJugador) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = c['contorno-jugador'];
      ctx.stroke();
    }

    // Cabina y parabrisas (el morro apunta a +x)
    ctx.fillStyle = c.cabina;
    ctx.beginPath();
    ctx.roundRect(-L * 0.2, -W * 0.32, L * 0.36, W * 0.64, 3);
    ctx.fill();
    ctx.fillStyle = c.cristal;
    ctx.fillRect(L * 0.1, -W * 0.28, L * 0.07, W * 0.56);
    ctx.restore();
  }

  #dibujarEtiqueta(coche) {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = `700 13px ${this.fuente}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = this.colores.etiqueta;
    ctx.fillText('▼ TÚ', coche.x, coche.y - 20);
    ctx.restore();
  }

  #dibujarCono(o) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.rotate(o.angulo);
    if (o.activo) {
      ctx.beginPath();
      ctx.arc(0, 0, o.radio, 0, Math.PI * 2);
      ctx.fillStyle = this.colores.cono;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, o.radio * 0.55, 0, Math.PI * 2);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = this.colores['cono-franja'];
      ctx.stroke();
    } else {
      // Cono tumbado: triángulo alargado semitransparente
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.moveTo(o.radio * 1.4, 0);
      ctx.lineTo(-o.radio, -o.radio * 0.7);
      ctx.lineTo(-o.radio, o.radio * 0.7);
      ctx.closePath();
      ctx.fillStyle = this.colores.cono;
      ctx.fill();
    }
    ctx.restore();
  }

  #dibujarAceite(o) {
    const ctx = this.ctx;
    const r = o.radio;
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.rotate(o.angulo);
    ctx.fillStyle = this.colores.aceite;
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * 0.7, 0, 0, Math.PI * 2);
    ctx.ellipse(r * 0.55, r * 0.35, r * 0.5, r * 0.4, 0, 0, Math.PI * 2);
    ctx.ellipse(-r * 0.5, -r * 0.3, r * 0.45, r * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-r * 0.2, -r * 0.15, r * 0.35, r * 0.12, -0.4, 0, Math.PI * 2);
    ctx.fillStyle = this.colores['aceite-brillo'];
    ctx.fill();
    ctx.restore();
  }
}

// ══════════════════════════════════════════════════════════════════════
// Vista de la interfaz (DOM)
// ══════════════════════════════════════════════════════════════════════

/**
 * VISTA de la interfaz HTML: panel de ajustes, marcador, botones, avisos y diálogos.
 * Recoge las acciones del usuario y las entrega al controlador mediante
 * los métodos `al...(manejador)`; no contiene reglas del juego.
 * El aspecto se cambia con clases (classList), nunca con estilos en línea.
 */
export class VistaInterfaz {
  constructor(raiz = document) {
    const $ = (id) => raiz.getElementById(id);
    this.form = $('formAjustes');
    this.grupoAjustes = $('grupoAjustes');
    this.botones = {
      comenzar: $('btnComenzar'),
      pausar: $('btnPausar'),
      finalizar: $('btnFinalizar'),
      ayuda: $('btnAyuda'),
      repetir: $('btnRepetir'),
    };
    this.marcador = {
      vuelta: $('hudVuelta'),
      posicion: $('hudPosicion'),
      tiempo: $('hudTiempo'),
      tiempoVuelta: $('hudTiempoVuelta'),
      mejor: $('hudMejor'),
      velocidad: $('hudVelocidad'),
      integridad: $('hudIntegridad'),
      integridadTexto: $('hudIntegridadTexto'),
    };
    this.escena = $('escena');
    this.lienzo = $('lienzo');
    this.aviso = { caja: $('aviso'), titulo: $('avisoTitulo'), texto: $('avisoTexto') };
    this.alerta = $('alerta');
    this.dialogoAyuda = $('dialogoAyuda');
    this.resultado = {
      dialogo: $('dialogoResultado'),
      titulo: $('resultadoTitulo'),
      resumen: $('resultadoResumen'),
      record: $('resultadoRecord'),
      vueltas: $('resultadoVueltas'),
      clasificacion: $('resultadoClasificacion'),
    };
    this.temporizadorAviso = null;

    // Los <output> de los deslizadores reflejan su valor al instante
    this.form.addEventListener('input', () => this.#actualizarSalidas());
    this.form.addEventListener('submit', (e) => e.preventDefault());
    this.#actualizarSalidas();
  }

  // ───────────────────────── Enlace de acciones ─────────────────────────

  alComenzar(manejador) { this.botones.comenzar.addEventListener('click', manejador); }
  alPausar(manejador) { this.botones.pausar.addEventListener('click', manejador); }
  alFinalizar(manejador) { this.botones.finalizar.addEventListener('click', manejador); }
  alPedirAyuda(manejador) { this.botones.ayuda.addEventListener('click', manejador); }
  alCambiarAjustes(manejador) { this.form.addEventListener('input', () => manejador(this.leerAjustes())); }
  alRepetir(manejador) {
    this.botones.repetir.addEventListener('click', () => {
      this.resultado.dialogo.close();
      manejador();
    });
  }

  leerAjustes() {
    const datos = new FormData(this.form);
    return {
      vueltas: Number(datos.get('vueltas')),
      rivales: Number(datos.get('rivales')),
      dificultad: datos.get('dificultad'),
      obstaculos: Number(datos.get('obstaculos')),
      color: Number(datos.get('color')),
    };
  }

  // ───────────────────────── Estado de la interfaz ─────────────────────────

  reflejarEstado(estado) {
    const { comenzar, pausar, finalizar } = this.botones;
    const activa = estado === 'salida' || estado === 'carrera' || estado === 'pausa';
    comenzar.disabled = activa;
    pausar.disabled = !activa;
    finalizar.disabled = !activa;
    this.grupoAjustes.disabled = activa;
    comenzar.textContent = estado === 'terminada' ? 'Nueva carrera' : 'Comenzar';
    pausar.textContent = estado === 'pausa' ? 'Reanudar' : 'Pausar';
    pausar.setAttribute('aria-pressed', String(estado === 'pausa'));

    switch (estado) {
      case 'espera':
        this.mostrarAviso('¿Listo?', 'Elige los ajustes y pulsa Comenzar');
        break;
      case 'pausa':
        this.mostrarAviso('Pausa', 'Pulsa P o Reanudar para continuar');
        break;
      case 'terminada':
        this.mostrarAviso('Fin de carrera', 'Pulsa Nueva carrera para volver a correr');
        break;
      case 'carrera':
        this.ocultarAviso();
        break;
    }
  }

  actualizarMarcador(datos) {
    const m = this.marcador;
    this.#escribir(m.vuelta, `${datos.vuelta}/${datos.vueltas}`);
    this.#escribir(m.posicion, `${datos.posicion}º/${datos.total}`);
    this.#escribir(m.tiempo, formatearTiempo(datos.tiempo));
    this.#escribir(m.tiempoVuelta, formatearTiempo(datos.tiempoVuelta));
    this.#escribir(m.mejor, formatearTiempo(datos.mejorVuelta));
    this.#escribir(m.velocidad, `${datos.velocidad} km/h`);
    this.#escribir(m.integridadTexto, `${datos.integridad} %`);
    if (m.integridad.value !== datos.integridad) m.integridad.value = datos.integridad;
    this.#actualizarAlerta(datos);
  }

  /** Aviso de salida de pista: cuenta atrás hasta la penalización y la propia sanción. */
  #actualizarAlerta({ estado, fuera, penalizado }) {
    const visible = estado === 'carrera' && (penalizado || fuera !== null);
    this.alerta.hidden = !visible;
    if (!visible) return;
    this.alerta.classList.toggle('alerta--penalizacion', penalizado);
    this.#escribir(
      this.alerta,
      penalizado ? 'Penalización: 1 s parado' : `¡Fuera de pista! Vuelve al asfalto · ${Math.ceil(fuera)}`
    );
  }

  // ───────────────────────── Avisos sobre el lienzo ─────────────────────────

  mostrarAviso(titulo, texto = '', { cuenta = false, duracion = 0 } = {}) {
    clearTimeout(this.temporizadorAviso);
    const { caja } = this.aviso;
    this.aviso.titulo.textContent = titulo;
    this.aviso.texto.textContent = texto;
    caja.hidden = false;
    caja.classList.toggle('aviso--cuenta', cuenta);
    // Reinicia la animación de entrada en cada aviso
    caja.classList.remove('aviso--animado');
    void caja.offsetWidth;
    caja.classList.add('aviso--animado');
    if (duracion) this.temporizadorAviso = setTimeout(() => this.ocultarAviso(), duracion);
  }

  ocultarAviso() {
    clearTimeout(this.temporizadorAviso);
    this.aviso.caja.hidden = true;
  }

  mostrarCuenta(numero) {
    this.mostrarAviso(String(numero), 'Preparados…', { cuenta: true });
  }

  mostrarSalida() {
    this.mostrarAviso('¡YA!', '', { cuenta: true, duracion: 700 });
  }

  anunciarVuelta(vuelta, total, tiempoUltima) {
    const titulo = vuelta === total ? 'Última vuelta' : `Vuelta ${vuelta}`;
    this.mostrarAviso(titulo, `Anterior: ${formatearTiempo(tiempoUltima)}`, { duracion: 1400 });
  }

  senalarImpacto() {
    this.escena.classList.remove('escena--impacto');
    void this.escena.offsetWidth;
    this.escena.classList.add('escena--impacto');
  }

  enfocarLienzo() {
    this.lienzo.focus();
  }

  // ───────────────────────── Diálogos ─────────────────────────

  abrirAyuda() {
    this.dialogoAyuda.showModal();
  }

  mostrarResultado(res) {
    const r = this.resultado;
    const titulos = {
      meta: res.posicion === 1 ? '¡Victoria!' : `Has llegado ${res.posicion}º`,
      averia: 'Coche averiado',
      abandono: 'Carrera abandonada',
    };
    r.titulo.textContent = titulos[res.motivo];
    r.resumen.textContent =
      res.motivo === 'meta'
        ? `Posición ${res.posicion} de ${res.total} · Tiempo total ${formatearTiempo(res.tiempo)}` +
          (res.penalizaciones ? ` · Penalizaciones: ${res.penalizaciones}` : '')
        : res.motivo === 'averia'
          ? 'La integridad del coche ha llegado a 0 %. Evita conos y golpes con los rivales.'
          : `Has abandonado en la posición ${res.posicion} de ${res.total}.`;

    r.record.textContent = res.nuevoRecord
      ? `¡Nuevo récord de vuelta rápida: ${formatearTiempo(res.record)}!`
      : res.record === null
        ? 'Aún no hay récord de vuelta rápida: termina una carrera para marcarlo.'
        : `Récord de vuelta rápida: ${formatearTiempo(res.record)}`;
    r.record.classList.toggle('resultado__record--nuevo', res.nuevoRecord);

    r.vueltas.replaceChildren(
      ...res.tiemposVuelta.map((t) => {
        const li = crearItem(formatearTiempo(t));
        if (t === res.mejorVuelta) li.classList.add('resultado__item--destacado');
        return li;
      })
    );
    if (!res.tiemposVuelta.length) {
      const vacio = crearItem('Sin vueltas completadas');
      vacio.classList.add('resultado__item--vacio');
      r.vueltas.replaceChildren(vacio);
    }

    r.clasificacion.replaceChildren(
      ...res.clasificacion.map((c) => {
        const li = crearItem(c.tiempo === null ? c.nombre : `${c.nombre} · ${formatearTiempo(c.tiempo)}`);
        if (c.esJugador) li.classList.add('resultado__item--destacado');
        return li;
      })
    );
    r.dialogo.showModal();
  }

  // ───────────────────────── Auxiliares ─────────────────────────

  #actualizarSalidas() {
    for (const salida of this.form.querySelectorAll('output[for]')) {
      salida.value = this.form.elements[salida.htmlFor.value].value;
    }
  }

  /** Solo toca el DOM si el texto cambia (el marcador se refresca cada fotograma). */
  #escribir(elemento, texto) {
    if (elemento.textContent !== texto) elemento.textContent = texto;
  }
}

function crearItem(texto) {
  const li = document.createElement('li');
  li.className = 'resultado__item';
  li.textContent = texto;
  return li;
}

export function formatearTiempo(segundos) {
  if (segundos === null || segundos === undefined) return '–:––.––';
  const minutos = Math.floor(segundos / 60);
  const resto = (segundos % 60).toFixed(2).padStart(5, '0');
  return `${minutos}:${resto}`;
}
