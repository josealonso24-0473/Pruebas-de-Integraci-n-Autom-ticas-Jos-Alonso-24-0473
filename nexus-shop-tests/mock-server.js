/**
 * mock-server.js
 * Servidor mock de NEXUS SHOP para ejecutar las pruebas de integración
 * sin necesitar el backend real.
 *
 * Simula: Auth, Cart, Checkout, Orders, Products
 * Puerto: 3000
 */

const express = require('express');
const app = express();
app.use(express.json());

// ── Estado en memoria ────────────────────────────────────────────────────────
const db = {
  // Usuarios de prueba (los mismos que usan los scripts k6)
  users: [
    { id: 'user_01', email: 'buyer01@nexustest.com', password: 'Test@1234', name: 'Comprador 01' },
    { id: 'user_02', email: 'buyer02@nexustest.com', password: 'Test@1234', name: 'Comprador 02' },
    { id: 'user_03', email: 'buyer03@nexustest.com', password: 'Test@1234', name: 'Comprador 03' },
    { id: 'user_04', email: 'buyer04@nexustest.com', password: 'Test@1234', name: 'Comprador 04' },
    { id: 'user_05', email: 'buyer05@nexustest.com', password: 'Test@1234', name: 'Comprador 05' },
    { id: 'user_06', email: 'buyer06@nexustest.com', password: 'Test@1234', name: 'Comprador 06' },
    { id: 'user_07', email: 'buyer07@nexustest.com', password: 'Test@1234', name: 'Comprador 07' },
    { id: 'user_08', email: 'buyer08@nexustest.com', password: 'Test@1234', name: 'Comprador 08' },
    { id: 'user_09', email: 'buyer09@nexustest.com', password: 'Test@1234', name: 'Comprador 09' },
    { id: 'user_10', email: 'buyer10@nexustest.com', password: 'Test@1234', name: 'Comprador 10' },
  ],

  // Productos con stock
  products: {
    prod_001: { id: 'prod_001', name: 'Auriculares Bluetooth XZ-200',  price: 4999,  stock: 500 },
    prod_002: { id: 'prod_002', name: 'Teclado Mecánico NX-TKL',       price: 8900,  stock: 300 },
    prod_003: { id: 'prod_003', name: 'Mouse Gamer Precision Pro',      price: 3500,  stock: 400 },
    prod_007: { id: 'prod_007', name: 'Monitor LED 24" FHD NexView',   price: 29999, stock: 200 },
    prod_012: { id: 'prod_012', name: 'Webcam HD 1080p StreamCam',     price: 5999,  stock: 350 },
    prod_015: { id: 'prod_015', name: 'Hub USB-C 7 Puertos NexHub',    price: 2999,  stock: 600 },
    prod_021: { id: 'prod_021', name: 'SSD Externo 1TB NexDrive',      price: 11999, stock: 150 },
    prod_OUT_OF_STOCK: { id: 'prod_OUT_OF_STOCK', name: 'Producto sin stock', price: 100, stock: 0 },
  },

  // Tokens activos (simulan Redis)
  tokens: new Map(),

  // Carritos activos por usuario
  carts: new Map(),

  // Órdenes creadas
  orders: new Map(),

  // Payment intents procesados (para idempotencia — BUG: no se usa actualmente)
  processedPaymentIntents: new Set(),
};

// Contadores para IDs únicos
let orderCounter  = 1000;
let cartCounter   = 100;
let itemCounter   = 200;

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateToken(userId) {
  // JWT simulado: header.payload.signature (no válido criptográficamente, suficiente para mock)
  const payload = Buffer.from(JSON.stringify({ sub: userId, iat: Date.now() })).toString('base64');
  return `eyJhbGciOiJIUzI1NiJ9.${payload}.mock_signature_nexus`;
}

function getUserFromToken(req) {
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  return db.tokens.get(token) || null;
}

function requireAuth(req, res, next) {
  const user = getUserFromToken(req);
  if (!user) {
    return res.status(401).json({ message: 'Unauthorized: token inválido o ausente' });
  }
  req.user = user;
  next();
}

function getOrCreateCart(userId) {
  if (!db.carts.has(userId)) {
    db.carts.set(userId, {
      cartId: `cart_${++cartCounter}`,
      userId,
      items: [],
      total: 0,
    });
  }
  return db.carts.get(userId);
}

function recalculateTotal(cart) {
  cart.total = cart.items.reduce((sum, item) => {
    const product = db.products[item.productId];
    return sum + (product ? product.price * item.quantity : 0);
  }, 0);
}

// Simula latencia realista de microservicios
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Middleware de logging ────────────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const color = res.statusCode < 400 ? '\x1b[32m' : '\x1b[31m';
    console.log(`${color}${res.statusCode}\x1b[0m ${req.method.padEnd(6)} ${req.path.padEnd(35)} ${ms}ms`);
  });
  next();
});

