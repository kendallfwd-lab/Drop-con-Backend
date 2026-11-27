import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Brand } from '../../components/common/Shared.jsx';
import { formatCurrency } from '../../utils/formatCurrency.js';
import { useCart } from '../../app/providers/CartProvider.jsx';
import StaffDesk from './StaffDesk.jsx';
import './admin.css';

const blank = {
  id: '', name: '', category: '', priceCRC: 0, costCRC: 0, image: '', shortDescription: '',
  availability: 'Consultar', featured: false, active: false, displayOrder: 0,
};

const DEMO_ACCOUNT = import.meta.env.DEV ? {
  email: 'demo.admin@dropzone.local',
  password: 'DropZoneDemo2026!',
} : null;

function readCookie(name) {
  return document.cookie.split('; ').find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

const API_BASE = import.meta.env.DEV ? 'http://127.0.0.1:3001' : '';

async function api(path, method = 'GET', body) {
  const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(method);
  let csrfToken = mutating ? readCookie('dz_csrf') : undefined;
  if (mutating && !csrfToken) {
    const csrfResponse = await fetch(`${API_BASE}/api/admin/csrf`, { credentials: 'include' });
    const csrfData = await csrfResponse.json().catch(() => null);
    if (!csrfResponse.ok || !csrfData?.csrfToken) throw new Error('No se pudo preparar la protección CSRF.');
    csrfToken = csrfData.csrfToken;
  }
  const headers = {
    ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
  };
  const response = await fetch(`${API_BASE}/api/admin${path}`, {
    method,
    credentials: 'include',
    ...(Object.keys(headers).length ? { headers } : {}),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
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
  const [mfaRequired, setMfaRequired] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [recoveryCodeSent, setRecoveryCodeSent] = useState(false);
  const [recoveryNotice, setRecoveryNotice] = useState('');
  const [totpSetup, setTotpSetup] = useState(null);

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
    try {
      const result = await api('/login', 'POST', body);
      if (result?.mfaRequired) { setMfaRequired(true); return; }
      setSession(result);
    }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }

  async function submitMfa(event) { event.preventDefault(); setBusy(true); setError(''); try { setSession(await api('/login/mfa', 'POST', Object.fromEntries(new FormData(event.currentTarget)))); } catch (failure) { setError(failure.message); } finally { setBusy(false); } }
  async function requestRecoveryCode(event) {
    event.preventDefault(); setBusy(true); setError(''); setRecoveryNotice('');
    try {
      const result = await api('/password-reset/email-code/request', 'POST', Object.fromEntries(new FormData(event.currentTarget)));
      setRecoveryCodeSent(true);
      setRecoveryNotice('Revisa tu correo e ingresa el codigo de seis digitos. Vence en 10 minutos.');
    } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  }
  async function confirmRecoveryCode(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await api('/password-reset/email-code/confirm', 'POST', Object.fromEntries(new FormData(event.currentTarget)));
      setRecoveryMode(false); setRecoveryCodeSent(false); setRecoveryNotice('Contrasena actualizada. Ya puedes iniciar sesion.');
    } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  }
  async function beginTotpSetup() { setBusy(true); setError(''); try { setTotpSetup(await api('/security/totp/enroll', 'POST', {})); } catch (failure) { setError(failure.message); } finally { setBusy(false); } }
  async function confirmTotpSetup(event) { event.preventDefault(); setBusy(true); setError(''); try { await api('/security/totp/verify', 'POST', Object.fromEntries(new FormData(event.currentTarget))); setTotpSetup({ complete: true }); } catch (failure) { setError(failure.message); } finally { setBusy(false); } }

  function fillDemoAccount(event) {
    const form = event.currentTarget.form;
    form.elements.email.value = DEMO_ACCOUNT.email;
    form.elements.password.value = DEMO_ACCOUNT.password;
    form.elements.email.focus();
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
      <button type="button" onClick={beginTotpSetup} disabled={busy}>Google Authenticator</button>
      <button type="button" onClick={signOut} disabled={busy}>Cerrar sesión</button>
    </header>}
    {error && <p className="dz-admin__error" role="alert">{error}</p>}
    {session === undefined && <p role="status">Verificando sesión…</p>}
    {session === null && <div className="dz-admin__login-layout">
      <section className="dz-admin__login-aside" aria-label="Información de DROP ZONE CR">
        <Brand />
        <span className="dz-admin__login-aside-kicker">DROP ZONE CR</span>
        <h1>Administra tu tienda con claridad.</h1>
        <p>Productos, pedidos, inventario y clientes en un solo lugar para que tu equipo avance más rápido.</p>
        <div className="dz-admin__login-aside-points"><span>●</span> Datos conectados a MySQL</div>
        <div className="dz-admin__login-aside-points"><span>●</span> Acceso protegido para tu equipo</div>
      </section>
      <form className="dz-admin__login" onSubmit={recoveryMode ? (recoveryCodeSent ? confirmRecoveryCode : requestRecoveryCode) : mfaRequired ? submitMfa : authenticate} aria-describedby="admin-login-help">
      <div className="dz-admin__login-brand"><Brand /><span className="dz-admin__login-badge">ADMIN</span></div>
      <h1>{recoveryMode ? 'Recuperar acceso' : mfaRequired ? 'Verificación en dos pasos' : `Acceso del equipo de ${settings.brand}`}</h1>
      <p id="admin-login-help" className="dz-admin__login-help">Ingresa para administrar productos, pedidos e inventario de {settings.brand}.</p>
      {recoveryNotice && <p className="dz-admin__login-notice" role="status">{recoveryNotice}</p>}
      <fieldset className={(mfaRequired || recoveryMode) ? 'dz-admin__login-fields is-hidden' : 'dz-admin__login-fields'} disabled={mfaRequired || recoveryMode}>
      <label>Correo electrónico<input autoComplete="username" name="email" type="email" maxLength={254} required /></label>
      <label>Contraseña<input autoComplete="current-password" name="password" type="password" maxLength={128} required /></label>
      </fieldset>
      {mfaRequired && <label>Código de autenticación<input autoComplete="one-time-code" name="code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required /></label>}
      {recoveryMode && <>
        <label>Correo electrónico<input autoComplete="email" name="email" type="email" maxLength={254} required /></label>
        {recoveryCodeSent && <>
          <label>Código enviado al correo<input autoComplete="one-time-code" name="code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required /></label>
          <label>Nueva contraseña<input autoComplete="new-password" name="password" type="password" minLength={15} maxLength={128} required /></label>
        </>}
      </>}
      {!mfaRequired && !recoveryMode && <button type="button" className="dz-admin__text-button" onClick={() => { setRecoveryMode(true); setRecoveryCodeSent(false); setRecoveryNotice(''); }}>¿Olvidaste tu contraseña?</button>}
      {!mfaRequired && !recoveryMode && DEMO_ACCOUNT && <div className="dz-admin__demo-login">
        <div><strong>Usuario demo</strong><span>Solo para desarrollo local</span></div>
        <code>{DEMO_ACCOUNT.email}</code>
        <code>{DEMO_ACCOUNT.password}</code>
        <button type="button" onClick={fillDemoAccount}>Usar usuario demo</button>
      </div>}
      <button className="dz-admin__primary dz-admin__login-submit" disabled={busy}>{busy ? 'Procesando…' : recoveryMode ? (recoveryCodeSent ? 'Cambiar contraseña' : 'Enviar código al correo') : 'Iniciar sesión'}</button>
      <p className="dz-admin__login-footnote"><span aria-hidden="true">●</span> Acceso protegido para el equipo autorizado</p>
      <Link className="dz-admin__back-link" to="/">← Volver a la tienda</Link>
      </form>
    </div>}
    {session && totpSetup && <section className="dz-admin__totp-setup" role="dialog" aria-modal="true" aria-label="Configurar Google Authenticator">
      <h2>{totpSetup.complete ? 'Authenticator activado' : 'Configurar Google Authenticator'}</h2>
      {totpSetup.complete ? <p>Tu cuenta ya puede usar el código de Google Authenticator como verificación adicional al iniciar sesión.</p> : <><p>En Google Authenticator agregá una cuenta y elegí “Ingresar clave de configuración”. Copiá esta clave:</p><code>{totpSetup.secret}</code><form onSubmit={confirmTotpSetup}><label>Código de seis dígitos<input name="code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required /></label><button className="dz-admin__primary" disabled={busy}>Confirmar y activar</button></form></>}
      <button type="button" onClick={() => setTotpSetup(null)} disabled={busy}>Cerrar</button>
    </section>}
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
    const results = await Promise.allSettled([api('/products'), api('/inventory')]);
    const [productsResult, inventoryResult] = results;
    if (productsResult.status === 'fulfilled') setProducts(productsResult.value);
    if (inventoryResult.status === 'fulfilled') setInventory(inventoryResult.value);
    const failed = results.find((result) => result.status === 'rejected');
    if (failed && results.every((result) => result.status === 'rejected')) throw failed.reason;
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
      costCRC: Number(form.get('costCRC')),
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
      <label>Costo de adquisición<input type="number" name="costCRC" min="0" max="1000000000" defaultValue={product.costCRC ?? 0} required /></label>
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
