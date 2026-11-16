import Comparison from '../components/Comparison.jsx';
import { useCart } from '../../../app/providers/CartProvider.jsx';
export default function ComparisonPage() { const { data, reducedMotion, selectProduct } = useCart(); return <Comparison catalog={data.catalog} onSelect={selectProduct} reducedMotion={reducedMotion} />; }
