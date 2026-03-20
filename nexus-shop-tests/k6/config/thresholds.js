/**
 * config/thresholds.js
 * Umbrales de rendimiento centralizados para todos los escenarios k6.
 * Importar en cada script con: import { THRESHOLDS } from '../config/thresholds.js';
 */

export const THRESHOLDS = {
  // PF-01: Carga constante en carrito
  cart_load: {
    'http_req_duration{endpoint:add_item}': ['p(95)<400'],
    'http_req_duration{endpoint:get_cart}': ['p(95)<300'],
    'cart_error_rate':  ['rate<0.01'],
    'http_req_failed':  ['rate<0.01'],
  },

  // PF-02: Pico en checkout
  checkout_spike: {
    'http_req_duration{endpoint:checkout}': ['p(95)<1200'],
    'http_req_failed':  ['rate<0.02'],
    'checkout_errors':  ['rate<0.02'],
  },

  // PF-03: Flujo completo de compra
  full_purchase: {
    'http_req_duration':                          ['p(95)<2000'],
    'http_req_duration{group:::Checkout}':        ['p(95)<1500'],
    'http_req_duration{group:::Agregar al carrito}': ['p(95)<400'],
    'http_req_failed':  ['rate<0.01'],
    'flow_errors':      ['rate<0.01'],
  },

  // PF-05: Soak test — sin degradación mayor al 20%
  soak: {
    'http_req_duration': ['p(95)<500'],
    'http_req_failed':   ['rate<0.005'],
  },
};

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
