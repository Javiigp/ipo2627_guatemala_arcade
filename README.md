# Circuito Arcade

Juego arcade de carreras con vista cenital, hecho con **HTML, CSS y JavaScript nativos** sobre la **Canvas API**, sin bibliotecas ni frameworks.

El jugador sale el último de la parrilla y compite contra hasta tres rivales controlados por la IA. Tiene que completar las vueltas esquivando conos y manchas de aceite y sin destrozar el coche.

## Cómo ejecutarlo

El código usa módulos ES (`type="module"`), que el navegador no carga desde `file://`. Hay que abrirlo desde un servidor local, por ejemplo:

- VS Code + la extensión **Live Server**: clic derecho en `index.html` → *Open with Live Server*.
- O bien `python -m http.server` en la carpeta del proyecto y abrir `http://localhost:8000`.

## Requisitos cubiertos

| Requisito | Implementación |
|---|---|
| Comenzar, pausar y finalizar | Botones *Comenzar / Pausar-Reanudar / Finalizar* y tecla **P**. La partida también se pausa sola al cambiar de pestaña o al abrir la ayuda. |
| Ayuda con las reglas | Botón *Ayuda* → `<dialog>` con el objetivo, los controles, los peligros y el sistema de daños. |
| Ajustar parámetros antes de la partida | Panel de ajustes: vueltas (1–7), rivales (0–3), obstáculos (0–12), dificultad y color del coche. Cada cambio se ve al momento en el lienzo. |
| Indicador de progreso | Marcador con vuelta, posición, tiempo total, tiempo de la vuelta actual, mejor vuelta, velocidad e integridad del coche (`<meter>`). |
| Bucle principal | `Controlador.bucle()` con `requestAnimationFrame`: entrada → actualización → renderizado, con `dt` en segundos. |
| Acciones de las entidades | Aceleración, frenada, marcha atrás y giro. Los rivales conducen con un piloto automático (`PilotoIA`). |
| Actualización y renderizado | El modelo actualiza el estado; `VistaCircuito` limpia y pinta cada fotograma. El circuito estático se pinta una sola vez en un lienzo auxiliar. |
| Colisiones | Coche–coche (círculos con separación e impulso), coche–cono (frenazo, daño y cono despedido), coche–aceite (pérdida de agarre) y bordes del lienzo. |
| Física | Velocidad descompuesta en avance y lateral, aceleración, rozamiento, agarre (que provoca derrapes), penalización en el césped y por daños. |
| Récord | La vuelta rápida se guarda en `localStorage`. |
| Penalización por salirse | Más de 3 s seguidos fuera del asfalto (pisar el bordillo no cuenta), o atajar por el césped hasta otro tramo: el coche queda **1 s inmovilizado** y vuelve al eje de la pista en el último punto válido. El cronómetro sigue corriendo, así que salirse cuesta tiempo. Un aviso con cuenta atrás avisa antes de la sanción. |

## Arquitectura MVC

```
circuito-arcade/
├── index.html          Estructura semántica (un único punto de entrada)
├── css/
│   ├── main.css        Importa el resto en capas (@layer)
│   ├── reset.css       Unificación entre navegadores
│   ├── cromatico.css   Diseño cromático
│   ├── tipografico.css Diseño tipográfico
│   ├── espacial.css    Diseño espacial (cajas, flex, grid, unidades)
│   └── cinetico.css    Transiciones y animaciones
├── img/icono.svg       Favicon
└── js/
    ├── main.js         Crea el modelo, las vistas y el controlador
    ├── model.js        MODELO: CONFIG, geometría, Circuito, Obstaculo, Coche, PilotoIA, Records y Carrera
    ├── view.js         VISTA: VistaCircuito (Canvas) y VistaInterfaz (DOM)
    └── controller.js   CONTROLADOR: Teclado y Controlador (bucle principal)
```

Cada capa del patrón está en un único archivo, dividido en secciones con una clase cada una.

| Clase | Archivo | Responsabilidad |
|---|---|---|
| `CONFIG` | model.js | Parámetros de jugabilidad centralizados |
| `Carrera` | model.js | Estado de la partida, reglas, colisiones, penalizaciones y eventos |
| `Circuito` | model.js | Trazado y consultas geométricas |
| `Coche` | model.js | Física y progreso de cada coche |
| `PilotoIA` | model.js | Decisiones de los rivales |
| `Obstaculo` | model.js | Conos y manchas de aceite |
| `Records` | model.js | Persistencia del récord |
| `VistaCircuito` | view.js | Dibujo en Canvas |
| `VistaInterfaz` | view.js | Marcador, ajustes, avisos y diálogos |
| `Controlador` | controller.js | Bucle principal y coordinación vista ↔ modelo |
| `Teclado` | controller.js | Traducción del teclado a controles |

- **Modelo.** `Carrera` hereda de `EventTarget` y emite eventos (`estado`, `cuenta`, `vuelta`, `impacto`, `fin`). No conoce la interfaz: guarda, por ejemplo, el *índice* de color del coche, no el color en sí.
- **Vista.** Solo lee el modelo. `VistaInterfaz` ofrece métodos `alComenzar(fn)`, `alPausar(fn)`… para que el controlador se suscriba sin tocar el DOM.
- **Controlador.** Traduce las acciones del usuario en llamadas al modelo (`iniciar`, `alternarPausa`, controles del coche) y responde a los eventos del modelo decidiendo qué muestra la vista.

Máquina de estados de la partida: `espera → salida (cuenta atrás) → carrera → terminada`. Desde `salida` o `carrera` se puede pasar a `pausa` y volver.

### Detalles de la lógica

