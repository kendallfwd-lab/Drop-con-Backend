import PromotionsCarousel from '../components/PromotionsCarousel.jsx';
import { useCart } from '../../../app/providers/CartProvider.jsx';
export default function PromotionsPage() { const { data, reducedMotion, selectProduct } = useCart(); return <PromotionsCarousel catalog={data.catalog} settings={data.settings} onSelect={selectProduct} reducedMotion={reducedMotion} />; }
