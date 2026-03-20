/**
 * run-tests.js
 * ─────────────────────────────────────────────────────────────────
 * NEXUS SHOP — Ejecutor todo-en-uno
 *
 * Levanta el mock server y ejecuta las pruebas de integración con Newman.
 * No requiere ninguna configuración externa.
 *
 * Uso:  node run-tests.js
 * ─────────────────────────────────────────────────────────────────
 */

const express = require('express');
const newman  = require('newman');
const path    = require('path');
const fs      = require('fs');

// ════════════════════════════════════════════════════════════════════
// 1. MOCK SERVER
// ════════════════════════════════════════════════════════════════════

const app = express();
app.use(express.json());

const db = {
  users: [
    { id: 'user_01', email: 'buyer01@nexustest.com', password: 'Test@1234', name: 'Comprador 01' },
    { id: 'user_02', email: 'buyer02@nexustest.com', password: 'Test@1234', name: 'Comprador 02' },
    { id: 'user_03', email: 'buyer03@nexustest.com', password: 'Test@1234', name: 'Comprador 03' },
  ],
  products: {
    'prod_001': { id: 'prod_001', name: 'Auriculares Bluetooth XZ-200', price: 4999,  stock: 500 },
    'prod_007': { id: 'prod_007', name: 'Monitor LED 24 FHD NexView',   price: 29999, stock: 200 },
    'prod_012': { id: 'prod_012', name: 'Webcam HD 1080p StreamCam',    price: 5999,  stock: 350 },
    'prod_OUT_OF_STOCK': { id: 'prod_OUT_OF_STOCK', name: 'Sin stock',  price: 100,   stock: 0   },
  },
  tokens:      new Map(),
  carts:       new Map(),
  orders:      new Map(),
  processedPI: new Set(),
};

let _order = 1000, _cart = 100, _item = 200;

function makeToken(userId) {
  const p = Buffer.from(JSON.stringify({ sub: userId, iat: Date.now() })).toString('base64');
  return 'eyJhbGciOiJIUzI1NiJ9.' + p + '.nexus_mock_sig';
}
function userByToken(req) {
  const h = req.headers['authorization'];
  if (!h || !h.startsWith('Bearer ')) return null;
  return db.tokens.get(h.slice(7)) || null;
}
function requireAuth(req, res, next) {
  const u = userByToken(req);
  if (!u) return res.status(401).json({ message: 'Unauthorized: token invalido o ausente' });
  req.user = u; next();
}
function getCart(userId) {
  if (!db.carts.has(userId))
    db.carts.set(userId, { cartId: 'cart_' + (++_cart), userId, items: [], total: 0 });
  return db.carts.get(userId);
}
function recalc(c) {
  c.total = c.items.reduce((s, i) => {
    const p = db.products[i.productId];
    return s + (p ? p.price * i.quantity : 0);
  }, 0);
}
const wait = ms => new Promise(r => setTimeout(r, ms));

// AUTH
app.post('/api/auth/login', async (req, res) => {
  await wait(60 + Math.random() * 80);
  const { email, password } = req.body || {};
  const u = db.users.find(u => u.email === email && u.password === password);
  if (!u) return res.status(401).json({ message: 'Credenciales invalidas' });
  const token = makeToken(u.id);
  db.tokens.set(token, u);
  res.json({ access_token: token, refresh_token: 'rft_' + token,
             user: { id: u.id, email: u.email, name: u.name } });
});

app.post('/api/auth/register', async (req, res) => {
  await wait(80 + Math.random() * 100);
  const { email, name, password } = req.body || {};
  if (!email || !name || !password) return res.status(400).json({ error: 'Campos requeridos' });
  if (db.users.find(u => u.email === email)) return res.status(409).json({ error: 'Email ya registrado' });
  const u = { id: 'user_' + Date.now(), email, name, password };
  db.users.push(u);
  res.status(201).json({ userId: u.id });
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  await wait(30);
  res.json({ id: req.user.id, email: req.user.email, name: req.user.name });
});

// CART
app.get('/api/cart', requireAuth, async (req, res) => {
  await wait(40 + Math.random() * 50);
  const c = getCart(req.user.id); recalc(c); res.json(c);
});

