/**
 * MODELO (MVC): datos y reglas del juego.
 * No conoce el DOM ni el Canvas. La clase principal es Carrera, que emite
 * eventos (EventTarget) para que el controlador reaccione a los cambios.
 *
 * Contenido: CONFIG · geometría · Circuito · Obstaculo · Coche · PilotoIA · Records · Carrera
 */

// ══════════════════════════════════════════════════════════════════════
// Configuración del juego
// ══════════════════════════════════════════════════════════════════════

/**
 * Parámetros globales del juego.
 * Centralizar los "números mágicos" aquí facilita ajustar la jugabilidad
 * sin tocar la lógica (mantenibilidad).
 * Unidades: píxeles del lienzo y segundos (velocidades en px/s).
 */
export const CONFIG = Object.freeze({
  lienzo: { ancho: 960, alto: 600 },

  circuito: {
    anchura: 84, // anchura del asfalto
    separacion: 8, // distancia entre puntos del trazado remuestreado
    // Puntos de control del eje del circuito (curva cerrada Catmull-Rom).
    // El primero marca la línea de meta; el sentido de carrera es el del array.
    puntosControl: [
      [300, 528], [520, 532], [720, 522],
      [845, 478], [892, 380], [885, 250], [855, 145], [770, 78],
      [630, 72], [525, 100], [470, 180], [425, 280], [330, 330],
      [240, 285], [190, 175], [115, 140], [62, 225], [70, 370],
      [105, 470], [180, 520],
    ],
  },

  coche: {
    largo: 32,
    ancho: 17,
    radio: 14, // radio de colisión
    aceleracion: 240,
    frenada: 480,
    marchaAtras: 160,
    velocidadMaxima: 320,
    velocidadMarchaAtras: 90,
    rozamiento: 90, // deceleración sin pedales
    giro: 3.0, // rad/s a velocidad plena
    agarrePista: 9, // cuanto mayor, menos derrapa
    agarreCesped: 4,
    agarreAceite: 0.7,
    factorCesped: 0.45, // la velocidad máxima se reduce fuera del asfalto
    frenadaCesped: 520,
  },

  dificultades: {
    facil: { etiqueta: 'Fácil', velocidadRival: 0.72, anticipacion: 9 },
    normal: { etiqueta: 'Normal', velocidadRival: 0.86, anticipacion: 10 },
    dificil: { etiqueta: 'Difícil', velocidadRival: 0.97, anticipacion: 11 },
  },

  obstaculos: {
    radioCono: 8,
    radioAceite: 20,
    duracionAceite: 0.9, // segundos sin agarre tras pisar aceite
    margenMeta: 30, // nº de puntos del trazado libres alrededor de la meta
    separacionMinima: 18,
  },

  danos: {
    cono: 8,
    umbralChoque: 60, // velocidad relativa mínima para dañar
    factorChoque: 0.06,
  },

  penalizacion: {
    limiteFuera: 3, // segundos seguidos fuera del asfalto antes de penalizar
    duracion: 1, // segundos que el coche queda inmovilizado
    margenBordillo: 7, // pisar el bordillo aún no cuenta como salirse
    saltoMaximo: 45, // puntos del trazado que se toleran al apurar una curva (horquilla)
    avisoTras: 0.25, // retardo del aviso para no parpadear al rozar el borde
  },

  salida: { cuentaAtras: 3 },
  conversionKmh: 0.75,
  nombresRivales: ['Rayo', 'Cometa', 'Turbo'],
  coloresCoche: 4, // nº de colores disponibles (definidos en CSS)

  ajustesIniciales: Object.freeze({
    vueltas: 3,
    rivales: 3,
    dificultad: 'normal',
    obstaculos: 6,
    color: 1,
  }),
});

// ══════════════════════════════════════════════════════════════════════
// Geometría (funciones puras)
// ══════════════════════════════════════════════════════════════════════

/**
 * Utilidades matemáticas puras (sin estado), compartidas por el modelo.
 */

const clamp = (valor, min, max) => Math.min(max, Math.max(min, valor));

const distancia = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);

/** Acerca `valor` a `objetivo` como mucho `paso` unidades. */
function aproximar(valor, objetivo, paso) {
  if (valor < objetivo) return Math.min(objetivo, valor + paso);
  return Math.max(objetivo, valor - paso);
}

