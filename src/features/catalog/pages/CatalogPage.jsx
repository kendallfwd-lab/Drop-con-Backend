import Catalog from '../components/Catalog.jsx';
import { useCart } from '../../../app/providers/CartProvider.jsx';
export default function CatalogPage() { const { data, selectedId, reducedMotion, selectProduct } = useCart(); return <Catalog catalog={data.catalog} selectedId={selectedId} onSelect={selectProduct} reducedMotion={reducedMotion} />; }
