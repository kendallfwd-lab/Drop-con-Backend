import { BrowserRouter } from 'react-router';
import { CartProvider } from './providers/CartProvider.jsx';
import AppRoutes from '../routes/AppRoutes.jsx';

export { default as Hero } from '../features/home/components/Hero.jsx';

export default function App() {
  return <BrowserRouter><CartProvider><AppRoutes /></CartProvider></BrowserRouter>;
}
