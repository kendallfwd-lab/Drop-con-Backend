import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { Check } from 'lucide-react';
import { ProductService } from '../../features/catalog/catalog.js';
import {
  addCartItem, cartItemCount, cartDiscountBreakdown, createCartItem, readStoredCart, removeCartItem, updateCartItemQuantity,
} from '../../features/cart/cart.js';
import { getFallbackData } from '../../data/fallback.js';

const CartContext = createContext(null);
const service = new ProductService();

function newlyAppliedDiscountNotice(previousCart, nextCart) {
  const previousDiscountIds = new Set(cartDiscountBreakdown(previousCart).map((discount) => discount.id));
  return cartDiscountBreakdown(nextCart)
    .filter((discount) => !previousDiscountIds.has(discount.id))
    .map((discount) => discount.message)
    .join(' ');
}

function usePageScroller(reducedMotion) {
  const animationRef = useRef(null);
  const cancelScroll = useCallback(() => {
    if (animationRef.current != null) window.cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
  }, []);
  const scrollToElement = useCallback((element) => {
    if (!element) return;
    cancelScroll();
    const headerOffset = window.innerWidth <= 767 ? 76 : 88;
    const start = window.scrollY;
    const destination = Math.max(0, element.getBoundingClientRect().top + start - headerOffset);
    const distance = destination - start;
    if (reducedMotion || Math.abs(distance) < 2) {
      window.scrollTo({ top: destination, behavior: 'auto' });
      return;
    }
    const duration = Math.min(950, Math.max(650, Math.abs(distance) * 0.35));
    const startedAt = performance.now();
    const animate = (now) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      const eased = progress < 0.5 ? 2 * progress * progress : 1 - ((-2 * progress + 2) ** 2) / 2;
      window.scrollTo({ top: start + distance * eased, behavior: 'auto' });
      if (progress < 1) animationRef.current = window.requestAnimationFrame(animate);
      else animationRef.current = null;
    };
    animationRef.current = window.requestAnimationFrame(animate);
  }, [cancelScroll, reducedMotion]);
  useEffect(() => () => cancelScroll(), [cancelScroll]);
  return scrollToElement;
}

export function CartProvider({ children }) {
  const [data, setData] = useState(() => getFallbackData());
  const [loadState, setLoadState] = useState('loading');
  const [selectedId, setSelectedId] = useState(() => new URLSearchParams(window.location.search).get('producto') || 'airpods-pro-3');
  const [tab, setTab] = useState(0);
  const [cart, setCart] = useState(() => readStoredCart(window.localStorage));
  const [cartOpen, setCartOpen] = useState(false);
  const [cartNotice, setCartNotice] = useState('');
  const cartButtonRef = useRef(null);
  const reducedMotion = useReducedMotion();
  const scrollToElement = usePageScroller(reducedMotion);

  useEffect(() => {
    if (!import.meta.env.DEV) { setLoadState('ready'); return undefined; }
    const controller = new AbortController();
    service.load(controller.signal).then((next) => { setData(next); setLoadState('ready'); })
      .catch((error) => { if (error.name !== 'AbortError') setLoadState('fallback'); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    setCart((current) => {
      let changed = false;
      const hydrated = current.map((item) => {
        if (item.category) return item;
        const storedProduct = data.catalog.find(item.productId);
        if (!storedProduct?.category) return item;
        changed = true;
        return { ...item, category: storedProduct.category };
      });
      return changed ? hydrated : current;
    });
  }, [data.catalog]);

  useEffect(() => {
    try { window.localStorage.setItem('drop-zone-cart', JSON.stringify(cart)); } catch { /* storage is optional */ }
  }, [cart]);

  useEffect(() => {
    if (!cartNotice) return undefined;
    const timeoutId = window.setTimeout(() => setCartNotice(''), 2400);
    return () => window.clearTimeout(timeoutId);
  }, [cartNotice]);

  useEffect(() => {
    const onPopState = () => {
      setSelectedId(new URLSearchParams(window.location.search).get('producto') || 'airpods-pro-3');
      setTab(0);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const selectProduct = useCallback((id) => {
    setSelectedId(id);
    setTab(0);
    const url = new URL(window.location.href);
    url.searchParams.set('producto', id);
    window.history.pushState({}, '', url);
    requestAnimationFrame(() => scrollToElement(document.getElementById('caracteristicas')));
  }, [scrollToElement]);

  const handleAddToCart = useCallback((selectedProduct, selections, quantity) => {
    const item = createCartItem(selectedProduct, selections, quantity);
    const nextCart = addCartItem(cart, item);
    setCart(nextCart);
    setCartNotice(newlyAppliedDiscountNotice(cart, nextCart) || `${item.name} agregado al carrito`);
  }, [cart]);

  const handleUpdateCartQuantity = useCallback((key, quantity) => {
    const nextCart = updateCartItemQuantity(cart, key, quantity);
    const discountNotice = newlyAppliedDiscountNotice(cart, nextCart);
    setCart(nextCart);
    if (discountNotice) setCartNotice(discountNotice);
  }, [cart]);

  const value = useMemo(() => ({
    data, loadState, selectedId, tab, cart, cartOpen, cartNotice, reducedMotion, cartButtonRef,
    numberOfCartItems: cartItemCount(cart), scrollToElement, setTab, setCartOpen,
    selectProduct, handleAddToCart, handleUpdateCartQuantity,
    closeCart: () => setCartOpen(false),
    removeFromCart: (key) => setCart((current) => removeCartItem(current, key)),
    editCartProduct: (id) => { setCartOpen(false); selectProduct(id); },
  }), [data, loadState, selectedId, tab, cart, cartOpen, cartNotice, reducedMotion, scrollToElement, selectProduct, handleAddToCart, handleUpdateCartQuantity]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart debe utilizarse dentro de CartProvider');
  return context;
}

export function CartNotice() {
  const { cartNotice } = useCart();
  return cartNotice ? <div className="cart-toast" role="status"><Check size={16} aria-hidden="true" />{cartNotice}</div> : null;
}
