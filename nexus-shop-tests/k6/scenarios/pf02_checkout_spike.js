/**
 * scenarios/pf02_checkout_spike.js
 * PF-02: Pico de tráfico simultáneo en el endpoint de checkout.
 *
 * Configuración: 50 VUs durante 2 minutos (sin rampa — spike directo).
 * Umbral:        p95 < 1200ms | error rate < 2%
 *
 * Valida integración: Cart ↔ Auth ↔ Product ↔ Stripe API (sandbox)
 * Escenario realista: flash sale donde muchos usuarios compran al mismo tiempo.
 */

import { sleep } from 'k6';
import { Rate } from 'k6/metrics';
import { getToken } from '../helpers/auth.js';
import { addItem } from '../helpers/cart.js';
import { initiateCheckout } from '../helpers/checkout.js';
import { THRESHOLDS } from '../config/thresholds.js';
import { STRIPE_CARDS } from '../config/products.js';

const checkoutErrors = new Rate('checkout_errors');

export const options = {
  vus:      50,
  duration: '2m',
  thresholds: THRESHOLDS.checkout_spike,
};

export default function () {
  // 1. Autenticarse
  const token = getToken();
  if (!token) { checkoutErrors.add(1); return; }

  // 2. Agregar producto al carrito (pre-condición del checkout)
  const { ok: cartOk } = addItem(token, 'prod_007', 1);
  if (!cartOk) { checkoutErrors.add(1); return; }

  // 3. Iniciar checkout con tarjeta Visa de prueba (aprobada)
  const { ok: checkoutOk } = initiateCheckout(token, STRIPE_CARDS.visa_ok);
  checkoutErrors.add(!checkoutOk);

  // Think time reducido — simula pico real (usuarios en carrera por stock)
  sleep(0.5);
}