/** Devuelve el ángulo equivalente en el rango (-PI, PI]. */
function normalizarAngulo(angulo) {
  let a = angulo;
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a <= -Math.PI) a += 2 * Math.PI;
  return a;
}

/** Índice circular: envuelve i dentro de [0, n). */
const envolver = (i, n) => ((i % n) + n) % n;

/**
 * Curva Catmull-Rom cerrada que pasa por todos los puntos de control.
 * Devuelve una polilínea densa con `pasos` muestras por tramo.
 */
function catmullRomCerrado(puntos, pasos) {
  const n = puntos.length;
  const curva = [];
  for (let i = 0; i < n; i++) {
    const [x0, y0] = puntos[envolver(i - 1, n)];
    const [x1, y1] = puntos[i];
    const [x2, y2] = puntos[envolver(i + 1, n)];
    const [x3, y3] = puntos[envolver(i + 2, n)];
    for (let s = 0; s < pasos; s++) {
      const t = s / pasos;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (p0, p1, p2, p3) =>
        0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
      curva.push({ x: f(x0, x1, x2, x3), y: f(y0, y1, y2, y3) });
    }
  }
  return curva;
}

/**
 * Remuestrea una polilínea cerrada para que sus puntos queden equiespaciados.
 * Así cada índice del trazado equivale a la misma distancia recorrida.
 */
function remuestrear(puntos, separacion) {
  const resultado = [{ ...puntos[0] }];
  let restante = separacion;
  const n = puntos.length;
  for (let i = 0; i < n; i++) {
    let a = puntos[i];
    const b = puntos[(i + 1) % n];
    let tramo = distancia(a.x, a.y, b.x, b.y);
    while (tramo >= restante) {
      const t = restante / tramo;
      a = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      resultado.push(a);
      tramo -= restante;
      restante = separacion;
    }
    restante -= tramo;
  }
  // Evita que el último punto quede pegado al primero
  const ultimo = resultado[resultado.length - 1];
  if (distancia(ultimo.x, ultimo.y, resultado[0].x, resultado[0].y) < separacion / 2) resultado.pop();
  return resultado;
}

// ══════════════════════════════════════════════════════════════════════
// Circuito
// ══════════════════════════════════════════════════════════════════════

/**
 * Trazado del circuito: eje central equiespaciado y anchura de la pista.
 * Ofrece consultas geométricas (punto más cercano, dirección, desplazamiento lateral).
 */
export class Circuito {
  constructor({ puntosControl, anchura, separacion }) {
    this.anchura = anchura;
    this.separacion = separacion;
    this.trazado = remuestrear(catmullRomCerrado(puntosControl, 24), separacion);
    this.n = this.trazado.length;
  }

  punto(i) {
    return this.trazado[envolver(Math.round(i), this.n)];
  }

  /** Dirección (ángulo) del eje en el índice i. */
  direccion(i) {
    const a = this.punto(i - 1);
    const b = this.punto(i + 1);
    return Math.atan2(b.y - a.y, b.x - a.x);
  }

  /** Punto desplazado `lateral` px a la derecha (en el sentido de carrera) del eje. */
  posicionLateral(i, lateral) {
    const p = this.punto(i);
    const d = this.direccion(i);
    return { x: p.x - Math.sin(d) * lateral, y: p.y + Math.cos(d) * lateral };
  }

  /**
   * Índice del punto del eje más cercano a (x, y).
   * Si se conoce el índice anterior y el coche sigue sobre el asfalto cercano,
   * basta con buscar en una ventana a su alrededor (lo habitual en cada fotograma).
   * Si no, se recorre todo el trazado: la distancia devuelta es siempre la real,
   * y quien llama decide si acepta un salto a otro tramo (ver Carrera#seguirProgreso).
   */
  indiceMasCercano(x, y, indicePrevio = null) {
    if (indicePrevio !== null) {
      const local = this.#buscar(x, y, indicePrevio - 30, indicePrevio + 30);
      if (this.enPista(local.distancia)) return local;
      const global = this.#buscar(x, y, 0, this.n - 1);
      return global.distancia < local.distancia ? global : local;
    }
    return this.#buscar(x, y, 0, this.n - 1);
  }

  enPista(distanciaAlEje) {
    return distanciaAlEje <= this.anchura / 2;
  }

  #buscar(x, y, desde, hasta) {
    let mejor = { indice: 0, distancia: Infinity };
    for (let k = desde; k <= hasta; k++) {
      const i = envolver(k, this.n);
      const p = this.trazado[i];
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < mejor.distancia) mejor = { indice: i, distancia: d };
    }
    return mejor;
  }
}

