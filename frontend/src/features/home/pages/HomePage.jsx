import Hero from '../components/Hero.jsx';
import Catalog from '../../catalog/components/Catalog.jsx';
import ProductDetail from '../../catalog/components/ProductDetail.jsx';
import Comparison from '../../comparison/components/Comparison.jsx';
import PromotionsCarousel from '../../promotions/components/PromotionsCarousel.jsx';
import { useCart } from '../../../app/providers/CartProvider.jsx';

export default function HomePage() {
  const { data, loadState, selectedId, tab, reducedMotion, setTab, selectProduct, handleAddToCart } = useCart();
  const product = data.catalog.find(selectedId) || data.catalog.featured[0];
  return <>
    {loadState === 'loading' && <div className="api-loading" role="status">Actualizando catálogo…</div>}
    {loadState === 'fallback' && <div className="api-notice" role="status">Vista de respaldo: el catálogo local no está conectado. Los datos mostrados proceden de la copia incluida en la web.</div>}
    <Hero settings={data.settings} reducedMotion={reducedMotion} />
    <Catalog catalog={data.catalog} selectedId={product.id} onSelect={selectProduct} reducedMotion={reducedMotion} />
    <ProductDetail product={product} settings={data.settings} tab={tab} onTabChange={setTab} reducedMotion={reducedMotion} onAddToCart={handleAddToCart} />
    <Comparison catalog={data.catalog} onSelect={selectProduct} reducedMotion={reducedMotion} />
    <PromotionsCarousel catalog={data.catalog} settings={data.settings} onSelect={selectProduct} reducedMotion={reducedMotion} />
  </>;
}
