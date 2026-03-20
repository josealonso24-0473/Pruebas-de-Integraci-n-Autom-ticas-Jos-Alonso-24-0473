/**
 * scenarios/pf05_soak.js
 * PF-05: Soak Test — carga baja sostenida por 10 minutos.
 *
 * Objetivo: detectar degradación acumulativa (memory leaks, connection pool
 * exhaustion, file descriptor leaks) que no aparece en pruebas cortas.
 *
 * Configuración: 15 VUs constantes durante 10 minutos.
 * Umbral: p95 no debe superar el 20% del valor inicial (aprox. 500ms).
 */

import { sleep } from 'k6';
import { Trend } from 'k6/metrics';
import { getToken } from '../helpers/auth.js';
import { addItem, getCart } from '../helpers/cart.js';
import { THRESHOLDS } from '../config/thresholds.js';
import { randomProduct } from '../config/products.js';

// Tendencia para detectar drift de latencia a lo largo del tiempo
const soakTrend = new Trend('soak_response_drift');

export const options = {
  vus:      15,
  duration: '10m',
  thresholds: THRESHOLDS.soak,
};

// setup() se ejecuta UNA VEZ antes de iniciar los VUs
// Verifica que el sistema esté disponible antes de la prueba prolongada
export function setup() {
  const token = getToken();
  if (!token) {
    throw new Error('SETUP FALLÓ: No se pudo obtener token. Verifique que el servidor esté disponible.');
  }
  console.log('Setup OK — servidor disponible, iniciando soak test de 10 minutos.');
  return { setupTime: Date.now() };
}

export default function (data) {
  const token = getToken();
  if (!token) return;

  const product = randomProduct();
  const start   = Date.now();

  // Alternar entre operaciones de lectura y escritura (patrón real de uso)
  if (__ITER % 3 === 0) {
    // Cada 3 iteraciones: ver carrito (operación de lectura)
    getCart(token);
  } else {
    // Las otras iteraciones: agregar item (operación de escritura)
    addItem(token, product.id, 1);
  }

  soakTrend.add(Date.now() - start);

  // Think time realista — 2 a 4 segundos
  sleep(Math.random() * 2 + 2);
}

// teardown() se ejecuta UNA VEZ al finalizar todos los VUs
export function teardown(data) {
  const duration = Math.round((Date.now() - data.setupTime) / 1000);
  console.log(`Soak test finalizado. Duración total: ${duration}s`);
}
