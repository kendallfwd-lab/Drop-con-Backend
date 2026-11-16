import CartDrawer from '../components/CartDrawer.jsx';
import { useNavigate } from 'react-router';
import { useCart } from '../../../app/providers/CartProvider.jsx';
import { ROUTES } from '../../../routes/routePaths.js';
export default function CartPage() { const navigate = useNavigate(); const { data, cart, handleUpdateCartQuantity, removeFromCart, editCartProduct } = useCart(); return <CartDrawer open cart={cart} settings={data.settings} onClose={() => navigate(ROUTES.HOME)} onUpdateQuantity={handleUpdateCartQuantity} onRemove={removeFromCart} onEditProduct={editCartProduct} />; }
