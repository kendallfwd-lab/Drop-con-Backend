import { useEffect, useRef, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { Brand, WhatsAppLink } from '../common/Shared.jsx';
import { ROUTES } from '../../routes/routePaths.js';
import useScrollDirection from '../../hooks/useScrollDirection.js';

const sectionRoutes = { inicio: ROUTES.HOME, productos: ROUTES.CATALOG, comparar: ROUTES.COMPARISON, promociones: ROUTES.PROMOTIONS };

export default function Header({ settings, sections, cartCount, onOpenCart, cartButtonRef }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const { pathname } = useLocation();
  const { isVisible, show } = useScrollDirection({ disabled: open });

  useEffect(() => {
    show();
  }, [pathname, show]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        menuRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return <header
    className={`site-header ${isVisible ? 'site-header--visible' : 'site-header--hidden'}`}
    onFocusCapture={show}
  >
    <div className="container site-header__inner">
      <Link to={ROUTES.ADMIN} className="brand-link" aria-label="Ir al inicio administrativo" onClick={() => setOpen(false)}><Brand /></Link>
      <nav className={`primary-nav ${open ? 'primary-nav--open' : ''}`} id="main-navigation" aria-label="Navegación principal">
        {sections.filter((item) => item.enabled).map((item) => <Link key={item.id} to={sectionRoutes[item.id] || ROUTES.HOME} onClick={() => setOpen(false)}>{item.label}</Link>)}
      </nav>
      <div className="site-header__actions">
        <WhatsAppLink phone={settings.whatsappPhone} className="button button--whatsapp header-whatsapp"><span className="header-whatsapp__long">Escríbenos</span><span className="header-whatsapp__short">WhatsApp</span></WhatsAppLink>
        <button ref={cartButtonRef} className="header-cart" type="button" onClick={onOpenCart} aria-label={`Abrir carrito, ${cartCount} ${cartCount === 1 ? 'producto' : 'productos'}`}>
          <img className="header-cart__image" src="/images/cart-floating.png" alt="" aria-hidden="true" />
          <span className={cartCount > 0 ? 'header-cart__count header-cart__count--visible' : 'header-cart__count'} aria-hidden="true">{cartCount}</span>
        </button>
        <button ref={menuRef} className="menu-toggle" type="button" aria-label={open ? 'Cerrar menú' : 'Abrir menú'} aria-controls="main-navigation" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{open ? <X size={22} /> : <Menu size={22} />}</button>
      </div>
    </div>
  </header>;
}