// ══════════════════════════════════════════════════════════════════════
// Obstáculo
// ══════════════════════════════════════════════════════════════════════

const O = CONFIG.obstaculos;

/**
 * Obstáculo sobre la pista.
 *  - 'cono': al golpearlo frena y daña el coche; sale despedido y deja de colisionar.
 *  - 'aceite': mancha permanente que elimina el agarre durante un instante.
 */
export class Obstaculo {
  constructor(tipo, { x, y, indice, lateral }) {
    this.tipo = tipo;
    this.x = x;
    this.y = y;
    this.indice = indice; // posición sobre el trazado (la usa la IA para esquivar)
    this.lateral = lateral;
    this.escala = tipo === 'aceite' ? 0.8 + Math.random() * 0.4 : 1;
    this.radio = (tipo === 'cono' ? O.radioCono : O.radioAceite) * this.escala;
    this.angulo = Math.random() * Math.PI * 2;
    this.activo = true;
    this.vx = 0;
    this.vy = 0;
    this.giro = 0;
  }

  derribar(vx, vy) {
    this.activo = false;
    this.vx = vx * 0.9 + (Math.random() - 0.5) * 60;
    this.vy = vy * 0.9 + (Math.random() - 0.5) * 60;
    this.giro = (Math.random() - 0.5) * 14;
  }

  actualizar(dt) {
    if (this.activo) return;
    const friccion = Math.exp(-3 * dt);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.angulo += this.giro * dt;
    this.vx *= friccion;
    this.vy *= friccion;
    this.giro *= friccion;
  }
}

// ══════════════════════════════════════════════════════════════════════
// Coche
// ══════════════════════════════════════════════════════════════════════

const P = CONFIG.coche;

/**
 * Coche (jugador o rival). Contiene su estado físico y su progreso en la carrera.
 *
 * Física (vista cenital):
 *  - El ángulo indica hacia dónde apunta el morro.
 *  - La velocidad se descompone en una componente de AVANCE (según el morro)
 *    y otra LATERAL. El motor y los frenos actúan sobre el avance; el agarre
 *    de los neumáticos amortigua la lateral. Con poco agarre (aceite, césped)
 *    la componente lateral persiste y el coche derrapa.
 */
export class Coche {
  constructor({ nombre, color, esJugador = false, x, y, angulo, factorVelocidad = 1 }) {
    this.nombre = nombre;
    this.color = color; // índice de color: la vista lo traduce a la paleta CSS
    this.esJugador = esJugador;
    this.x = x;
    this.y = y;
    this.angulo = angulo;
    this.vx = 0;
    this.vy = 0;
    this.radio = P.radio;
    this.velocidadMaxima = P.velocidadMaxima * factorVelocidad;
    this.controles = { acelerar: false, frenar: false, izquierda: false, derecha: false };

    this.integridad = 100;
    this.tiempoAceite = 0;
    this.distanciaEje = 0;

    // Penalizaciones por salirse del circuito
    this.tiempoFuera = 0; // segundos seguidos fuera del asfalto
    this.tiempoPenalizacion = 0; // > 0 mientras está inmovilizado
    this.penalizaciones = 0;

    // Progreso en carrera
    this.indice = 0;
    this.vuelta = 0; // 0 = en parrilla, aún sin cruzar la meta
    this.pasoMitad = false;
    this.terminado = false;
    this.tiempoLlegada = null;
  }

  get velocidad() {
    return Math.hypot(this.vx, this.vy);
  }

  get velocidadAvance() {
    return this.vx * Math.cos(this.angulo) + this.vy * Math.sin(this.angulo);
  }

