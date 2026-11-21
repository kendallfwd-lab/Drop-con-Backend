import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateOrderTotals } from './pricing.js';

test('calculates the same qualifying fixed promotions as the storefront', () => {
  const totals = calculateOrderTotals([
    { productId: 'airpods-pro-3', category: 'Audio', unitPrice: 30000, quantity: 1 },
    { productId: 'airpods-pro-2', category: 'Audio', unitPrice: 24000, quantity: 1 },
    { productId: 'estuches-iphone', category: 'Estuches', unitPrice: 6000, quantity: 2 },
  ]);
  assert.deepEqual(totals, { subtotalCRC: 66000, discountCRC: 7000, totalCRC: 59000 });
});

test('caps discounts at the server-calculated subtotal', () => {
  const totals = calculateOrderTotals([
    { productId: 'apple-pencil', category: 'Accesorios', unitPrice: 1000, quantity: 2 },
  ]);
  assert.deepEqual(totals, { subtotalCRC: 2000, discountCRC: 2000, totalCRC: 0 });
});
