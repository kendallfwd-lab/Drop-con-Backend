import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Brand } from '../../components/common/Shared.jsx';
import { formatCurrency } from '../../utils/formatCurrency.js';
import { useCart } from '../../app/providers/CartProvider.jsx';
import StaffDesk from './StaffDesk.jsx';
import './admin.css';

const blank = {
  id: '', name: '', category: '', priceCRC: 0, image: '', shortDescription: '',
  availability: 'Consultar', featured: false, active: false, displayOrder: 0,
};

async function api(path, method = 'GET', body) {
  const response = await fetch(`/api/admin${path}`, {
    method,
    ...(body === undefined ? {} : {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  });
  if (response.status === 204) return undefined;
  const data = await response.json().catch(() => null);
  if (!response.ok || data === null) {
    throw Object.assign(new Error(data?.error || 'No se pudo conectar con el servicio administrativo.'), { status: response.status });
  }
  return data;
}

export default function AdminPage() {
  const { data: { settings } } = useCart();
  const [session, setSession] = useState(undefined);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let current = true;
    api('/session').then((user) => { if (current) setSession(user); }).catch((failure) => {
      if (!current) return;
      setSession(null);
      if (failure.status !== 401) setError(failure.message);
    });
    return () => { current = false; };
  }, []);

  async function authenticate(event) {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    setError('');
    try { setSession(await api('/login', 'POST', body)); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }

  async function signOut() {
    setBusy(true);
    setError('');
    try {
      await api('/logout', 'POST');
      setSession(null);
    } catch (failure) {
      handleError(failure);
    } finally {
      setBusy(false);
    }
  }

  function handleError(failure) {
    if (failure.status === 401) setSession(null);
    setError(failure.message);
  }

  return <main className={`dz-admin ${session?.role === 'admin' ? 'is-admin' : ''} ${session?.role === 'worker' ? 'is-worker' : ''}`}>
    {session && <header className="dz-admin__top">
      <Brand />
      <Link to="/">Ver tienda</Link>
      <button type="button" onClick={signOut} disabled={busy}>Cerrar sesión</button>
    </header>}
    {error && <p className="dz-admin__error" role="alert">{error}</p>}
    {session === undefined && <p role="status">Verificando sesión…</p>}
    {session === null && <form className="dz-admin__login dz-admin__card" onSubmit={authenticate}>
      <h1>Acceso del equipo de {settings.brand}</h1>
      <label>Correo electrónico<input autoComplete="username" name="email" type="email" maxLength={254} required /></label>
      <label>Contraseña<input autoComplete="current-password" name="password" type="password" maxLength={128} required /></label>
      <button className="dz-admin__primary" disabled={busy}>{busy ? 'Ingresando…' : 'Iniciar sesión'}</button>
    </form>}
    {session && <StaffDesk session={session} api={api} reportError={handleError} clearError={() => setError('')}>
      <Dashboard brand={settings.brand} email={session.email} reportError={handleError} clearError={() => setError('')} />
    </StaffDesk>}
  </main>;
}

function Dashboard({ brand, email, reportError, clearError }) {
  const [tab, setTab] = useState('products');
  const [products, setProducts] = useState(null);
  const [inventory, setInventory] = useState(null);
  const [filter, setFilter] = useState('');
  const [selection, setSelection] = useState(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [nextProducts, nextInventory] = await Promise.all([api('/products'), api('/inventory')]);
    setProducts(nextProducts);
    setInventory(nextInventory);
  }

  useEffect(() => { refresh().catch(reportError); }, []); // Run once for this authenticated dashboard.

  async function run(work, success) {
    clearError();
    setNotice('');
    setBusy(true);
    try {
      await work();
      setNotice(success);
      await refresh();
    } catch (failure) {
      reportError(failure);
      if (failure.status === 409) {
        try { await refresh(); } catch (refreshFailure) { reportError(refreshFailure); }
      }
    } finally {
      setBusy(false);
    }
  }

  function open(nextTab, nextSelection = null) {
    clearError();
    setNotice('');
    setTab(nextTab);
    setSelection(nextSelection);
  }

  const term = filter.trim().toLocaleLowerCase('es-CR');
  const matches = (...values) => values.some((value) => value.toLocaleLowerCase('es-CR').includes(term));
  const visibleProducts = products?.filter((p) => matches(p.id, p.name, p.category));
  const visibleStock = inventory?.filter((item) => matches(item.sku, item.name, item.label));
  const pending = inventory?.filter((item) => item.quantity === null).length;
  const selectedProduct = products?.find((item) => item.id === selection);
  const selectedItem = inventory?.find((item) => item.id === selection);
  const creating = selection === ':new';

  return <>
    <h1>Administración de {brand}</h1>
    <p className="dz-admin__muted">{email}</p>
    <div className="dz-admin__overview">
      <div className="dz-admin__card"><span>Productos publicados</span><strong>{products?.filter((p) => p.active).length ?? '—'}</strong></div>
      <div className="dz-admin__card"><span>SKU en inventario</span><strong>{inventory?.length ?? '—'}</strong></div>
      <div className="dz-admin__card"><span>Pendientes de conteo</span><strong>{pending ?? '—'}</strong></div>
    </div>
    <div className="dz-admin__toolbar">
      <button type="button" aria-pressed={tab === 'products'} onClick={() => open('products')} disabled={busy}>Productos</button>
      <button type="button" aria-pressed={tab === 'inventory'} onClick={() => open('inventory')} disabled={busy}>Inventario</button>
      <label>Buscar<input type="search" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Nombre, opción o SKU" /></label>
      {tab === 'products' && <button type="button" className="dz-admin__primary" onClick={() => open('products', ':new')} disabled={busy || !products}>Nuevo producto</button>}
    </div>
    {notice && <p role="status">{notice}</p>}
    {tab === 'products' && (creating || selectedProduct) && <ProductForm
      key={selection} product={creating ? blank : selectedProduct} creating={creating} busy={busy}
      onClose={() => setSelection(null)}
      save={(body) => run(async () => {
        await api(creating ? '/products' : `/products/${selectedProduct.id}`, creating ? 'POST' : 'PUT', body);
        setSelection(null);
      }, 'Producto guardado.')}
      savePrices={(prices) => run(() => api(`/products/${selectedProduct.id}/variant-prices`, 'PATCH', prices), 'Precios por opción actualizados.')}
    />}
    {tab === 'inventory' && selectedItem && <StockForm key={`${selection}:${selectedItem.quantity}`}
      item={selectedItem} busy={busy} onClose={() => setSelection(null)}
      save={(body) => run(() => api(`/inventory/${selectedItem.id}/movements`, 'POST', body), 'Inventario actualizado.')}
    />}
    <div className="dz-admin__table">
      {tab === 'products' ? <table>
        <caption>Catálogo de productos</caption>
        <thead><tr><th scope="col">Producto</th><th scope="col">Categoría</th><th scope="col">Precio base</th><th scope="col">Visibilidad</th><th scope="col">Acción</th></tr></thead>
        <tbody>{visibleProducts?.map((p) => <tr key={p.id}>
          <th scope="row">{p.name}</th><td>{p.category}</td><td>{formatCurrency(p.priceCRC)}</td><td>{p.active ? 'Publicado' : 'Oculto'}</td>
          <td><button type="button" aria-label={`Editar ${p.name}`} disabled={busy} onClick={() => open('products', p.id)}>Editar</button></td>
        </tr>)}</tbody>
      </table> : <table>
        <caption>Existencias por SKU</caption>
        <thead><tr><th scope="col">Producto</th><th scope="col">Opción</th><th scope="col">SKU</th><th scope="col">Unidades</th><th scope="col">Acción</th></tr></thead>
        <tbody>{visibleStock?.map((item) => <tr key={item.id}>
          <th scope="row">{item.name}{!item.active && ' (oculto)'}</th><td>{item.label}</td><td>{item.sku}</td>
          <td>{item.quantity ?? 'Pendiente'}</td>
          <td><button type="button" aria-label={`Ajustar ${item.sku}`} disabled={busy} onClick={() => open('inventory', item.id)}>Ajustar</button></td>
        </tr>)}</tbody>
      </table>}
      {(tab === 'products' ? visibleProducts : visibleStock)?.length === 0 && <p>Sin resultados.</p>}
      {!products && <button type="button" disabled={busy} onClick={() => run(async () => {}, 'Datos actualizados.')}>Volver a cargar</button>}
    </div>
  </>;
}

function ProductForm({ product, creating, busy, onClose, save, savePrices }) {
  function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    save({
      ...Object.fromEntries(form),
      priceCRC: Number(form.get('priceCRC')),
      displayOrder: Number(form.get('displayOrder')),
      featured: form.has('featured'),
      active: form.has('active'),
    });
  }

  return <section className="dz-admin__card">
    <h2>{creating ? 'Nuevo producto' : `Editar ${product.name}`}</h2>
    <form onSubmit={submit} className="dz-admin__fields">
      {creating && <label>Identificador para la URL<input name="id" placeholder="ejemplo-producto" pattern="[a-z0-9]+(?:\x2d[a-z0-9]+)*" maxLength={120} required /></label>}
      <label>Nombre<input name="name" defaultValue={product.name} maxLength={180} required /></label>
      <label>Categoría<input name="category" defaultValue={product.category} maxLength={80} required /></label>
      <label>Precio base en colones<input type="number" name="priceCRC" min="0" max="1000000000" defaultValue={product.priceCRC} required /></label>
      <label>Imagen del sitio<input name="image" defaultValue={product.image} placeholder="/images/products/ejemplo.webp" maxLength={500} required /></label>
      <label>Estado visible de disponibilidad<input name="availability" defaultValue={product.availability} maxLength={100} required /></label>
      <label>Orden<input type="number" name="displayOrder" min="0" max="1000000000" defaultValue={product.displayOrder} required /></label>
      <label className="dz-admin__wide">Descripción<textarea name="shortDescription" defaultValue={product.shortDescription} maxLength={2000} /></label>
      <label className="dz-admin__check"><input type="checkbox" name="active" defaultChecked={product.active} /> Publicar producto</label>
      <label className="dz-admin__check"><input type="checkbox" name="featured" defaultChecked={product.featured} /> Destacar producto</label>
      <div className="dz-admin__wide dz-admin__buttons">
        <button className="dz-admin__primary" disabled={busy}>Guardar producto</button>
        <button type="button" onClick={onClose} disabled={busy}>Cerrar editor</button>
      </div>
    </form>
    {!!product.variants?.length && <form className="dz-admin__fields" onSubmit={(event) => {
      event.preventDefault();
      savePrices(new FormData(event.currentTarget).getAll('price').map(Number));
    }}>
      <h3 className="dz-admin__wide">Precios por opción</h3>
      {product.variants.map((variant) => <label key={variant.name}>{variant.name}
        <input name="price" type="number" min="0" max="1000000000" defaultValue={variant.priceCRC ?? product.priceCRC} required />
      </label>)}
      <div className="dz-admin__wide"><button disabled={busy}>Guardar precios por opción</button></div>
    </form>}
  </section>;
}

