import { Routes, Route } from 'react-router';
import SiteLayout from '../components/layout/SiteLayout.jsx';
import HomePage from '../features/home/pages/HomePage.jsx';
import CatalogPage from '../features/catalog/pages/CatalogPage.jsx';
import ProductPage from '../features/catalog/pages/ProductPage.jsx';
import CartPage from '../features/cart/pages/CartPage.jsx';
import ComparisonPage from '../features/comparison/pages/ComparisonPage.jsx';
import PromotionsPage from '../features/promotions/pages/PromotionsPage.jsx';
import NotFoundPage from '../pages/NotFoundPage.jsx';
import ScrollToTop from './ScrollToTop.jsx';
export default function AppRoutes() { return <><ScrollToTop /><Routes><Route element={<SiteLayout />}><Route index element={<HomePage />} /><Route path="catalogo" element={<CatalogPage />} /><Route path="productos/:productId" element={<ProductPage />} /><Route path="carrito" element={<CartPage />} /><Route path="comparar" element={<ComparisonPage />} /><Route path="promociones" element={<PromotionsPage />} /><Route path="*" element={<NotFoundPage />} /></Route></Routes></>; }