  /** Integra la física un paso de tiempo `dt` (segundos). */
  actualizar(dt, enPista) {
    const c = this.controles;

    // 1. Giro: solo es eficaz si el coche se mueve (y se invierte marcha atrás)
    const sentidoGiro = (c.derecha ? 1 : 0) - (c.izquierda ? 1 : 0);
    const eficacia = clamp(this.velocidadAvance / 120, -1, 1);
    this.angulo += sentidoGiro * P.giro * eficacia * dt;

    // 2. Proyección de la velocidad sobre los ejes del coche (ya girado)
    const fx = Math.cos(this.angulo);
    const fy = Math.sin(this.angulo);
    const rx = -fy;
    const ry = fx;
    let avance = this.vx * fx + this.vy * fy;
    let lateral = this.vx * rx + this.vy * ry;

    // 3. Motor, freno y rozamiento sobre el avance
    if (c.acelerar) avance += P.aceleracion * dt;
    if (c.frenar) avance -= (avance > 0 ? P.frenada : P.marchaAtras) * dt;
    if (!c.acelerar && !c.frenar) avance = aproximar(avance, 0, P.rozamiento * dt);

    // 4. Límites de velocidad: el césped y los daños la reducen
    const factorDanos = 0.7 + (0.3 * this.integridad) / 100;
    const maxima = this.velocidadMaxima * factorDanos * (enPista ? 1 : P.factorCesped);
    if (avance > maxima) avance = Math.max(maxima, avance - P.frenadaCesped * dt);
    avance = Math.max(avance, -P.velocidadMarchaAtras);

    // 5. Agarre: amortiguación exponencial de la velocidad lateral
    this.tiempoAceite = Math.max(0, this.tiempoAceite - dt);
    const agarre = this.tiempoAceite > 0 ? P.agarreAceite : enPista ? P.agarrePista : P.agarreCesped;
    lateral *= Math.exp(-agarre * dt);

    // 6. Recomposición e integración de la posición
    this.vx = fx * avance + rx * lateral;
    this.vy = fy * avance + ry * lateral;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }

  frenarPorImpacto(factor) {
    this.vx *= factor;
    this.vy *= factor;
  }

  get penalizado() {
    return this.tiempoPenalizacion > 0;
  }

  /** Inmoviliza el coche `duracion` segundos. */
  penalizar(duracion) {
    this.tiempoPenalizacion = duracion;
    this.tiempoFuera = 0;
    this.vx = 0;
    this.vy = 0;
    this.penalizaciones++;
  }

  /** Devuelve el coche al eje de la pista, parado y orientado en el sentido de carrera. */
  recolocar({ x, y }, angulo) {
    this.x = x;
    this.y = y;
    this.angulo = angulo;
    this.vx = 0;
    this.vy = 0;
    this.tiempoAceite = 0;
    this.tiempoFuera = 0;
    this.distanciaEje = 0;
  }

  danar(cantidad) {
    this.integridad = clamp(this.integridad - cantidad, 0, 100);
  }

  /** Mantiene el coche dentro del lienzo rebotando en los bordes. */
  limitar(ancho, alto) {
    if (this.x < this.radio || this.x > ancho - this.radio) {
      this.x = clamp(this.x, this.radio, ancho - this.radio);
      this.vx *= -0.4;
    }
    if (this.y < this.radio || this.y > alto - this.radio) {
      this.y = clamp(this.y, this.radio, alto - this.radio);
      this.vy *= -0.4;
    }
  }

  /**
   * Actualiza el índice del trazado y detecta el paso por meta.
   * Para que cuente una vuelta hay que pasar antes por la mitad del circuito
   * (evita atajos y "vueltas" yendo marcha atrás sobre la línea).
   * @returns {'vuelta'|null}
   */
  registrarIndice(nuevo, n) {
    const anterior = this.indice;
    this.indice = nuevo;
    if (nuevo >= n * 0.4 && nuevo <= n * 0.6) this.pasoMitad = true;

    const cruzaAdelante = anterior > n * 0.75 && nuevo < n * 0.25;
    const cruzaAtras = anterior < n * 0.25 && nuevo > n * 0.75;

    if (cruzaAdelante && (this.vuelta === 0 || this.pasoMitad)) {
      this.vuelta++;
      this.pasoMitad = false;
      return 'vuelta';
    }
    if (cruzaAtras && this.vuelta > 0) {
      this.vuelta--;
      this.pasoMitad = true;
    }
    return null;
  }

  /** Distancia total recorrida medida en puntos del trazado (para ordenar posiciones). */
  progreso(n) {
    return this.vuelta * n + this.indice;
  }
}

// ══════════════════════════════════════════════════════════════════════
// Piloto automático de los rivales
// ══════════════════════════════════════════════════════════════════════

/**
 * Piloto automático para los rivales.
 * Persigue un punto del trazado situado unos metros por delante, en su carril,
 * levanta el pie antes de las curvas y cambia de carril para esquivar obstáculos.
 * No toca la física: solo decide los controles, igual que haría el teclado.
 */