function StockForm({ item, busy, onClose, save }) {
  const [history, setHistory] = useState(null);
  const [historyError, setHistoryError] = useState('');

  useEffect(() => {
    let current = true;
    api(`/inventory/${item.id}/movements`).then((rows) => {
      if (current) setHistory(rows);
    }).catch((error) => { if (current) setHistoryError(error.message); });
    return () => { current = false; };
  }, [item.id]);

  function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    save({ expected: item.quantity, quantity: Number(form.get('quantity')), reason: form.get('reason') });
  }

  return <section className="dz-admin__card">
    <h2>{item.name} · {item.label}</h2>
    <p>Existencia registrada: {item.quantity ?? 'Pendiente de conteo'}</p>
    <form onSubmit={submit} className="dz-admin__fields">
      <label>Nuevo conteo total<input name="quantity" type="number" min="0" max="1000000000" required /></label>
      <label>Motivo<input name="reason" maxLength={250} placeholder="Ej. recepción de mercadería" required /></label>
      <div className="dz-admin__wide dz-admin__buttons">
        <button className="dz-admin__primary" disabled={busy}>Registrar movimiento</button>
        <button type="button" onClick={onClose} disabled={busy}>Cerrar ajuste</button>
      </div>
    </form>
    <h3>Últimos movimientos</h3>
    {historyError && <p role="alert">{historyError}</p>}
    {history?.length === 0 && <p>Aún no hay movimientos.</p>}
    {history?.length > 0 && <ul>{history.map((row, index) => <li key={index}>
      {new Date(row.createdAt).toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' })} · {row.email} · {row.previous ?? 'Pendiente'} → {row.quantity} · {row.reason}
    </li>)}</ul>}
  </section>;
}
