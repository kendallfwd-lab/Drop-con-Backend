export const ROUTES = {
  HOME: '/',
  CATALOG: '/catalogo',
  CART: '/carrito',
  COMPARISON: '/comparar',
  PROMOTIONS: '/promociones',
  PRODUCT: (id) => `/productos/${encodeURIComponent(id)}`,
};