export class PilotoIA {
  constructor(coche, circuito, { anticipacion, carril }) {
    this.coche = coche;
    this.circuito = circuito;
    this.anticipacion = anticipacion;
    this.carrilBase = carril;
    this.carril = carril;
  }

  decidir(dt, obstaculos) {
    const c = this.coche;
    const ctrl = c.controles;

    if (c.terminado) {
      // Tras cruzar la meta, rueda hasta detenerse
      Object.assign(ctrl, { acelerar: false, frenar: c.velocidadAvance > 5, izquierda: false, derecha: false });
      return;
    }

    // Carril deseado: el base, salvo que haya un obstáculo por delante en él
    const limite = this.circuito.anchura / 2 - 14;
    let deseado = this.carrilBase;
    const n = this.circuito.n;
    for (const o of obstaculos) {
      if (!o.activo) continue;
      const delante = envolver(o.indice - c.indice, n);
      if (delante > 2 && delante < 26 && Math.abs(o.lateral - deseado) < o.radio + c.radio + 6) {
        deseado = o.lateral > 0 ? o.lateral - (o.radio + c.radio + 10) : o.lateral + (o.radio + c.radio + 10);
      }
    }
    this.carril = aproximar(this.carril, clamp(deseado, -limite, limite), 90 * dt);

    // Dirección: hacia el punto objetivo
    const objetivo = this.circuito.posicionLateral(c.indice + this.anticipacion, this.carril);
    const deseadoAng = Math.atan2(objetivo.y - c.y, objetivo.x - c.x);
    const error = normalizarAngulo(deseadoAng - c.angulo);
    ctrl.izquierda = error < -0.04;
    ctrl.derecha = error > 0.04;

    // Velocidad: más lenta cuanto más cerrada sea la curva que viene
    const curva = Math.abs(
      normalizarAngulo(this.circuito.direccion(c.indice + this.anticipacion * 3) - this.circuito.direccion(c.indice))
    );
    const velocidadObjetivo = c.velocidadMaxima * (1 - Math.min(curva, 1.2) * 0.42);
    const v = c.velocidadAvance;
    ctrl.acelerar = v < velocidadObjetivo;
    ctrl.frenar = v > velocidadObjetivo + 40;
  }
}

// ══════════════════════════════════════════════════════════════════════
// Récords
// ══════════════════════════════════════════════════════════════════════

/**
 * Persistencia del récord de vuelta rápida en localStorage.
 * Es parte del modelo porque gestiona datos de la aplicación.
 * Todas las operaciones toleran que el almacenamiento no esté disponible.
 */
export class Records {
  constructor(clave = 'circuito-arcade:record-vuelta') {
    this.clave = clave;
  }

  get mejorVuelta() {
    try {
      const valor = Number(localStorage.getItem(this.clave));
      return valor > 0 ? valor : null;
    } catch {
      return null;
    }
  }

  /** Guarda `tiempo` si mejora el récord. Devuelve true si es un nuevo récord. */
  registrar(tiempo) {
    const actual = this.mejorVuelta;
    if (actual !== null && actual <= tiempo) return false;
    try {
      localStorage.setItem(this.clave, String(tiempo));
    } catch {
      /* sin almacenamiento: el récord solo dura esta partida */
    }
    return true;
  }
}

// ══════════════════════════════════════════════════════════════════════
// Carrera (modelo principal)
// ══════════════════════════════════════════════════════════════════════

/**
 * MODELO principal: estado completo de una carrera y sus reglas.
 * No conoce el DOM ni el Canvas. Comunica los cambios relevantes emitiendo
 * eventos (hereda de EventTarget), que el controlador escucha.
 *
 * Estados: 'espera' → 'salida' (cuenta atrás) → 'carrera' → 'terminada'
 *          'pausa' puede alcanzarse desde 'salida' o 'carrera'.
 *
 * Eventos: 'estado' {anterior, actual} · 'cuenta' · 'vuelta' · 'impacto' {tipo}
 *          'penalizacion' {motivo: 'fuera'|'atajo'} · 'fin'
 */
export class Carrera extends EventTarget {
  constructor() {
    super();
    this.circuito = new Circuito(CONFIG.circuito);
    this.records = new Records();
    this.posicionesParrilla = this.#calcularParrilla(1 + CONFIG.nombresRivales.length);
    this.estado = 'espera';
    this.coches = [];
    this.pilotos = [];
    this.obstaculos = [];
    this.ajustes = { ...CONFIG.ajustesIniciales };
  }

