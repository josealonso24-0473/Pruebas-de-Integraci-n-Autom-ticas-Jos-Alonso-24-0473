/**
 * helpers/cart.js
 * Funciones reutilizables para operaciones sobre el carrito de compras.
 */

import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

/**
 * Agrega un producto al carrito del usuario autenticado.
 *
 * @param {string} token      - JWT access token
 * @param {string} productId  - ID del producto a agregar
 * @param {number} quantity   - Cantidad (default: 1)
 * @returns {{ ok: boolean, cartId: string|null, response: object }}
 */
export function addItem(token, productId, quantity = 1) {
  const res = http.post(
    `${BASE_URL}/api/cart/items`,
    JSON.stringify({ productId, quantity }),
    {
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
      tags: { endpoint: 'add_item' },
    }
  );

  const ok = check(res, {
    'addItem: status 200 o 201': (r) => r.status === 200 || r.status === 201,
    'addItem: tiene cartId':     (r) => r.json('cartId') !== undefined,
    'addItem: tiene items':      (r) => Array.isArray(r.json('items')),
  });

  return {
    ok,
    cartId:   ok ? res.json('cartId') : null,
    response: res,
  };
}

/**
 * Obtiene el carrito activo del usuario autenticado.
 *
 * @param {string} token - JWT access token
 * @returns {{ ok: boolean, cart: object|null }}
 */
export function getCart(token) {
  const res = http.get(
    `${BASE_URL}/api/cart`,
    {
      headers: { 'Authorization': `Bearer ${token}` },
      tags:    { endpoint: 'get_cart' },
    }
  );

  const ok = check(res, {
    'getCart: status 200':   (r) => r.status === 200,
    'getCart: tiene items':  (r) => Array.isArray(r.json('items')),
    'getCart: tiene total':  (r) => typeof r.json('total') === 'number',
  });

  return { ok, cart: ok ? res.json() : null };
}

/**
 * Actualiza la cantidad de un item del carrito.
 *
 * @param {string} token    - JWT access token
 * @param {string} itemId   - ID del item en el carrito
 * @param {number} quantity - Nueva cantidad
 */
export function updateItem(token, itemId, quantity) {
  const res = http.patch(
    `${BASE_URL}/api/cart/items/${itemId}`,
    JSON.stringify({ quantity }),
    {
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
      tags: { endpoint: 'update_item' },
    }
  );

  return check(res, {
    'updateItem: status 200': (r) => r.status === 200,
  });
}

/**
 * Elimina un item del carrito.
 *
 * @param {string} token  - JWT access token
 * @param {string} itemId - ID del item a eliminar
 */
export function removeItem(token, itemId) {
  const res = http.del(
    `${BASE_URL}/api/cart/items/${itemId}`,
    null,
    {
      headers: { 'Authorization': `Bearer ${token}` },
      tags:    { endpoint: 'remove_item' },
    }
  );

  return check(res, {
    'removeItem: status 200 o 204': (r) => r.status === 200 || r.status === 204,
  });
}
