/**
 * helpers/auth.js
 * Funciones de autenticación reutilizables para todos los escenarios k6.
 *
 * Usuarios de prueba pre-registrados en la BD de test de NEXUS SHOP.
 * Se distribuyen por VU para evitar colisiones de sesión concurrente.
 */

import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Pool de usuarios de prueba (deben existir en la BD antes de correr las pruebas)
const TEST_USERS = [
  { email: 'buyer01@nexustest.com', password: 'Test@1234' },
  { email: 'buyer02@nexustest.com', password: 'Test@1234' },
  { email: 'buyer03@nexustest.com', password: 'Test@1234' },
  { email: 'buyer04@nexustest.com', password: 'Test@1234' },
  { email: 'buyer05@nexustest.com', password: 'Test@1234' },
  { email: 'buyer06@nexustest.com', password: 'Test@1234' },
  { email: 'buyer07@nexustest.com', password: 'Test@1234' },
  { email: 'buyer08@nexustest.com', password: 'Test@1234' },
  { email: 'buyer09@nexustest.com', password: 'Test@1234' },
  { email: 'buyer10@nexustest.com', password: 'Test@1234' },
];

/**
 * Obtiene un token JWT para el VU actual.
 * Distribuye usuarios en round-robin según el número de VU.
 *
 * @returns {string|null} access_token JWT o null si falla el login
 */
export function getToken() {
  const user = TEST_USERS[(__VU - 1) % TEST_USERS.length];

  const res = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email: user.email, password: user.password }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags:    { endpoint: 'login' },
    }
  );

  const ok = check(res, {
    'login: status 200':    (r) => r.status === 200,
    'login: tiene token':   (r) => r.json('access_token') !== undefined,
  });

  if (!ok) return null;
  return res.json('access_token');
}

/**
 * Retorna los headers HTTP estándar con Authorization Bearer.
 * @param {string} token - JWT access token
 */
export function authHeaders(token) {
  return {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${token}`,
  };
}
