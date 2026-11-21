const discounts = [
  { applies: (items) => items.filter((item) => item.category === 'Audio').reduce((count, item) => count + item.quantity, 0) >= 2, amount: 5000 },
  { applies: (items) => items.filter((item) => item.productId === 'estuches-airpods').reduce((count, item) => count + item.quantity, 0) >= 2, amount: 1500 },
  { applies: (items) => items.filter((item) => item.productId === 'estuches-iphone').reduce((count, item) => count + item.quantity, 0) >= 2, amount: 2000 },
  { applies: (items) => items.filter((item) => item.productId === 'apple-pencil').reduce((count, item) => count + item.quantity, 0) >= 2, amount: 3000 },
];

export function calculateOrderTotals(items) {
  const subtotalCRC = items.reduce((total, item) => total + item.unitPrice * item.quantity, 0);
  const discountCRC = Math.min(
    subtotalCRC,
    discounts.reduce((total, discount) => total + (discount.applies(items) ? discount.amount : 0), 0),
  );
  return { subtotalCRC, discountCRC, totalCRC: subtotalCRC - discountCRC };
}