  get jugador() {
    return this.coches.find((c) => c.esJugador) ?? null;
  }

  get enMarcha() {
    return this.estado === 'salida' || this.estado === 'carrera';
  }

  // ───────────────────────── Ciclo de vida ─────────────────────────

  /** Coloca coches y obstáculos según los ajustes, sin arrancar. */
  preparar(ajustes) {
    this.ajustes = { ...CONFIG.ajustesIniciales, ...ajustes };
    this.tiempo = 0;
    this.cuentaAtras = CONFIG.salida.cuentaAtras;
    this.tiemposVuelta = [];
    this.inicioVuelta = null;
    this.llegadas = [];
    this.resultado = null;
    this.#crearCoches();
    this.#colocarObstaculos();
    this.#cambiarEstado('espera');
  }

  iniciar(ajustes) {
    this.preparar(ajustes);
    this.#cambiarEstado('salida');
  }

  pausar() {
    if (!this.enMarcha) return;
    this.estadoPrevio = this.estado;
    this.#cambiarEstado('pausa');
  }

  reanudar() {
    if (this.estado === 'pausa') this.#cambiarEstado(this.estadoPrevio);
  }

  alternarPausa() {
    if (this.estado === 'pausa') this.reanudar();
    else this.pausar();
  }

  finalizar() {
    if (this.enMarcha || this.estado === 'pausa') this.#terminar('abandono');
  }

  // ───────────────────────── Actualización ─────────────────────────

  /** Avanza la simulación `dt` segundos (lo invoca el bucle principal). */
  actualizar(dt) {
    if (this.estado === 'salida') {
      const antes = Math.ceil(this.cuentaAtras);
      this.cuentaAtras -= dt;
      if (this.cuentaAtras <= 0) this.#cambiarEstado('carrera');
      else if (Math.ceil(this.cuentaAtras) !== antes) this.#emitir('cuenta');
    } else if (this.estado === 'carrera') {
      this.#actualizarCarrera(dt);
    }
  }

  #actualizarCarrera(dt) {
    this.tiempo += dt;
    const { ancho, alto } = CONFIG.lienzo;

    for (const piloto of this.pilotos) piloto.decidir(dt, this.obstaculos);

    for (const coche of this.coches) {
      // Coche penalizado: quieto hasta cumplir la sanción y luego de vuelta a la pista
      if (coche.penalizado) {
        coche.tiempoPenalizacion -= dt;
        if (!coche.penalizado) this.#devolverAPista(coche);
        continue;
      }

      coche.actualizar(dt, this.circuito.enPista(coche.distanciaEje));
      coche.limitar(ancho, alto);
      this.#seguirProgreso(coche, dt);
    }

    for (const o of this.obstaculos) o.actualizar(dt);
    this.#colisionesObstaculos();
    this.#colisionesCoches();

