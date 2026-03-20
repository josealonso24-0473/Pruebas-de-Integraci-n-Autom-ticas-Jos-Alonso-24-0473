/**
 * scenarios/pf04_stress.js
 * PF-04: Prueba de estrés incremental — identificar punto de quiebre.
 *
 * Stages: incrementa de 10 a 300 VUs en pasos de 50, luego recupera.
 * Objetivo: observar en qué nivel de carga el sistema comienza a degradarse
 *           (error rate > 5% o p95 > 3000ms).
 *
 * NO se definen thresholds — se analiza el comportamiento libre del sistema.
 */

import { sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { getToken } from '../helpers/auth.js';
import { addItem } from '../helpers/cart.js';
import { STRIPE_CARDS } from '../config/products.js';
import { initiateCheckout } from '../helpers/checkout.js';

const stressErrors   = new Rate('stress_error_rate');
const responseTrend  = new Trend('stress_response_time');

export const options = {
  stages: [
    { duration: '30s', target: 10  }, // Línea base
    { duration: '30s', target: 50  }, // Carga ligera
    { duration: '30s', target: 100 }, // Carga media
    { duration: '30s', target: 150 }, // Carga alta
    { duration: '30s', target: 200 }, // Muy alta
    { duration: '30s', target: 250 }, // Extrema
    { duration: '30s', target: 300 }, // Punto de quiebre esperado
    { duration: '30s', target: 0   }, // Recuperación
  ],
  // Sin thresholds — capturamos todo para análisis post-ejecución
};

export default function () {
  const start = Date.now();

  // Obtener token
  const token = getToken();
  if (!token) {
    stressErrors.add(1);
    responseTrend.add(Date.now() - start);
    return;
  }

  // Operación representativa: agregar item (más rápida que checkout)
  // Esto nos permite observar la capacidad pura del servidor bajo carga
  const { ok } = addItem(token, 'prod_001', 1);

  stressErrors.add(!ok);
  responseTrend.add(Date.now() - start);

  // Think time mínimo para maximizar presión sobre el servidor
  sleep(0.3);
}
