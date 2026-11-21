import { useCart } from '../app/providers/CartProvider.jsx';
export default function useCatalog() { const { data, loadState } = useCart(); return { ...data, loadState }; }
