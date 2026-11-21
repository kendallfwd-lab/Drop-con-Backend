import { Link } from 'react-router';
import { ROUTES } from '../routes/routePaths.js';
export default function NotFoundPage() { return <section className="container" style={{ padding: '8rem 0' }}><h1>Página no encontrada</h1><p>La ruta que buscas no existe.</p><Link className="button" to={ROUTES.HOME}>Volver al inicio</Link></section>; }
