import { useEffect } from 'react';
import { useParams } from 'react-router';
import ProductDetail from '../components/ProductDetail.jsx';
import { useCart } from '../../../app/providers/CartProvider.jsx';
export default function ProductPage() { const { productId } = useParams(); const { data, setTab, reducedMotion, handleAddToCart, selectProduct } = useCart(); const product = data.catalog.find(decodeURIComponent(productId)) || data.catalog.featured[0]; useEffect(() => { selectProduct(product.id); }, [product.id, selectProduct]); return <ProductDetail product={product} settings={data.settings} tab={0} onTabChange={setTab} reducedMotion={reducedMotion} onAddToCart={handleAddToCart} />; }
