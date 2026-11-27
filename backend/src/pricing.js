const discounts = [
  { applies: (items) => items.filter((item) => item.category === 'Audio').reduce((count, item) => count + item.quantity, 0) >= 2, amount: 5000 },
  { applies: (items) => items.filter((item) => item.productId === 'estuches-airpods').reduce((count, item) => count + item.quantity, 0) >= 2, amount: 1500 },
  { applies: (items) => items.filter((item) => item.productId === 'estuches-iphone').reduce((count, item) => count + item.quantity, 0) >= 2, amount: 2000 },
  { applies: (items) => items.filter((item) => item.productId === 'apple-pencil').reduce((count, item) => count + item.quantity, 0) >= 2, amount: 3000 },
];

export function calculateOrderTotals(items, promotions = []) {
  const subtotalCRC = items.reduce((total, item) => total + item.unitPrice * item.quantity, 0);
  const configuredDiscounts = promotions
    .filter((promotion) => promotion.active !== false)
    .filter((promotion) => !promotion.product_id || items.some((item) => item.productId === promotion.product_id))
    .filter((promotion) => items.reduce((count, item) => count + (!promotion.product_id || item.productId === promotion.product_id ? item.quantity : 0), 0) >= Number(promotion.minimum_quantity || 1))
    .map((promotion) => Number(promotion.discount_crc) || 0);
  const discountCRC = Math.min(
    subtotalCRC,
    discounts.reduce((total, discount) => total + (discount.applies(items) ? discount.amount : 0), 0) + configuredDiscounts.reduce((total, discount) => total + discount, 0),
  );
  return { subtotalCRC, discountCRC, totalCRC: subtotalCRC - discountCRC };
}
