export const ROUTES = {
  HOME: '/',
  ADMIN: '/admin',
  CATALOG: '/catalogo',
  CART: '/carrito',
  COMPARISON: '/comparar',
  PROMOTIONS: '/promociones',
  PRODUCT: (id) => `/productos/${encodeURIComponent(id)}`,
};
