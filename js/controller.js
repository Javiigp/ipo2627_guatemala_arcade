/**
 * CONTROLADOR (MVC): intermediario entre las vistas y el modelo.
 * Contiene el bucle principal del juego (requestAnimationFrame) y la entrada por teclado.
 *
 * Contenido: Teclado · Controlador
 */

// ══════════════════════════════════════════════════════════════════════
// Teclado
// ══════════════════════════════════════════════════════════════════════

/**
 * Traduce el teclado en controles del coche.
 * Se usa `event.code` (posición física de la tecla) para que WASD funcione
 * igual en cualquier distribución de teclado.
 */
const CONDUCCION = {
  ArrowUp: 'acelerar', KeyW: 'acelerar',
  ArrowDown: 'frenar', KeyS: 'frenar',
  ArrowLeft: 'izquierda', KeyA: 'izquierda',
  ArrowRight: 'derecha', KeyD: 'derecha',
};

const ACCIONES = { KeyP: 'pausa' };

export class Teclado {
  constructor(destino = window) {
    this.estado = { acelerar: false, frenar: false, izquierda: false, derecha: false };
    this.activo = false; // solo se captura la conducción durante la carrera
    this.alAccion = () => {};
    destino.addEventListener('keydown', this);
    destino.addEventListener('keyup', this);
    destino.addEventListener('blur', this);
  }

  /** Patrón objeto handleEvent: un único objeto atiende varios tipos de evento. */
  handleEvent(evento) {
    switch (evento.type) {
      case 'keydown':
        this.#pulsar(evento);
        break;
      case 'keyup':
        if (CONDUCCION[evento.code]) this.estado[CONDUCCION[evento.code]] = false;
        break;
      case 'blur':
        this.soltarTodo();
        break;
    }
  }

  #pulsar(evento) {
    if (document.querySelector('dialog[open]')) return; // con un diálogo abierto no se juega
    const control = CONDUCCION[evento.code];
    if (control && this.activo) {
      evento.preventDefault(); // evita que las flechas desplacen la página
      this.estado[control] = true;
      return;
    }
    const accion = ACCIONES[evento.code];
    if (accion && !evento.repeat) this.alAccion(accion);
  }

  soltarTodo() {
    for (const clave of Object.keys(this.estado)) this.estado[clave] = false;
  }
}

// ══════════════════════════════════════════════════════════════════════
// Controlador y bucle principal
// ══════════════════════════════════════════════════════════════════════

/**
 * CONTROLADOR: intermediario entre las vistas y el modelo.
 *  1. Recibe las peticiones del usuario (botones, ajustes, teclado).
 *  2. Las traduce en acciones sobre el modelo (iniciar, pausar, controles...).
 *  3. Escucha los eventos del modelo y decide qué debe mostrar cada vista.
 * Además centraliza el BUCLE PRINCIPAL del juego con requestAnimationFrame.
 */
export class Controlador {
  constructor({ modelo, vistaCircuito, vistaInterfaz, teclado }) {
    this.modelo = modelo;
    this.vistaCircuito = vistaCircuito;
    this.vista = vistaInterfaz;
    this.teclado = teclado;
    this.ultimoInstante = null;

    this.#vincularVista();
    this.#vincularModelo();
    this.modelo.preparar(this.vista.leerAjustes());
    requestAnimationFrame(this.bucle);
  }

  /**
   * Bucle principal: entrada → actualización → renderizado.
   * dt (segundos) hace la física independiente de los fps del monitor;
   * se limita para que un salto de pestaña no "teletransporte" los coches.
   */
  bucle = (instante) => {
    requestAnimationFrame(this.bucle);
    const dt = this.ultimoInstante === null ? 0 : Math.min((instante - this.ultimoInstante) / 1000, 1 / 30);
    this.ultimoInstante = instante;

    const jugador = this.modelo.jugador;
    if (jugador && this.modelo.estado === 'carrera') Object.assign(jugador.controles, this.teclado.estado);

    this.modelo.actualizar(dt);
    this.vistaCircuito.dibujar(this.modelo);
    this.vista.actualizarMarcador(this.modelo.resumen());
  };

  comenzar() {
    this.modelo.iniciar(this.vista.leerAjustes());
    this.vista.enfocarLienzo();
  }

  #vincularVista() {
    this.vista.alComenzar(() => this.comenzar());
    this.vista.alRepetir(() => this.comenzar());
    this.vista.alPausar(() => this.modelo.alternarPausa());
    this.vista.alFinalizar(() => this.modelo.finalizar());
    this.vista.alPedirAyuda(() => {
      this.modelo.pausar(); // leer las reglas no debe costar la carrera
      this.vista.abrirAyuda();
    });
    // Vista previa: cambiar un ajuste recoloca coches y obstáculos al momento
    this.vista.alCambiarAjustes((ajustes) => {
      if (this.modelo.estado === 'espera' || this.modelo.estado === 'terminada') this.modelo.preparar(ajustes);
    });

    this.teclado.alAccion = (accion) => {
      if (accion === 'pausa') this.modelo.alternarPausa();
    };
    // Si el usuario cambia de pestaña, se pausa automáticamente
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.modelo.pausar();
    });
  }

  #vincularModelo() {
    const m = this.modelo;
    m.addEventListener('estado', ({ detail }) => {
      const { anterior, actual } = detail;
      this.teclado.activo = actual === 'salida' || actual === 'carrera';
      if (!this.teclado.activo) this.teclado.soltarTodo();
      this.vista.reflejarEstado(actual);
      if (actual === 'salida') this.vista.mostrarCuenta(Math.ceil(m.cuentaAtras));
      if (actual === 'carrera' && anterior === 'salida') this.vista.mostrarSalida();
    });
    m.addEventListener('cuenta', () => this.vista.mostrarCuenta(Math.ceil(m.cuentaAtras)));
    m.addEventListener('vuelta', () => {
      const { vuelta, vueltas } = m.resumen();
      this.vista.anunciarVuelta(vuelta, vueltas, m.tiemposVuelta.at(-1));
    });
    m.addEventListener('impacto', () => this.vista.senalarImpacto());
    m.addEventListener('penalizacion', () => this.vista.senalarImpacto());
    m.addEventListener('fin', ({ detail }) => this.vista.mostrarResultado(detail));
  }
}
