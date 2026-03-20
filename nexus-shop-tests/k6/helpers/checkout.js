/**
 * helpers/checkout.js
 * Funciones reutilizables para operaciones de checkout y consulta de órdenes.
 */

import http from 'k6/http';
import { check } from 'k6';
import { STRIPE_CARDS } from '../config/products.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

/**
 * Inicia el proceso de checkout para el carrito activo.
 * Crea un PaymentIntent en Stripe sandbox y retorna el clientSecret.
 *
 * @param {string} token           - JWT access token
 * @param {string} paymentMethodId - ID del método de pago (Stripe PM ID)
 * @returns {{ ok: boolean, orderId: string|null, clientSecret: string|null }}
 */
export function initiateCheckout(token, paymentMethodId = STRIPE_CARDS.visa_ok) {
  const res = http.post(
    `${BASE_URL}/api/checkout`,
    JSON.stringify({ paymentMethodId }),
    {
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
      tags: { endpoint: 'checkout' },
    }
  );

  const ok = check(res, {
    'checkout: status 201':         (r) => r.status === 201,
    'checkout: tiene orderId':       (r) => r.json('orderId') !== undefined,
    'checkout: tiene clientSecret':  (r) => r.json('clientSecret') !== undefined,
    'checkout: tiene amount':        (r) => typeof r.json('amount') === 'number',
    'checkout: currency es USD':     (r) => r.json('currency') === 'USD',
  });

  return {
    ok,
    orderId:      ok ? res.json('orderId')      : null,
    clientSecret: ok ? res.json('clientSecret') : null,
    amount:       ok ? res.json('amount')       : null,
  };
}

/**
 * Consulta el estado actual de una orden por su ID.
 *
 * @param {string} token   - JWT access token
 * @param {string} orderId - ID de la orden a consultar
 * @returns {{ ok: boolean, status: string|null, order: object|null }}
 */
export function getOrder(token, orderId) {
  const res = http.get(
    `${BASE_URL}/api/orders/${orderId}`,
    {
      headers: { 'Authorization': `Bearer ${token}` },
      tags:    { endpoint: 'get_order' },
    }
  );

  const ok = check(res, {
    'getOrder: status 200':   (r) => r.status === 200,
    'getOrder: tiene status': (r) => r.json('status') !== undefined,
  });

  return {
    ok,
    status: ok ? res.json('status') : null,
    order:  ok ? res.json()         : null,
  };
}
