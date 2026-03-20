/**
 * config/products.js
 * IDs y datos de productos pre-cargados en la base de datos de pruebas.
 * Estos productos tienen stock garantizado para los escenarios de carga.
 */

export const PRODUCTS = [
  { id: 'prod_001', name: 'Auriculares Bluetooth XZ-200',  price: 4999, stock: 500 },
  { id: 'prod_002', name: 'Teclado Mecánico NX-TKL',       price: 8900, stock: 300 },
  { id: 'prod_003', name: 'Mouse Gamer Precision Pro',      price: 3500, stock: 400 },
  { id: 'prod_007', name: 'Monitor LED 24" FHD NexView',   price: 29999, stock: 200 },
  { id: 'prod_012', name: 'Webcam HD 1080p StreamCam',     price: 5999, stock: 350 },
  { id: 'prod_015', name: 'Hub USB-C 7 Puertos NexHub',   price: 2999, stock: 600 },
  { id: 'prod_021', name: 'SSD Externo 1TB NexDrive',      price: 11999, stock: 150 },
];

/**
 * Retorna un producto aleatorio de la lista.
 */
export function randomProduct() {
  return PRODUCTS[Math.floor(Math.random() * PRODUCTS.length)];
}

/**
 * IDs de tarjetas de prueba de Stripe Sandbox.
 * Ref: https://stripe.com/docs/testing#cards
 */
export const STRIPE_CARDS = {
  visa_ok:       'pm_card_visa',           // Aprobada siempre
  mastercard_ok: 'pm_card_mastercard',     // Aprobada siempre
  declined:      'pm_card_visa_chargeDeclined',  // Rechazada — para TC-06
  insufficient:  'pm_card_chargeDeclinedInsufficientFunds',
};