app.post('/api/cart/items', requireAuth, async (req, res) => {
  await wait(80 + Math.random() * 100);
  const { productId, quantity = 1 } = req.body || {};
  const prod = db.products[productId];
  if (!prod) return res.status(404).json({ error: 'Producto ' + productId + ' no encontrado' });
  if (prod.stock < quantity)
    return res.status(422).json({ error: 'Insufficient stock: solo ' + prod.stock + ' unidades de "' + prod.name + '"' });
  const c = getCart(req.user.id);
  const ex = c.items.find(i => i.productId === productId);
  if (ex) ex.quantity += quantity;
  else c.items.push({ itemId: 'item_' + (++_item), productId, name: prod.name, price: prod.price, quantity });
  recalc(c);
  res.status(201).json(c);
});

app.patch('/api/cart/items/:itemId', requireAuth, async (req, res) => {
  await wait(50 + Math.random() * 60);
  const { quantity } = req.body || {};
  const c = getCart(req.user.id);
  const idx = c.items.findIndex(i => i.itemId === req.params.itemId);
  if (idx === -1) return res.status(404).json({ error: 'Item no encontrado en el carrito' });
  if (!quantity || quantity === 0) c.items.splice(idx, 1);
  else c.items[idx].quantity = quantity;
  recalc(c); res.json(c);
});

app.delete('/api/cart/items/:itemId', requireAuth, async (req, res) => {
  await wait(40);
  const c = getCart(req.user.id);
  const idx = c.items.findIndex(i => i.itemId === req.params.itemId);
  if (idx === -1) return res.status(404).json({ error: 'Item no encontrado' });
  c.items.splice(idx, 1); recalc(c); res.json(c);
});

app.delete('/api/cart', requireAuth, async (req, res) => {
  db.carts.delete(req.user.id);
  res.json({ cartId: null, items: [], total: 0 });
});

// CHECKOUT
app.post('/api/checkout', requireAuth, async (req, res) => {
  await wait(300 + Math.random() * 250);
  const { paymentMethodId } = req.body || {};
  const c = getCart(req.user.id);

  if (!c.items.length)
    return res.status(400).json({ error: 'El cart esta vacio. Agrega productos antes de hacer checkout.' });

  // BUG TC-06: tarjeta rechazada -> 500 en lugar de 402
  if (paymentMethodId === 'pm_card_visa_chargeDeclined' ||
      paymentMethodId === 'pm_card_chargeDeclinedInsufficientFunds') {
    return res.status(500).json({
      error:    'Internal Server Error',
      message:  'StripeCardError: Your card was declined.',
      bug_note: 'Deberia retornar HTTP 402 Payment Required',
    });
  }

  recalc(c);
  const orderId = 'order_' + (++_order);
  const piRaw   = 'pi' + Date.now() + Math.random().toString(36).slice(2, 10);
  const piId    = piRaw.replace(/[^a-zA-Z0-9]/g, '');
  const secret  = piId + '_secret_' + Math.random().toString(36).slice(2, 10).replace(/[^a-zA-Z0-9]/g, '');

  const order = {
    orderId, paymentIntentId: piId, clientSecret: secret,
    userId: req.user.id, items: [...c.items],
    amount: c.total, currency: 'USD',
    status: 'PENDING', createdAt: new Date().toISOString(),
  };
  db.orders.set(orderId, order);
  res.status(201).json({ orderId, paymentIntentId: piId, clientSecret: secret,
                         amount: c.total, currency: 'USD', items: c.items });
});

app.post('/api/checkout/confirm', async (req, res) => {
  await wait(120 + Math.random() * 130);
  const piId = req.body && req.body.data && req.body.data.object ? req.body.data.object.id : null;
  if (!piId) return res.status(400).json({ error: 'Payload de webhook invalido: falta data.object.id' });

  let order = null;
  for (const [, o] of db.orders) { if (o.paymentIntentId === piId) { order = o; break; } }
  if (!order) return res.status(404).json({ error: 'Orden no encontrada para este payment_intent' });

  // BUG TC-08: verificacion de idempotencia comentada intencionalmente
  // if (db.processedPI.has(piId)) {
  //   return res.status(200).json({ alreadyProcessed: true, orderId: order.orderId });
  // }

  db.processedPI.add(piId);
  order.items.forEach(i => {
    const p = db.products[i.productId];
    if (p) p.stock = Math.max(0, p.stock - i.quantity);
  });
  order.status = 'PAID';
  order.paidAt = new Date().toISOString();
  db.carts.delete(order.userId);

  res.json({ orderId: order.orderId, status: 'PAID' }); // BUG: falta alreadyProcessed:true
});

