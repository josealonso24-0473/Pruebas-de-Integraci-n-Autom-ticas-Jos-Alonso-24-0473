/**
 * scenarios/pf03_full_purchase.js
 * PF-03: Flujo completo de compra de principio a fin.
 *
 * Stages:
 *   0→10 VUs en 1 min  (calentamiento)
 *   10→20 VUs en 3 min (carga sostenida)
 *   20→0  VUs en 1 min (enfriamiento)
 *
 * Umbral: p95 < 2000ms global | p95 < 1500ms en checkout | error rate < 1%
 *
 * Valida integración completa:
 *   Auth → Carrito → Product Service (stock) → Checkout → Stripe → Orden
 */

import { group, sleep } from 'k6';
import { Rate } from 'k6/metrics';
import { getToken } from '../helpers/auth.js';
import { addItem, getCart, removeItem } from '../helpers/cart.js';
import { initiateCheckout, getOrder } from '../helpers/checkout.js';
import { randomProduct, STRIPE_CARDS } from '../config/products.js';
import { THRESHOLDS } from '../config/thresholds.js';

const flowErrors = new Rate('flow_errors');

export const options = {
  stages: [
    { duration: '1m', target: 10 }, // Calentamiento gradual
    { duration: '3m', target: 20 }, // Carga sostenida
    { duration: '1m', target: 0  }, // Enfriamiento
  ],
  thresholds: THRESHOLDS.full_purchase,
};

export default function () {
  let token, cartId, orderId;
  let flowOk = true;

  // ── PASO 1: Autenticación ──────────────────────────────────────────────
  group('Autenticacion', () => {
    token = getToken();
    if (!token) flowOk = false;
  });
  if (!flowOk) { flowErrors.add(1); return; }

  sleep(0.5); // Simula tiempo de carga de la página principal

  // ── PASO 2: Agregar producto al carrito ────────────────────────────────
  group('Agregar al carrito', () => {
    const product = randomProduct();
    const { ok, cartId: id } = addItem(token, product.id, 1);
    if (!ok) flowOk = false;
    cartId = id;
  });
  if (!flowOk) { flowErrors.add(1); return; }

  sleep(1); // Simula revisión del carrito por el usuario

  // ── PASO 3: Ver carrito ────────────────────────────────────────────────
  group('Ver carrito', () => {
    const { ok } = getCart(token);
    if (!ok) flowOk = false;
  });
  if (!flowOk) { flowErrors.add(1); return; }

  sleep(2); // Simula decisión de compra del usuario (think time)

  // ── PASO 4: Iniciar checkout ───────────────────────────────────────────
  group('Checkout', () => {
    const { ok, orderId: id } = initiateCheckout(token, STRIPE_CARDS.visa_ok);
    if (!ok) flowOk = false;
    orderId = id;
  });
  if (!flowOk) { flowErrors.add(1); return; }

  sleep(1); // Simula tiempo de confirmación en el frontend (Stripe.js)

  // ── PASO 5: Verificar estado de la orden ──────────────────────────────
  group('Verificar orden', () => {
    if (!orderId) { flowOk = false; return; }
    const { ok } = getOrder(token, orderId);
    if (!ok) flowOk = false;
  });

  flowErrors.add(!flowOk);

  sleep(2); // Tiempo entre iteraciones
}
