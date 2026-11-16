import { Outlet } from 'react-router';
import { motion, useScroll, useSpring } from 'motion/react';
import Header from './Header.jsx';
import Footer from './Footer.jsx';
import CartDrawer from '../../features/cart/components/CartDrawer.jsx';
import { CartNotice, useCart } from '../../app/providers/CartProvider.jsx';

function ScrollProgress({ reducedMotion }) {
  const { scrollYProgress } = useScroll();
  const smoothProgress = useSpring(scrollYProgress, { stiffness: 120, damping: 24, mass: 0.25 });
  return <motion.div className="scroll-progress" style={{ scaleX: reducedMotion ? scrollYProgress : smoothProgress }} aria-hidden="true" />;
}

export default function SiteLayout() {
  const { data, reducedMotion, numberOfCartItems, setCartOpen, cartButtonRef, cartOpen, cart, closeCart, handleUpdateCartQuantity, removeFromCart, editCartProduct } = useCart();
  return <>
    <ScrollProgress reducedMotion={reducedMotion} />
    <a className="skip-link" href="#contenido">Saltar al contenido</a>
    <Header settings={data.settings} sections={data.siteSections} cartCount={numberOfCartItems} onOpenCart={() => setCartOpen(true)} cartButtonRef={cartButtonRef} />
    <main id="contenido"><Outlet /></main>
    <Footer settings={data.settings} />
    <CartDrawer open={cartOpen} cart={cart} settings={data.settings} onClose={closeCart} onUpdateQuantity={handleUpdateCartQuantity} onRemove={removeFromCart} onEditProduct={editCartProduct} triggerRef={cartButtonRef} />
    <CartNotice />
  </>;
}