- **Trazado.** Curva Catmull-Rom cerrada a partir de 20 puntos de control, remuestreada cada 8 px. Cada índice del trazado equivale a la misma distancia recorrida, y eso permite medir el progreso y ordenar las posiciones.
- **Vueltas.** Solo cuenta una vuelta si el coche ha pasado por la mitad del circuito. Si cruza la meta marcha atrás, se le descuenta.
- **Salidas de pista y atajos** (`Carrera#seguirProgreso`). El coche conserva el último índice válido del trazado mientras está en el césped.
  - Si pasa `limiteFuera` segundos fuera, se le penaliza.
  - Si reaparece sobre el asfalto en un tramo alejado de ese índice (más de `saltoMaximo` puntos), ha atajado y la penalización es inmediata.
  - La tolerancia de 45 puntos permite apurar la horquilla pisando el bordillo interior.
  - Todos los valores están en `CONFIG.penalizacion` (`model.js`).
- **IA.** Persigue un punto unos metros por delante en su carril, levanta el pie según la curvatura de lo que viene y cambia de carril para esquivar los obstáculos activos.

## Buenas prácticas HTML/CSS/JS

- **Vinculación.** Un solo `<link>` a `main.css` y un `<script type="module">` en el `<head>`. No hay estilos en línea ni atributos `onXXX`: todo va con `addEventListener`. `Teclado` usa el patrón objeto `handleEvent`.
- **Enlace JS–HTML.** Por `id`. El aspecto se cambia con `classList` y con atributos (`hidden`, `disabled`, `aria-pressed`), nunca con `.style`. La única excepción es la sonda temporal que traduce las variables CSS a colores para el Canvas.
- **HTML semántico.** `header`, `nav`, `main`, `aside`, `section`, `footer`, `form`, `fieldset` y `legend`, `label`, `output`, `dl`/`dt`/`dd` para el marcador, `meter`, `menu`, `dialog`, `kbd` y `table`.
- **Selectores.** Solo clases con notación **BEM** (`bloque__elemento--modificador`), todas con la misma especificidad, y anidamiento CSS para los estados (`&:hover`, `&:disabled`).
- **JS.** `const`/`let`, clases, campos y métodos privados (`#`), módulos ES y `dt` para que la velocidad no dependa de los fps.

## Diseño cromático: complementario

- Tono principal **H = 220** (azul noche) para fondos, superficies, textos y césped. Tono **complementario H + 180** (naranja) reservado para los acentos: la acción principal, los bordillos, los conos, el coche por defecto y los datos destacados.
- Toda la paleta está en `:root`, escrita con `hsl()`, `var()` y `calc()`. Cambiando `--h-principal` se recolorea toda la aplicación.
- **El Canvas usa la misma paleta.** `VistaCircuito` lee las variables CSS desde JS, así que no hay ningún color escrito a mano en JavaScript.
- El contraste entre textos y fondo es alto (luminosidad 94 % sobre 9–20 %).

## Diseño tipográfico: dos fuentes contrastadas

- **Monoespaciada** (pila del sistema `ui-monospace…`) para títulos, valores del marcador, botones y avisos. Encaja con la estética arcade, y sus cifras de ancho fijo (`tabular-nums`) hacen que el cronómetro no "baile".
- **Sans-serif del sistema** (`system-ui…`) para los textos y las etiquetas, por legibilidad.
- Escala modular de ratio 1.25 en `rem`, calculada con `calc()`. Las líneas de texto de los diálogos se limitan a `60ch`. Las mayúsculas se reservan para el título principal.
- Solo se usan fuentes estándar del sistema: no hay descargas externas.

## Diseño espacial

- **Unidades.** `rem` para espaciados y textos, `ch` para la longitud de línea, `vh`/`%`/`min()`/`clamp()` para los contenedores y `px` solo para bordes y radios.
- **Composición.**
  - `grid` (bidimensional): página (cabecera, contenido, pie), columnas ajustes–juego, campos del formulario (`grid-template-areas`), marcador (`auto-fit`) y columnas del resultado.
  - `flex` (unidimensional): cabecera, paneles verticales, grupos de botones y opciones de color.
  - Flujo normal: solo en las hojas con texto.
- **Adaptable.** Por debajo de `60rem` los ajustes pasan encima del juego. El ancho del juego se limita por la altura de la ventana para que el lienzo, el marcador y los botones quepan sin desplazamiento vertical.
- **Posicionamiento justificado.** Se usa una sola vez: el aviso (cuenta atrás, pausa, vuelta) se **superpone** al lienzo. El canvas no admite hijos DOM y el aviso no debe ocupar espacio, que es justo el caso de uso del posicionamiento. `.escena` es la referencia (`relative`) y `.aviso` se ajusta a ella (`absolute` + `inset: 0`).
- **Gestalt.**
  - *Región común:* ajustes, datos del marcador y diálogos son superficies con fondo y borde propios.
  - *Proximidad:* cada etiqueta va pegada a su control y separada del siguiente campo.
  - *Semejanza:* todos los datos del marcador tienen la misma forma y todas las acciones el mismo aspecto de botón; la principal se distingue por el color de acento.

## Diseño cinético y usabilidad

- Transiciones cortas en los botones, el aviso aparece con un fundido, la cuenta atrás "late" y la escena tiembla al chocar.
- Todas las animaciones se desactivan con `prefers-reduced-motion`.
- Teclas **WASD** además de las flechas, usando `event.code` para que funcionen con cualquier distribución de teclado. Las flechas no desplazan la página durante la carrera.
- El foco va al lienzo al comenzar, el foco visible está resaltado, los avisos se anuncian con `aria-live` y los diálogos son modales con `Esc` para cerrar.