// ── RUTAS: AUTH ───────────────────────────────────────────────────────────────

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  await delay(50 + Math.random() * 100);

  const { email, password } = req.body || {};
  const user = db.users.find(u => u.email === email && u.password === password);

  if (!user) {
    return res.status(401).json({ message: 'Credenciales inválidas' });
  }

  const token = generateToken(user.id);
  db.tokens.set(token, user);

  res.status(200).json({
    access_token:  token,
    refresh_token: `refresh_${token}`,
    user: { id: user.id, email: user.email, name: user.name },
  });
});

// POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
  await delay(100 + Math.random() * 200);

  const { email, name, password } = req.body || {};
  if (!email || !name || !password) {
    return res.status(400).json({ error: 'email, name y password son requeridos' });
  }
  if (db.users.find(u => u.email === email)) {
    return res.status(409).json({ error: 'El email ya está registrado' });
  }

  const newUser = { id: `user_${Date.now()}`, email, name, password };
  db.users.push(newUser);

  res.status(201).json({ message: 'Usuario creado exitosamente', userId: newUser.id });
});

// GET /api/auth/me
app.get('/api/auth/me', requireAuth, async (req, res) => {
  await delay(30);
  res.status(200).json({ id: req.user.id, email: req.user.email, name: req.user.name });
});

// ── RUTAS: CART ───────────────────────────────────────────────────────────────

// GET /api/cart
app.get('/api/cart', requireAuth, async (req, res) => {
  await delay(40 + Math.random() * 60);

  const cart = getOrCreateCart(req.user.id);
  recalculateTotal(cart);
  res.status(200).json(cart);
});

// POST /api/cart/items
app.post('/api/cart/items', requireAuth, async (req, res) => {
  await delay(80 + Math.random() * 120);  // Simula llamada a Product Service

  const { productId, quantity = 1 } = req.body || {};
  const product = db.products[productId];

  if (!product) {
    return res.status(404).json({ error: `Producto ${productId} no encontrado` });
  }
  if (product.stock < quantity) {
    return res.status(422).json({
      error: `Insufficient stock: solo hay ${product.stock} unidades disponibles de "${product.name}"`,
    });
  }

  const cart = getOrCreateCart(req.user.id);
  const existing = cart.items.find(i => i.productId === productId);

  if (existing) {
    existing.quantity += quantity;
  } else {
    cart.items.push({
      itemId:    `item_${++itemCounter}`,
      productId,
      name:      product.name,
      price:     product.price,
      quantity,
    });
  }

  recalculateTotal(cart);
  res.status(201).json(cart);
});

// PATCH /api/cart/items/:itemId
app.patch('/api/cart/items/:itemId', requireAuth, async (req, res) => {
  await delay(60 + Math.random() * 80);

  const { quantity } = req.body || {};
  const cart  = getOrCreateCart(req.user.id);
  const index = cart.items.findIndex(i => i.itemId === req.params.itemId);

  if (index === -1) {
    return res.status(404).json({ error: 'Item no encontrado en el carrito' });
  }

  if (quantity === 0 || quantity === undefined) {
    cart.items.splice(index, 1);  // TC-11: cantidad 0 elimina el item
  } else {
    cart.items[index].quantity = quantity;
  }

  recalculateTotal(cart);
  res.status(200).json(cart);
});

// DELETE /api/cart/items/:itemId
app.delete('/api/cart/items/:itemId', requireAuth, async (req, res) => {
  await delay(50);

  const cart  = getOrCreateCart(req.user.id);
  const index = cart.items.findIndex(i => i.itemId === req.params.itemId);

  if (index === -1) {
    return res.status(404).json({ error: 'Item no encontrado' });
  }

  cart.items.splice(index, 1);
  recalculateTotal(cart);
  res.status(200).json(cart);
});

// ── RUTAS: CHECKOUT ───────────────────────────────────────────────────────────

