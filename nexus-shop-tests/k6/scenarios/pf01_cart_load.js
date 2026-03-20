/**
 * scenarios/pf01_cart_load.js
 * PF-01: Carga constante sobre el endpoint de agregar items al carrito.
 *
 * Configuración: 80 VUs durante 3 minutos.
 * Umbral:        p95 < 400ms | error rate < 1%
 *
 * Valida integración: Cart Service ↔ Auth Service ↔ Product Service
 */

import { sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { getToken } from '../helpers/auth.js';
import { addItem, getCart } from '../helpers/cart.js';
import { randomProduct } from '../config/products.js';
import { THRESHOLDS } from '../config/thresholds.js';

// Métricas personalizadas
const cartErrorRate   = new Rate('cart_error_rate');
const addItemDuration = new Trend('add_item_duration_custom');

export const options = {
  vus:      80,
  duration: '3m',
  thresholds: THRESHOLDS.cart_load,
};

export default function () {
  // 1. Obtener token JWT
  const token = getToken();
  if (!token) {
    cartErrorRate.add(1);
    return;
  }

  // 2. Seleccionar producto aleatorio del pool de pruebas
  const product = randomProduct();

  // 3. Agregar item al carrito
  const start = Date.now();
  const { ok, cartId } = addItem(token, product.id, 1);
  addItemDuration.add(Date.now() - start);
  cartErrorRate.add(!ok);

  if (!ok) return;

  // 4. Verificar carrito (30% de los VUs, simula comportamiento real)
  if (Math.random() < 0.3) {
    getCart(token);
  }

  // Think time: 1–3 segundos (simula tiempo de navegación del usuario)
  sleep(Math.random() * 2 + 1);
}