    if (this.estado === 'carrera' && this.jugador.integridad <= 0) this.#terminar('averia');
  }

  /**
   * Actualiza la posición del coche sobre el trazado y aplica las reglas de pista:
   *  - Salirse del asfalto más de `limiteFuera` segundos seguidos → penalización.
   *  - Reaparecer sobre el asfalto en otro tramo, lejos del último punto válido
   *    (atajo por el césped) → penalización inmediata.
   * En ambos casos el coche vuelve al último punto válido, así que atajar nunca compensa.
   */
  #seguirProgreso(coche, dt) {
    const { n, anchura } = this.circuito;
    const { limiteFuera, margenBordillo, saltoMaximo } = CONFIG.penalizacion;
    const { indice, distancia } = this.circuito.indiceMasCercano(coche.x, coche.y, coche.indice);
    coche.distanciaEje = distancia;

    const adelante = envolver(indice - coche.indice, n);
    const salto = Math.min(adelante, n - adelante);
    if (salto <= saltoMaximo) {
      if (coche.registrarIndice(indice, n) === 'vuelta') this.#completarVuelta(coche);
    } else if (this.circuito.enPista(distancia)) {
      // Ningún coche avanza tanto en un fotograma: ha cruzado a otro tramo del circuito
      this.#penalizar(coche, 'atajo');
      return;
    }
    // (un salto grande estando en el césped se ignora: conserva el último índice válido)

    const fuera = distancia > anchura / 2 + margenBordillo;
    coche.tiempoFuera = fuera ? coche.tiempoFuera + dt : 0;
    if (coche.tiempoFuera >= limiteFuera) this.#penalizar(coche, 'fuera');
  }

  #penalizar(coche, motivo) {
    coche.penalizar(CONFIG.penalizacion.duracion);
    if (coche.esJugador) this.#emitir('penalizacion', { motivo });
  }

  #devolverAPista(coche) {
    const punto = this.circuito.punto(coche.indice);
    coche.recolocar(punto, this.circuito.direccion(coche.indice));
  }

  #completarVuelta(coche) {
    if (coche.terminado) return;
    if (coche.vuelta > this.ajustes.vueltas) {
      coche.terminado = true;
      coche.tiempoLlegada = this.tiempo;
      this.llegadas.push(coche);
    }
    if (!coche.esJugador) return;

    if (coche.vuelta >= 2) {
      this.tiemposVuelta.push(this.tiempo - this.inicioVuelta);
      if (!coche.terminado) this.#emitir('vuelta');
    }
    this.inicioVuelta = this.tiempo;
    if (coche.terminado) this.#terminar('meta');
  }

  // ───────────────────────── Colisiones ─────────────────────────

  #colisionesObstaculos() {
    for (const coche of this.coches) {
      if (coche.penalizado) continue;
      for (const o of this.obstaculos) {
        if (!o.activo) continue;
        if (Math.hypot(coche.x - o.x, coche.y - o.y) >= coche.radio + o.radio) continue;

        if (o.tipo === 'cono') {
          o.derribar(coche.vx, coche.vy);
          coche.frenarPorImpacto(0.6);
          if (coche.esJugador) {
            coche.danar(CONFIG.danos.cono);
            this.#emitir('impacto', { tipo: 'cono' });
          }
        } else {
          if (coche.esJugador && coche.tiempoAceite <= 0) this.#emitir('impacto', { tipo: 'aceite' });
          coche.tiempoAceite = CONFIG.obstaculos.duracionAceite;
        }
      }
    }
  }

  /** Choques entre coches: círculos con separación e impulso elástico parcial. */
  #colisionesCoches() {
    const restitucion = 0.5;
    for (let i = 0; i < this.coches.length; i++) {
      for (let j = i + 1; j < this.coches.length; j++) {
        const a = this.coches[i];
        const b = this.coches[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const minimo = a.radio + b.radio;
        if (d >= minimo || d === 0) continue;

        const nx = dx / d;
        const ny = dy / d;
        const solape = (minimo - d) / 2;
        a.x -= nx * solape;
        a.y -= ny * solape;
        b.x += nx * solape;
        b.y += ny * solape;

        const relativa = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (relativa >= 0) continue; // ya se separan
        const impulso = (-(1 + restitucion) * relativa) / 2;
        a.vx -= impulso * nx;
        a.vy -= impulso * ny;
        b.vx += impulso * nx;
        b.vy += impulso * ny;

        const fuerza = Math.abs(relativa);
        const jugador = a.esJugador ? a : b.esJugador ? b : null;
        if (jugador && fuerza > CONFIG.danos.umbralChoque) {
          jugador.danar(fuerza * CONFIG.danos.factorChoque);
          this.#emitir('impacto', { tipo: 'choque' });
        }
      }
    }
  }

  // ───────────────────────── Preparación ─────────────────────────

  /** Huecos de salida detrás de la meta, en dos filas alternas. */
  #calcularParrilla(cantidad) {
    const { n, anchura } = this.circuito;
    return Array.from({ length: cantidad }, (_, k) => {
      const indice = envolver(-3 - Math.floor(k / 2) * 6, n);
      const lateral = (k % 2 === 0 ? -1 : 1) * anchura * 0.22;
      return { indice, lateral, ...this.circuito.posicionLateral(indice, lateral), angulo: this.circuito.direccion(indice) };
    });
  }

  #crearCoches() {
    const { rivales, dificultad, color } = this.ajustes;
    const nivel = CONFIG.dificultades[dificultad] ?? CONFIG.dificultades.normal;
    const coloresLibres = Array.from({ length: CONFIG.coloresCoche }, (_, i) => i + 1).filter((c) => c !== color);

    this.coches = [];
    this.pilotos = [];
    // El jugador sale el último: tiene que remontar
    for (let k = 0; k <= rivales; k++) {
      const hueco = this.posicionesParrilla[k];
      const esJugador = k === rivales;
      const coche = new Coche({
        nombre: esJugador ? 'Tú' : CONFIG.nombresRivales[k],
        color: esJugador ? color : coloresLibres[k],
        esJugador,
        x: hueco.x,
        y: hueco.y,
        angulo: hueco.angulo,
        factorVelocidad: esJugador ? 1 : nivel.velocidadRival * (1 - 0.03 * k),
      });
      coche.indice = hueco.indice;
      this.coches.push(coche);
      if (!esJugador) {
        this.pilotos.push(new PilotoIA(coche, this.circuito, { anticipacion: nivel.anticipacion, carril: hueco.lateral }));
      }
    }
  }

  #colocarObstaculos() {
    const { n, anchura } = this.circuito;
    const { margenMeta, separacionMinima } = CONFIG.obstaculos;
    this.obstaculos = [];
    const usados = [];
    let intentos = 0;
    while (this.obstaculos.length < this.ajustes.obstaculos && intentos++ < 500) {
      const indice = margenMeta + Math.floor(Math.random() * (n - 2 * margenMeta));
      const libre = usados.every((u) => Math.min(Math.abs(u - indice), n - Math.abs(u - indice)) >= separacionMinima);
      if (!libre) continue;
      usados.push(indice);
      const tipo = this.obstaculos.length % 3 === 2 ? 'aceite' : 'cono';
      const lateral = (Math.random() * 2 - 1) * (anchura / 2 - 16);
      const pos = this.circuito.posicionLateral(indice, lateral);
      this.obstaculos.push(new Obstaculo(tipo, { ...pos, indice, lateral }));
    }
  }

  // ───────────────────────── Resultados ─────────────────────────

  /** Coches ordenados: primero los que han llegado, luego por distancia recorrida. */
  clasificacion() {
    const n = this.circuito.n;
    const enPista = this.coches.filter((c) => !c.terminado).sort((a, b) => b.progreso(n) - a.progreso(n));
    return [...this.llegadas, ...enPista];
  }

  get posicionJugador() {
    return this.clasificacion().indexOf(this.jugador) + 1;
  }

  get mejorVuelta() {
    return this.tiemposVuelta.length ? Math.min(...this.tiemposVuelta) : null;
  }

  /** Datos que necesita el marcador en cada fotograma. */
  resumen() {
    const j = this.jugador;
    return {
      estado: this.estado,
      vuelta: Math.min(Math.max(j?.vuelta ?? 1, 1), this.ajustes.vueltas),
      vueltas: this.ajustes.vueltas,
      posicion: this.posicionJugador,
      total: this.coches.length,
      tiempo: this.tiempo,
      tiempoVuelta: this.inicioVuelta === null ? null : this.tiempo - this.inicioVuelta,
      mejorVuelta: this.mejorVuelta,
      velocidad: Math.round((j?.velocidad ?? 0) * CONFIG.conversionKmh),
      integridad: Math.round(j?.integridad ?? 100),
      cuentaAtras: Math.ceil(this.cuentaAtras),
      // Segundos que quedan antes de la penalización (null si está en pista)
      fuera: j && j.tiempoFuera > CONFIG.penalizacion.avisoTras ? CONFIG.penalizacion.limiteFuera - j.tiempoFuera : null,
      penalizado: j?.penalizado ?? false,
      penalizaciones: j?.penalizaciones ?? 0,
    };
  }

  #terminar(motivo) {
    const mejorVuelta = this.mejorVuelta;
    const nuevoRecord = motivo === 'meta' && mejorVuelta !== null && this.records.registrar(mejorVuelta);
    this.resultado = {
      motivo,
      posicion: this.posicionJugador,
      total: this.coches.length,
      tiempo: this.tiempo,
      tiemposVuelta: [...this.tiemposVuelta],
      mejorVuelta,
      record: this.records.mejorVuelta,
      nuevoRecord,
      penalizaciones: this.jugador.penalizaciones,
      clasificacion: this.clasificacion().map((c) => ({ nombre: c.nombre, esJugador: c.esJugador, tiempo: c.tiempoLlegada })),
    };
    this.#cambiarEstado('terminada');
    this.#emitir('fin', this.resultado);
  }

  #cambiarEstado(actual) {
    const anterior = this.estado;
    this.estado = actual;
    this.#emitir('estado', { anterior, actual });
  }

  #emitir(tipo, detalle = null) {
    this.dispatchEvent(new CustomEvent(tipo, { detail: detalle }));
  }
}
