/**
 * Punto de entrada: crea el modelo, las vistas y el controlador (MVC).
 * Se carga como módulo (type="module"), que se ejecuta en diferido:
 * el DOM ya está construido cuando corre este código.
 */
import { Carrera } from './model.js';
import { VistaCircuito, VistaInterfaz } from './view.js';
import { Teclado, Controlador } from './controller.js';

const modelo = new Carrera();

new Controlador({
  modelo,
  vistaCircuito: new VistaCircuito(document.getElementById('lienzo'), modelo),
  vistaInterfaz: new VistaInterfaz(document),
  teclado: new Teclado(window),
});