// ORDERS & PRODUCTS
app.get('/api/orders/:orderId', requireAuth, async (req, res) => {
  await wait(35 + Math.random() * 40);
  const o = db.orders.get(req.params.orderId);
  if (!o || o.userId !== req.user.id) return res.status(404).json({ error: 'Orden no encontrada' });
  res.json(o);
});

app.get('/api/products/:productId/stock', requireAuth, async (req, res) => {
  await wait(25);
  const p = db.products[req.params.productId];
  if (!p) return res.status(404).json({ error: 'Producto no encontrado' });
  res.json({ productId: p.id, stock: p.stock });
});

app.get('/health', (_, res) => res.json({ status: 'ok', service: 'NEXUS SHOP Mock Server' }));

// Logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms   = Date.now() - start;
    const icon = res.statusCode < 400 ? '\u2705' : res.statusCode < 500 ? '\u26A0\uFE0F ' : '\u274C';
    process.stdout.write('  ' + icon + ' ' + String(res.statusCode).padEnd(4) +
      req.method.padEnd(8) + req.path.padEnd(38) + ms + 'ms\n');
  });
  next();
});

// ════════════════════════════════════════════════════════════════════
// 2. COLECCION NEWMAN
// ════════════════════════════════════════════════════════════════════

const COLLECTION = {
  info: {
    name: 'NEXUS SHOP — Cart & Checkout Integration Tests',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  item: [

    {
      name: 'Setup: Login',
      event: [{ listen: 'test', script: { type: 'text/javascript', exec: [
        'pm.test("Login: status 200", () => pm.response.to.have.status(200));',
        'pm.test("Login: tiene access_token", () => {',
        '  const j = pm.response.json();',
        '  pm.expect(j).to.have.property("access_token");',
        '  pm.environment.set("token", j.access_token);',
        '});',
      ]}}],
      request: {
        method: 'POST',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: { mode: 'raw', raw: '{"email":"buyer01@nexustest.com","password":"Test@1234"}' },
        url: { raw: '{{base_url}}/api/auth/login', host: ['{{base_url}}'], path: ['api','auth','login'] },
      },
    },

    {
      name: 'TC-01 — Agregar producto con stock al carrito',
      event: [{ listen: 'test', script: { type: 'text/javascript', exec: [
        'pm.test("TC-01: Status 201 Created", () => pm.response.to.have.status(201));',
        'pm.test("TC-01: Tiene cartId, items y total", () => {',
        '  const j = pm.response.json();',
        '  pm.expect(j).to.have.all.keys(["cartId","userId","items","total"]);',
        '  pm.expect(j.items).to.be.an("array").with.lengthOf.at.least(1);',
        '  pm.environment.set("item_id", j.items[0].itemId);',
        '  pm.environment.set("cart_id", j.cartId);',
        '});',
        'pm.test("TC-01: Item es prod_007 con cantidad 2", () => {',
        '  const item = pm.response.json().items.find(i => i.productId === "prod_007");',
        '  pm.expect(item).to.not.be.undefined;',
        '  pm.expect(item.quantity).to.equal(2);',
        '});',
        'pm.test("TC-01: Tiempo de respuesta < 500ms", () => pm.expect(pm.response.responseTime).to.be.below(500));',
      ]}}],
      request: {
        method: 'POST',
        header: [{ key: 'Content-Type', value: 'application/json' }, { key: 'Authorization', value: 'Bearer {{token}}' }],
        body: { mode: 'raw', raw: '{"productId":"prod_007","quantity":2}' },
        url: { raw: '{{base_url}}/api/cart/items', host: ['{{base_url}}'], path: ['api','cart','items'] },
      },
    },

    {
      name: 'TC-02 — Agregar producto sin stock suficiente',
      event: [{ listen: 'test', script: { type: 'text/javascript', exec: [
        'pm.test("TC-02: Status 422 Unprocessable Entity", () => pm.response.to.have.status(422));',
        'pm.test("TC-02: Mensaje menciona stock insuficiente", () => {',
        '  const j = pm.response.json();',
        '  pm.expect(j).to.have.property("error");',
        '  pm.expect(j.error.toLowerCase()).to.include("stock");',
        '});',
        'pm.test("TC-02: No contiene cartId", () => pm.expect(pm.response.json()).to.not.have.property("cartId"));',
      ]}}],
      request: {
        method: 'POST',
        header: [{ key: 'Content-Type', value: 'application/json' }, { key: 'Authorization', value: 'Bearer {{token}}' }],
        body: { mode: 'raw', raw: '{"productId":"prod_OUT_OF_STOCK","quantity":9999}' },
        url: { raw: '{{base_url}}/api/cart/items', host: ['{{base_url}}'], path: ['api','cart','items'] },
      },
    },

    {
      name: 'TC-03 — Modificar cantidad de un item',
      event: [{ listen: 'test', script: { type: 'text/javascript', exec: [
        'pm.test("TC-03: Status 200 OK", () => pm.response.to.have.status(200));',
        'pm.test("TC-03: Cantidad actualizada a 3", () => {',
        '  const item = pm.response.json().items.find(i => i.itemId === pm.environment.get("item_id"));',
        '  pm.expect(item).to.not.be.undefined;',
        '  pm.expect(item.quantity).to.equal(3);',
        '});',
        'pm.test("TC-03: Total recalculado (3 x 29999 = 89997)", () => {',
        '  pm.expect(pm.response.json().total).to.equal(89997);',
        '});',
      ]}}],
      request: {
        method: 'PATCH',
        header: [{ key: 'Content-Type', value: 'application/json' }, { key: 'Authorization', value: 'Bearer {{token}}' }],
        body: { mode: 'raw', raw: '{"quantity":3}' },
        url: { raw: '{{base_url}}/api/cart/items/{{item_id}}', host: ['{{base_url}}'], path: ['api','cart','items','{{item_id}}'] },
      },
    },

    {
      name: 'TC-04 — Eliminar item del carrito',
      event: [{ listen: 'test', script: { type: 'text/javascript', exec: [
        'pm.test("TC-04: Status 200 OK", () => pm.response.to.have.status(200));',
        'pm.test("TC-04: Item eliminado del carrito", () => {',
        '  const found = pm.response.json().items.find(i => i.itemId === pm.environment.get("item_id"));',
        '  pm.expect(found).to.be.undefined;',
        '});',
      ]}}],
      request: {
        method: 'DELETE',
        header: [{ key: 'Authorization', value: 'Bearer {{token}}' }],
        url: { raw: '{{base_url}}/api/cart/items/{{item_id}}', host: ['{{base_url}}'], path: ['api','cart','items','{{item_id}}'] },
      },
    },

    {
      name: 'TC-05 — Iniciar checkout con carrito valido',
      event: [
        { listen: 'prerequest', script: { type: 'text/javascript', exec: [
          'pm.sendRequest({',
          '  url: pm.environment.get("base_url") + "/api/cart/items",',
          '  method: "POST",',
          '  header: [{"key":"Content-Type","value":"application/json"},{"key":"Authorization","value":"Bearer "+pm.environment.get("token")}],',
          '  body: {mode:"raw",raw:"{\\"productId\\":\\"prod_007\\",\\"quantity\\":2}"}',
          '}, (err, res) => { console.log("Pre-TC-05 carrito:", res ? res.code() : err); });',
        ]}},
        { listen: 'test', script: { type: 'text/javascript', exec: [
          'pm.test("TC-05: Status 201 Created", () => pm.response.to.have.status(201));',
          'pm.test("TC-05: Tiene orderId, clientSecret, amount, currency, items", () => {',
          '  const j = pm.response.json();',
          '  pm.expect(j).to.have.all.keys(["orderId","paymentIntentId","clientSecret","amount","currency","items"]);',
          '  pm.expect(j.currency).to.equal("USD");',
          '  pm.expect(j.amount).to.be.a("number").and.above(0);',
          '  pm.environment.set("order_id", j.orderId);',
          '  pm.environment.set("payment_intent_id", j.paymentIntentId);',
          '});',
          'pm.test("TC-05: clientSecret con formato Stripe valido", () => {',
          '  pm.expect(pm.response.json().clientSecret).to.match(/^pi[a-zA-Z0-9]+_secret_[a-zA-Z0-9]+$/);',
          '});',
          'pm.test("TC-05: Tiempo < 1200ms", () => pm.expect(pm.response.responseTime).to.be.below(1200));',
        ]}},
      ],
      request: {
        method: 'POST',
        header: [{ key: 'Content-Type', value: 'application/json' }, { key: 'Authorization', value: 'Bearer {{token}}' }],
        body: { mode: 'raw', raw: '{"paymentMethodId":"pm_card_visa"}' },
        url: { raw: '{{base_url}}/api/checkout', host: ['{{base_url}}'], path: ['api','checkout'] },
      },
    },

    {
      name: 'TC-06 — Tarjeta rechazada [BUG: retorna 500 en lugar de 402]',
      event: [
        { listen: 'prerequest', script: { type: 'text/javascript', exec: [
          'pm.sendRequest({',
          '  url: pm.environment.get("base_url") + "/api/cart/items",',
          '  method: "POST",',
          '  header: [{"key":"Content-Type","value":"application/json"},{"key":"Authorization","value":"Bearer "+pm.environment.get("token")}],',
          '  body: {mode:"raw",raw:"{\\"productId\\":\\"prod_001\\",\\"quantity\\":1}"}',
          '}, (err, res) => { console.log("Pre-TC-06 carrito:", res ? res.code() : err); });',
        ]}},
        { listen: 'test', script: { type: 'text/javascript', exec: [
          'pm.test("TC-06: Retorna 500 [BUG confirmado - deberia ser 402]", () => {',
          '  pm.response.to.have.status(500);',
          '  console.warn("BUG TC-06: StripeCardError no manejado -> HTTP 500 en lugar de 402");',
          '});',
          'pm.test("TC-06: Body contiene mensaje de Stripe", () => {',
          '  pm.expect(pm.response.json().message).to.include("declined");',
          '});',
        ]}},
      ],
      request: {
        method: 'POST',
        header: [{ key: 'Content-Type', value: 'application/json' }, { key: 'Authorization', value: 'Bearer {{token}}' }],
        body: { mode: 'raw', raw: '{"paymentMethodId":"pm_card_visa_chargeDeclined"}' },
        url: { raw: '{{base_url}}/api/checkout', host: ['{{base_url}}'], path: ['api','checkout'] },
      },
    },

    {
      name: 'TC-07 — Confirmar orden via webhook de Stripe',
      event: [{ listen: 'test', script: { type: 'text/javascript', exec: [
        'pm.test("TC-07: Status 200 OK", () => pm.response.to.have.status(200));',
        'pm.test("TC-07: Orden pasa a estado PAID", () => {',
        '  const j = pm.response.json();',
        '  pm.expect(j.status).to.equal("PAID");',
        '  pm.expect(j.orderId).to.equal(pm.environment.get("order_id"));',
        '});',
      ]}}],
      request: {
        method: 'POST',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: { mode: 'raw', raw: '{"type":"payment_intent.succeeded","data":{"object":{"id":"{{payment_intent_id}}","status":"succeeded","amount":59998,"currency":"usd"}}}' },
        url: { raw: '{{base_url}}/api/checkout/confirm', host: ['{{base_url}}'], path: ['api','checkout','confirm'] },
      },
    },

    {
      name: 'TC-08 — Webhook duplicado [BUG CRITICO: sin idempotencia]',
      event: [{ listen: 'test', script: { type: 'text/javascript', exec: [
        'pm.test("TC-08: Status 200 (procesado de nuevo - BUG)", () => {',
        '  pm.response.to.have.status(200);',
        '});',
        'pm.test("TC-08: BUG - falta campo alreadyProcessed:true", () => {',
        '  const hasIt = pm.response.json().hasOwnProperty("alreadyProcessed");',
        '  pm.expect(hasIt).to.be.false;',
        '  console.error("BUG CRITICO TC-08: sin idempotencia -> orden procesada dos veces");',
        '});',
      ]}}],
      request: {
        method: 'POST',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: { mode: 'raw', raw: '{"type":"payment_intent.succeeded","data":{"object":{"id":"{{payment_intent_id}}","status":"succeeded","amount":59998,"currency":"usd"}}}' },
        url: { raw: '{{base_url}}/api/checkout/confirm', host: ['{{base_url}}'], path: ['api','checkout','confirm'] },
      },
    },

    {
      name: 'TC-09 — Checkout sin token de autenticacion',
      event: [{ listen: 'test', script: { type: 'text/javascript', exec: [
        'pm.test("TC-09: Status 401 Unauthorized", () => pm.response.to.have.status(401));',
        'pm.test("TC-09: Mensaje indica unauthorized", () => {',
        '  pm.expect(pm.response.json().message.toLowerCase()).to.include("unauthorized");',
        '});',
        'pm.test("TC-09: No expone stack ni SQL", () => {',
        '  const j = pm.response.json();',
        '  pm.expect(j).to.not.have.property("stack");',
        '  pm.expect(j).to.not.have.property("sql");',
        '});',
      ]}}],
      request: {
        method: 'POST',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: { mode: 'raw', raw: '{"paymentMethodId":"pm_card_visa"}' },
        url: { raw: '{{base_url}}/api/checkout', host: ['{{base_url}}'], path: ['api','checkout'] },
      },
    },

    {
      name: 'TC-10 — Verificar estado de orden post-pago',
      event: [{ listen: 'test', script: { type: 'text/javascript', exec: [
        'pm.test("TC-10: Status 200 OK", () => pm.response.to.have.status(200));',
        'pm.test("TC-10: Orden tiene estado PAID y campo paidAt", () => {',
        '  const j = pm.response.json();',
        '  pm.expect(j.status).to.equal("PAID");',
        '  pm.expect(j).to.have.property("paidAt");',
        '  pm.expect(j.items).to.be.an("array").with.lengthOf.at.least(1);',
        '});',
        'pm.test("TC-10: Tiempo de respuesta < 400ms", () => pm.expect(pm.response.responseTime).to.be.below(400));',
      ]}}],
      request: {
        method: 'GET',
        header: [{ key: 'Authorization', value: 'Bearer {{token}}' }],
        url: { raw: '{{base_url}}/api/orders/{{order_id}}', host: ['{{base_url}}'], path: ['api','orders','{{order_id}}'] },
      },
    },

    {
      name: 'TC-11 — Actualizar cantidad a 0 elimina el item',
      event: [
        { listen: 'prerequest', script: { type: 'text/javascript', exec: [
          'pm.sendRequest({',
          '  url: pm.environment.get("base_url") + "/api/cart/items",',
          '  method: "POST",',
          '  header: [{"key":"Content-Type","value":"application/json"},{"key":"Authorization","value":"Bearer "+pm.environment.get("token")}],',
          '  body: {mode:"raw",raw:"{\\"productId\\":\\"prod_012\\",\\"quantity\\":1}"}',
          '}, (err, res) => {',
          '  if (!err) {',
          '    const items = res.json().items;',
          '    const it = items.find(i => i.productId === "prod_012");',
          '    if (it) pm.environment.set("item_tc11", it.itemId);',
          '  }',
          '});',
        ]}},
        { listen: 'test', script: { type: 'text/javascript', exec: [
          'pm.test("TC-11: Status 200 OK", () => pm.response.to.have.status(200));',
          'pm.test("TC-11: Item prod_012 eliminado del carrito", () => {',
          '  const found = pm.response.json().items.find(i => i.productId === "prod_012");',
          '  pm.expect(found).to.be.undefined;',
          '});',
        ]}},
      ],
      request: {
        method: 'PATCH',
        header: [{ key: 'Content-Type', value: 'application/json' }, { key: 'Authorization', value: 'Bearer {{token}}' }],
        body: { mode: 'raw', raw: '{"quantity":0}' },
        url: { raw: '{{base_url}}/api/cart/items/{{item_tc11}}', host: ['{{base_url}}'], path: ['api','cart','items','{{item_tc11}}'] },
      },
    },

    {
      name: 'TC-12 — Checkout con carrito vacio',
      event: [
        { listen: 'prerequest', script: { type: 'text/javascript', exec: [
          'pm.sendRequest({',
          '  url: pm.environment.get("base_url") + "/api/cart",',
          '  method: "DELETE",',
          '  header: [{"key":"Authorization","value":"Bearer "+pm.environment.get("token")}]',
          '}, (err, res) => { console.log("Carrito vaciado:", res ? res.code() : err); });',
        ]}},
        { listen: 'test', script: { type: 'text/javascript', exec: [
          'pm.test("TC-12: Status 400 Bad Request", () => pm.response.to.have.status(400));',
          'pm.test("TC-12: Mensaje indica carrito vacio", () => {',
          '  pm.expect(pm.response.json().error.toLowerCase()).to.include("cart");',
          '});',
        ]}},
      ],
      request: {
        method: 'POST',
        header: [{ key: 'Content-Type', value: 'application/json' }, { key: 'Authorization', value: 'Bearer {{token}}' }],
        body: { mode: 'raw', raw: '{"paymentMethodId":"pm_card_visa"}' },
        url: { raw: '{{base_url}}/api/checkout', host: ['{{base_url}}'], path: ['api','checkout'] },
      },
    },

    {
      name: 'TC-14 — Verificar stock descontado de prod_007 tras la compra',
      event: [{ listen: 'test', script: { type: 'text/javascript', exec: [
        'pm.test("TC-14: Status 200 OK", () => pm.response.to.have.status(200));',
        'pm.test("TC-14: Stock = 196 (doble descuento por bug TC-08)", () => {',
        '  pm.expect(pm.response.json().stock).to.equal(196);',
        '});',
      ]}}],
      request: {
        method: 'GET',
        header: [{ key: 'Authorization', value: 'Bearer {{token}}' }],
        url: { raw: '{{base_url}}/api/products/prod_007/stock', host: ['{{base_url}}'], path: ['api','products','prod_007','stock'] },
      },
    },

  ],
};

// ════════════════════════════════════════════════════════════════════
// 3. ARRANCAR SERVIDOR + NEWMAN
// ════════════════════════════════════════════════════════════════════

const PORT = 3000;

const server = app.listen(PORT, () => {
  console.log('\n\x1b[36m' + '='.repeat(56) + '\x1b[0m');
  console.log('\x1b[36m  NEXUS SHOP - Mock Server activo en puerto ' + PORT + '\x1b[0m');
  console.log('\x1b[36m' + '='.repeat(56) + '\x1b[0m');
  console.log('\x1b[33m  Bugs activos:');
  console.log('    TC-06: /checkout retorna 500 con tarjeta rechazada');
  console.log('    TC-08: webhook sin idempotencia\x1b[0m');
  console.log('\n\x1b[90m  Trafico entrante:\x1b[0m');

  setTimeout(() => {
    newman.run({
      collection:  COLLECTION,
      environment: {
        id:     'nexus-env',
        name:   'NEXUS SHOP Local',
        values: [
          { key: 'base_url',          value: 'http://localhost:' + PORT, enabled: true },
          { key: 'token',             value: '', enabled: true },
          { key: 'cart_id',           value: '', enabled: true },
          { key: 'item_id',           value: '', enabled: true },
          { key: 'item_tc11',         value: '', enabled: true },
          { key: 'order_id',          value: '', enabled: true },
          { key: 'payment_intent_id', value: '', enabled: true },
        ],
      },
      reporters:    ['cli', 'htmlextra'],
      reporter: {
        htmlextra: {
          export:       path.join(__dirname, 'reports', 'postman_report.html'),
          title:        'NEXUS SHOP - Pruebas de Integracion',
          browserTitle: 'NEXUS SHOP Test Report',
        },
      },
      delayRequest: 300,
    }, (err, summary) => {
      server.close();
      if (err) { console.error('\nError fatal:', err); process.exit(1); }

      const s = summary.run.stats;
      console.log('\n\x1b[36m' + '='.repeat(56) + '\x1b[0m');
      console.log('\x1b[36m  RESUMEN FINAL\x1b[0m');
      console.log('\x1b[36m' + '='.repeat(56) + '\x1b[0m');
      console.log('  Requests  : ' + s.requests.total + ' ejecutados');
      console.log('  Assertions: \x1b[32m' + (s.assertions.total - s.assertions.failed) + ' pasadas\x1b[0m / ' + s.assertions.total + ' total');
      if (s.assertions.failed > 0)
        console.log('  \x1b[33m' + s.assertions.failed + ' fallidas (bugs documentados intencionalmente)\x1b[0m');
      console.log('\n  Reporte HTML: reports/postman_report.html\n');
      process.exit(0);
    });
  }, 300);
});