// POST /api/checkout
app.post('/api/checkout', requireAuth, async (req, res) => {
  // Simula latencia real: Auth + Product (stock check) + Stripe API
  await delay(300 + Math.random() * 400);

  const { paymentMethodId } = req.body || {};
  const cart = getOrCreateCart(req.user.id);

  // TC-12: carrito vacío
  if (!cart.items || cart.items.length === 0) {
    return res.status(400).json({ error: 'El cart está vacío. Agrega productos antes de hacer checkout.' });
  }

  // TC-06: tarjeta rechazada — BUG SIMULADO (retorna 500 en lugar de 402)
  if (paymentMethodId === 'pm_card_visa_chargeDeclined' ||
      paymentMethodId === 'pm_card_chargeDeclinedInsufficientFunds') {
    // ⚠️ BUG INTENCIONAL: debería retornar 402, retorna 500
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'StripeCardError: Your card was declined.',
      // En producción real este stack no debería exponerse:
      hint: 'BUG: Este endpoint debería retornar HTTP 402 con mensaje amigable',
    });
  }

  recalculateTotal(cart);

  const orderId         = `order_${++orderCounter}`;
  const paymentIntentId = `pi_mock_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const order = {
    orderId,
    paymentIntentId,
    clientSecret: `${paymentIntentId}_secret_mock${Math.random().toString(36).slice(2)}`,
    userId:   req.user.id,
    items:    [...cart.items],
    amount:   cart.total,
    currency: 'USD',
    status:   'PENDING',
    createdAt: new Date().toISOString(),
  };

  db.orders.set(orderId, order);

  res.status(201).json({
    orderId:          order.orderId,
    paymentIntentId:  order.paymentIntentId,
    clientSecret:     order.clientSecret,
    amount:           order.amount,
    currency:         order.currency,
    items:            order.items,
  });
});

// POST /api/checkout/confirm  (Stripe webhook)
app.post('/api/checkout/confirm', async (req, res) => {
  await delay(150 + Math.random() * 200);

  const event = req.body || {};
  const piId  = event?.data?.object?.id;

  if (!piId) {
    return res.status(400).json({ error: 'Payload de webhook inválido' });
  }

  // Buscar la orden correspondiente
  let order = null;
  for (const [, o] of db.orders) {
    if (o.paymentIntentId === piId) { order = o; break; }
  }

  if (!order) {
    return res.status(404).json({ error: 'Orden no encontrada para este payment_intent' });
  }

  // ⚠️ BUG INTENCIONAL TC-08: falta verificar si ya fue procesado
  // Línea que DEBERÍA estar aquí (comentada para simular el bug):
  // if (db.processedPaymentIntents.has(piId)) {
  //   return res.status(200).json({ alreadyProcessed: true, orderId: order.orderId });
  // }

  // Sin la verificación, procesa de nuevo (genera duplicado)
  db.processedPaymentIntents.add(piId);  // Se agrega pero nunca se verifica

  // Descontar stock
  order.items.forEach(item => {
    const product = db.products[item.productId];
    if (product) product.stock = Math.max(0, product.stock - item.quantity);
  });

  order.status    = 'PAID';
  order.paidAt    = new Date().toISOString();

  // Limpiar carrito del usuario
  db.carts.delete(order.userId);

  res.status(200).json({
    orderId: order.orderId,
    status:  'PAID',
    // ⚠️ BUG: falta `alreadyProcessed: true` cuando es un reenvío
  });
});

// ── RUTAS: ORDERS ─────────────────────────────────────────────────────────────

// GET /api/orders/:orderId
app.get('/api/orders/:orderId', requireAuth, async (req, res) => {
  await delay(40 + Math.random() * 60);

  const order = db.orders.get(req.params.orderId);
  if (!order || order.userId !== req.user.id) {
    return res.status(404).json({ error: 'Orden no encontrada' });
  }

  res.status(200).json(order);
});

// ── RUTAS: PRODUCTS ───────────────────────────────────────────────────────────

// GET /api/products/:productId/stock
app.get('/api/products/:productId/stock', requireAuth, async (req, res) => {
  await delay(30);

  const product = db.products[req.params.productId];
  if (!product) {
    return res.status(404).json({ error: 'Producto no encontrado' });
  }

  res.status(200).json({ productId: product.id, stock: product.stock });
});

// ── HEALTH CHECK ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.status(200).json({
    status:    'ok',
    service:   'NEXUS SHOP Mock Server',
    version:   '3.1.0-mock',
    timestamp: new Date().toISOString(),
    endpoints: [
      'POST /api/auth/login',
      'POST /api/auth/register',
      'GET  /api/auth/me',
      'GET  /api/cart',
      'POST /api/cart/items',
      'PATCH /api/cart/items/:id',
      'DELETE /api/cart/items/:id',
      'POST /api/checkout',
      'POST /api/checkout/confirm',
      'GET  /api/orders/:id',
      'GET  /api/products/:id/stock',
    ],
  });
});

// ── INICIO ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('\n\x1b[36m╔══════════════════════════════════════════════╗\x1b[0m');
  console.log('\x1b[36m║     NEXUS SHOP — Mock Server arriba ✅        ║\x1b[0m');
  console.log('\x1b[36m╚══════════════════════════════════════════════╝\x1b[0m');
  console.log(`\n  URL:     http://localhost:${PORT}`);
  console.log(`  Health:  http://localhost:${PORT}/health`);
  console.log('\n  Bugs simulados activos:');
  console.log('  ⚠️  TC-06: /api/checkout retorna 500 con tarjeta rechazada');
  console.log('  ⚠️  TC-08: /api/checkout/confirm no verifica idempotencia');
  console.log('\n  \x1b[90mCtrl+C para detener\x1b[0m\n');
});
