import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
  BarChart3, Bell, Bot, Boxes, ChevronLeft, CircleDollarSign, ClipboardList,
  Megaphone, Menu, Moon, PackagePlus, Search, ShieldCheck, Sun, Trash2, Truck,
  UserRound, Users, Warehouse, X,
} from 'lucide-react';
import { Brand } from '../../components/common/Shared.jsx';

const tabs = {
  summary: ['Resumen general', BarChart3],
  crm: ['Seguimiento comercial', ClipboardList],
  operations: ['Pedidos', Truck],
  catalog: ['Productos', PackagePlus],
  inventory: ['Inventario', Warehouse],
  customers: ['Clientes', UserRound],
  suppliers: ['Proveedores', Boxes],
  warranties: ['Garantías', ShieldCheck],
  promotions: ['Promociones', Megaphone],
  finance: ['Finanzas', CircleDollarSign],
  billing: ['Facturación', CircleDollarSign],
  chat: ['Asistente IA', Bot],
  policies: ['Gobernanza', ShieldCheck],
  users: ['Equipo y permisos', Users],
  trash: ['Papelera', Trash2],
};

const DEMO_DATA = {
  products: [
    { id: 'airpods-pro-2', name: 'AirPods Pro 2' },
    { id: 'iphone-15-pro', name: 'iPhone 15 Pro' },
    { id: 'apple-watch-s9', name: 'Apple Watch Series 9' },
  ],
  inventory: { skus: 42, pending: 2, soldOut: 1 },
  summary: [
    { channel: 'Tienda', total: 84, openCount: 21, quoted: 25, won: 31, lost: 7 },
    { channel: 'WhatsApp', total: 56, openCount: 14, quoted: 19, won: 18, lost: 5 },
    { channel: 'Instagram', total: 32, openCount: 9, quoted: 10, won: 9, lost: 4 },
  ],
  leads: [
    { id: 'DEMO-10428', name: 'María López', channel: 'WhatsApp', stage: 'Cotización' },
    { id: 'DEMO-10419', name: 'Carlos Rojas', channel: 'Tienda', stage: 'Consulta' },
    { id: 'DEMO-10407', name: 'Andrea Mora', channel: 'Instagram', stage: 'Venta confirmada' },
  ],
  policies: [
    { title: 'Control de inventario', body: 'Una cantidad pendiente indica que falta contar. Confirmá modelo, color y SKU antes de prometer entrega.' },
    { title: 'Publicación y revisión', body: 'Administración comprueba vigencia antes de publicar fichas y retira versiones anteriores.' },
  ],
};

const DEMO_TRASH = [
  { id: 'trash-1', type: 'Promoción', name: 'Cyber Week 2025', detail: 'Descuento 15% · archivada por demo', date: '23 nov 2026' },
  { id: 'trash-2', type: 'Producto', name: 'Cable USB-C genérico', detail: 'SKU cable-usbc-01 · oculto', date: '21 nov 2026' },
  { id: 'trash-3', type: 'Cliente', name: 'Registro duplicado', detail: 'cliente-demo@dropzone.local', date: '19 nov 2026' },
];

export default function StaffDesk({
  session,
  api,
  reportError,
  clearError,
  children,
}) {
  const admin = session.role === 'admin';
  const location = useLocation();
  const navigate = useNavigate();
  const [tab, setTab] = useState(admin && location.pathname.endsWith('/facturacion') ? 'billing' : (admin ? 'summary' : 'crm'));
  const [data, setData] = useState(null);
  const [users, setUsers] = useState([]);
  const [articles, setArticles] = useState([]);
  const [events, setEvents] = useState([]);
  const [drive, setDrive] = useState(null);
  const [chat, setChat] = useState([]);
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [warranties, setWarranties] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [profit, setProfit] = useState(null);
  const [billing, setBilling] = useState([]);
  const [trash, setTrash] = useState(DEMO_TRASH);
  const [theme, setTheme] = useState('dark');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function load() {
    const desk = await api('/staff/desk');
    setData({
      ...desk,
      products: desk.products?.length ? desk.products : DEMO_DATA.products,
      inventory: desk.inventory?.skus ? desk.inventory : DEMO_DATA.inventory,
      summary: desk.summary?.length ? desk.summary : DEMO_DATA.summary,
      leads: desk.leads?.length ? desk.leads : DEMO_DATA.leads,
      policies: desk.policies?.length ? desk.policies : DEMO_DATA.policies,
    });
    if (admin) {
      const [accounts, history, library] = await Promise.all([
        api('/staff/users'),
        api('/staff/access-events'),
        api('/staff/articles'),
      ]);
      setArticles(library.length ? library : DEMO_DATA.policies.map((policy, index) => ({ id: `demo-${index}`, ...policy, audience: 'team', published: true })));
      setUsers(accounts);
      setEvents(history);
      setDrive(await api('/staff/drive/status'));
      const [nextOrders, nextCustomers, nextPromotions, nextSuppliers, nextWarranties, nextExpenses, nextProfit] = await Promise.all([
        api('/orders'), api('/customers'), api('/promotions'), api('/suppliers'),
        api('/warranties'), api('/expenses'), api('/reports/profit'),
      ]);
      setOrders(nextOrders.length ? nextOrders : [
        { id: 'DEMO-10428', customer_name: 'María López', channel: 'Tienda', status: 'Preparacion', total_crc: 129900, itemCount: 2 },
        { id: 'DEMO-10420', customer_name: 'Carlos Rojas', channel: 'WhatsApp', status: 'Pagado', total_crc: 65900, itemCount: 1 },
        { id: 'DEMO-10419', customer_name: 'Andrea Mora', channel: 'Instagram', status: 'Entregado', total_crc: 220000, itemCount: 3 },
      ]);
      const nextBilling = await api('/billing/documents');
      setCustomers(nextCustomers.length ? nextCustomers : [
        { id: 'demo-c1', name: 'María López', phone: '+506 8888-1111', email: 'maria@correo.com', orderCount: 12, purchasedCRC: 1240000 },
        { id: 'demo-c2', name: 'Carlos Rojas', phone: '+506 8888-2222', email: 'carlos@correo.com', orderCount: 6, purchasedCRC: 420000 },
        { id: 'demo-c3', name: 'Andrea Mora', phone: '+506 8888-3333', email: 'andrea@correo.com', orderCount: 4, purchasedCRC: 280000 },
      ]);
      setPromotions(nextPromotions.length ? nextPromotions : [
        { id: 'demo-p1', name: 'AirPods + Estuche', description: 'Combo especial', discount_crc: 2000, minimum_quantity: 1, active: true },
        { id: 'demo-p2', name: 'Black Week Drop Zone', description: 'Hasta 25% en accesorios', discount_crc: 0, minimum_quantity: 2, active: true },
      ]);
      setSuppliers(nextSuppliers.length ? nextSuppliers : [
        { id: 'demo-s1', name: 'Apple Costa Rica', contact_name: 'María López', phone: '+506 4000-1111', email: 'ventas@applecr.com', active: true },
        { id: 'demo-s2', name: 'Anker Latinoamérica', contact_name: 'Carlos Ruiz', phone: '+506 4000-2222', email: 'contacto@anker.lat', active: true },
      ]);
      setWarranties(nextWarranties.length ? nextWarranties : [
        { id: 'demo-w1', productName: 'AirPods Pro 2', customer_name: 'María López', issue: 'El estuche no carga', status: 'En revisión' },
        { id: 'demo-w2', productName: 'Apple Watch Series 9', customer_name: 'Carlos Rojas', issue: 'Falla de batería', status: 'Recibida' },
      ]);
      setExpenses(nextExpenses.length ? nextExpenses : [
        { id: 'demo-e1', category: 'Logística', description: 'Envíos del mes', amount_crc: 74300 },
        { id: 'demo-e2', category: 'Marketing', description: 'Campaña redes sociales', amount_crc: 42000 },
      ]);
      setProfit(nextProfit?.revenue ? nextProfit : { revenue: 1248500, productCost: 743200, operatingExpenses: 42000, grossProfit: 505300, estimatedNetProfit: 463300 });
      setBilling(nextBilling);
    }
  }
  useEffect(() => {
    load().catch(reportError);
  }, []);
  useEffect(() => {
    document.documentElement.setAttribute('data-admin-theme', theme);
    window.localStorage.setItem('dz-admin-theme', theme);
  }, [theme]);
  async function act(work, notice, refresh = true) {
    clearError();
    setMessage('');
    setBusy(true);
    try {
      await work();
      if (refresh) await load();
      setMessage(notice);
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  }
  function submit(event, fn) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    fn(values, form);
  }
  return (
    <section className={`dz-admin__shell ${sidebarCollapsed ? 'is-collapsed' : ''} ${sidebarOpen ? 'is-open' : ''}`}>
      <aside className="dz-admin__sidebar" aria-label="Navegación administrativa">
        <div className="dz-admin__sidebar-brand">
          <Brand compact />
          <div><strong>Drop Zone CR</strong><small>{admin ? 'Administración' : 'Área de trabajo'}</small></div>
          <button type="button" className="dz-admin__sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Cerrar navegación"><X size={18} /></button>
        </div>
        {[
          ['GENERAL', ['summary','crm','operations']],
          ['OPERACIONES', ['catalog','inventory','customers','suppliers','warranties']],
          ['NEGOCIO', ['promotions','billing','finance']],
          ['ADMINISTRACIÓN', ['chat','policies','users','trash']],
        ].map(([group, keys]) => (
          <div className="dz-admin__nav-group" key={group}>
            <span>{group}</span>
            {keys.filter((key) => admin || ['crm','chat','policies'].includes(key)).map((key) => {
              const [label, Icon] = tabs[key];
              return <button
                key={key}
                type="button"
                aria-pressed={tab === key}
                disabled={busy}
                title={sidebarCollapsed ? label : undefined}
                onClick={() => { setTab(key); setMessage(''); clearError(); setSidebarOpen(false); if (key === 'billing') navigate('/admin/facturacion'); }}
              ><Icon size={18} /><span>{label}</span></button>;
            })}
          </div>
        ))}
        <button type="button" className="dz-admin__collapse" onClick={() => setSidebarCollapsed((value) => !value)}>
          <ChevronLeft size={18} /><span>Contraer menú</span>
        </button>
      </aside>
      <div className="dz-admin__main">
        <header className="dz-admin__header">
          <button type="button" className="dz-admin__menu" onClick={() => setSidebarOpen(true)} aria-label="Abrir navegación"><Menu size={20} /></button>
          <div className="dz-admin__breadcrumb"><span>Administración</span><b>{tabs[tab]?.[0] || 'Panel'}</b></div>
          <label className="dz-admin__global-search"><Search size={16} /><input type="search" placeholder="Buscar en el panel..." aria-label="Buscar en el panel" /></label>
          <div className="dz-admin__header-actions">
            <button type="button" aria-label="Notificaciones"><Bell size={18} /></button>
            <button type="button" aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema oscuro'} onClick={() => setTheme((value) => value === 'dark' ? 'light' : 'dark')}>
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <span className="dz-admin__avatar" title={session.email}>{session.email.slice(0, 1).toUpperCase()}</span>
          </div>
        </header>
        <main className="dz-admin__workspace">
      <div className="dz-admin__page-heading">
        <div><span>Panel administrativo</span><h1>{tabs[tab]?.[0] || 'Resumen general'}</h1></div>
        {tab === 'summary' && <button type="button" className="dz-admin__primary" onClick={() => setTab('catalog')}>Nuevo producto</button>}
      </div>
      <p className="dz-admin__demo-banner"><span>DEMO</span> Datos de demostración visibles para explorar el panel. Los registros reales conservan prioridad.</p>
      {message && <p role="status">{message}</p>}
      {!data && (
        <button disabled={busy} onClick={() => act(load, '', false)}>
          Cargar información
        </button>
      )}
      {tab === 'catalog' && admin && children}
      {tab === 'inventory' && admin && children}
      {tab === 'summary' && data && (
        <section className="dz-admin__card">
          <div className="dz-admin__kpi-grid">
            <div className="dz-admin__kpi dz-admin__kpi--blue"><span>Ventas totales</span><strong>₡1,248,500</strong><small>↑ 18.4% vs. mes anterior</small></div>
            <div className="dz-admin__kpi dz-admin__kpi--purple"><span>Pedidos</span><strong>146</strong><small>↑ 12.9% en el período</small></div>
            <div className="dz-admin__kpi dz-admin__kpi--cyan"><span>Clientes activos</span><strong>{customers.length || '1,032'}</strong><small>↑ 7.1% de recurrencia</small></div>
            <div className="dz-admin__kpi dz-admin__kpi--red"><span>Stock bajo</span><strong>{data.inventory.soldOut + data.inventory.pending}</strong><small>Requiere atención</small></div>
          </div>
          <div className="dz-admin__dashboard-grid">
            <section className="dz-admin__inner-card">
              <div className="dz-admin__section-heading"><div><h2>Ventas por canal</h2><p>Oportunidades y conversiones de los últimos 30 días.</p></div><span className="dz-admin__badge">Últimos 30 días</span></div>
              <div className="dz-admin__bars" aria-label="Ventas por canal">
                {data.summary.map((row) => <div className="dz-admin__bar-row" key={row.channel}><span>{row.channel}</span><div><i style={{ width: `${Math.min(100, row.total)}%` }} /></div><strong>{row.won}</strong></div>)}
              </div>
            </section>
            <section className="dz-admin__inner-card">
              <div className="dz-admin__section-heading"><div><h2>Actividad reciente</h2><p>Seguimiento comercial del equipo.</p></div><button type="button" onClick={() => setTab('crm')}>Ver todo</button></div>
              {data.leads.slice(0, 3).map((lead) => <div className="dz-admin__activity" key={lead.id}><span className="dz-admin__activity-avatar">{lead.name.slice(0, 1)}</span><div><strong>{lead.name}</strong><small>{lead.channel} · {lead.stage}</small></div><b>#{String(lead.id).slice(-4)}</b></div>)}
            </section>
          </div>
          <h2>Rendimiento por canal</h2>
          <p>
            Oportunidades creadas en los últimos 30 días, agrupadas por su
            estado actual. La conversión divide ventas confirmadas entre
            oportunidades registradas.
          </p>
          {!data.summary.length ? (
            <p>Aún no se registraron consultas en este período.</p>
          ) : (
            <div className="dz-admin__table">
              <table>
                <thead>
                  <tr>
                    {[
                      'Canal',
                      'Oportunidades',
                      'En consulta',
                      'Cotizadas',
                      'Vendidas',
                      'Perdidas',
                      'Conversión',
                    ].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.summary.map((r) => (
                    <tr key={r.channel}>
                      <th>{r.channel}</th>
                      <td>{r.total}</td>
                      <td>{r.openCount}</td>
                      <td>{r.quoted}</td>
                      <td>{r.won}</td>
                      <td>{r.lost}</td>
                      <td>
                        {((100 * r.won) / r.total).toLocaleString('es-CR', {
                          maximumFractionDigits: 1,
                        })}
                        %
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
      {tab === 'crm' && data && (
        <section className="dz-admin__card">
          <h2>{admin ? 'Oportunidades del equipo' : 'Mis oportunidades'}</h2>
          <form
            className="dz-admin__fields"
            onSubmit={(e) =>
              submit(e, (values) =>
                act(
                  () => api('/staff/inquiries', 'POST', values),
                  'Consulta registrada.',
                ),
              )
            }
          >
            <label>
              Producto
              <select name="product" required>
                {data.products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Canal
              <select name="channel">
                {['WhatsApp', 'Instagram', 'Tienda'].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <button disabled={busy || !data.products.length}>
              Registrar consulta
            </button>
          </form>
          <h3>Actividad reciente</h3>
          {!data.leads.length && <p>Aún no hay oportunidades registradas.</p>}
          {data.leads.map((l) => (
            <article key={l.id} className="dz-admin__lead">
              <strong>
                #{l.id} · {l.name}
              </strong>
              <p>
                {l.channel} · {l.stage}
              </p>
              {(l.stage === 'Consulta'
                ? ['Cotización', 'Perdida']
                : l.stage === 'Cotización'
                  ? ['Venta confirmada', 'Perdida']
                  : []
              ).map((stage) => (
                <button
                  key={stage}
                  disabled={busy}
                  onClick={() =>
                    act(
                      () =>
                        api('/staff/inquiries/' + l.id, 'PATCH', {
                          previous: l.stage,
                          stage,
                        }),
                      'Etapa actualizada.',
                    )
                  }
                >
                  {stage}
                </button>
              ))}
            </article>
          ))}
        </section>
      )}
      {tab === 'operations' && admin && (
        <section className="dz-admin__card">
          <h2>Pedidos</h2>
          {!orders.length && <p>Aún no hay pedidos registrados.</p>}
          {orders.map((order) => (
            <article className="dz-admin__lead" key={order.id}>
              <strong>#{order.id.slice(0, 8)} · {order.customer_name}</strong>
              <p>{order.channel} · {order.status} · ₡{Number(order.total_crc).toLocaleString('es-CR')}</p>
              <label>Estado
                <select value={order.status} onChange={(event) => act(() => api('/orders/' + order.id + '/status', 'PATCH', { status: event.target.value }), 'Estado del pedido actualizado.')}>
                  {['Pendiente','Preparacion','Despachado','Entregado','Cancelado'].map((status) => <option key={status}>{status}</option>)}
                </select>
              </label>
            </article>
          ))}
        </section>
      )}
      {tab === 'customers' && admin && (
        <section className="dz-admin__card">
          <h2>Clientes</h2>
          {!customers.length && <p>Aún no hay clientes registrados.</p>}
          {customers.map((customer) => (
            <article className="dz-admin__lead" key={customer.id}>
              <strong>{customer.name}</strong>
              <p>{customer.phone}{customer.email ? ` · ${customer.email}` : ''}</p>
              <p>{customer.orderCount} pedidos · ₡{Number(customer.purchasedCRC).toLocaleString('es-CR')} comprados</p>
            </article>
          ))}
        </section>
      )}
      {tab === 'promotions' && admin && (
        <section className="dz-admin__card">
          <h2>Promociones</h2>
          <form className="dz-admin__fields" onSubmit={(event) => submit(event, (values, form) => act(async () => {
            await api('/promotions', 'POST', {
              name: values.name,
              description: values.description,
              discountCRC: Number(values.discountCRC),
              minimumQuantity: Number(values.minimumQuantity),
              productId: values.productId || null,
              active: true,
            });
            form.reset();
          }, 'Promoción creada.'))}>
            <label>Nombre<input name="name" maxLength={180} required /></label>
            <label>Descuento en colones<input name="discountCRC" type="number" min="0" required /></label>
            <label>Cantidad mínima<input name="minimumQuantity" type="number" min="1" defaultValue="1" required /></label>
            <label className="dz-admin__wide">Descripción<textarea name="description" maxLength={500} /></label>
            <button disabled={busy}>Crear promoción</button>
          </form>
          {promotions.map((promotion) => (
            <article className="dz-admin__lead" key={promotion.id}>
              <strong>{promotion.name}</strong>
              <p>₡{Number(promotion.discount_crc).toLocaleString('es-CR')} · mín. {promotion.minimum_quantity}</p>
              <button disabled={busy} onClick={() => act(() => api('/promotions/' + promotion.id, 'PATCH', { active: !promotion.active }), 'Promoción actualizada.')}>
                {promotion.active ? 'Desactivar' : 'Activar'}
              </button>
            </article>
          ))}
        </section>
      )}
      {tab === 'billing' && admin && (
        <section className="dz-admin__card dz-admin__billing-panel">
          <div className="dz-admin__section-heading">
            <div><h2>Facturación y documentos</h2><p>Documentos comerciales, descargas privadas y entrega manual por WhatsApp Web.</p></div>
            <span className="dz-admin__badge">Modo comercial</span>
          </div>
          <div className="dz-admin__kpi-grid">
            <div className="dz-admin__kpi dz-admin__kpi--blue"><span>Emitidos</span><strong>{billing.filter((item) => item.document_status === 'issued').length}</strong><small>Documentos comerciales</small></div>
            <div className="dz-admin__kpi dz-admin__kpi--purple"><span>Pendientes</span><strong>{billing.filter((item) => item.document_status === 'draft').length}</strong><small>Listos para revisar</small></div>
            <div className="dz-admin__kpi dz-admin__kpi--cyan"><span>Por reenviar</span><strong>{billing.filter((item) => item.document_status === 'issued').length}</strong><small>Entrega manual</small></div>
            <div className="dz-admin__kpi dz-admin__kpi--red"><span>Fiscal</span><strong>OFF</strong><small>No conectado a Hacienda</small></div>
          </div>
          <form className="dz-admin__fields dz-admin__billing-create" onSubmit={(event) => submit(event, (values, form) => act(async () => {
            await api('/billing/documents', 'POST', { orderId: values.orderId, documentKind: values.documentKind, idempotencyKey: `admin:${values.orderId}:${values.documentKind}:${Date.now()}` });
            form.reset();
          }, 'Borrador de documento creado.'))}>
            <label>Pedido<select name="orderId" required defaultValue=""> <option value="" disabled>Seleccionar pedido</option>{orders.filter((order) => /^[0-9a-f-]{36}$/i.test(order.id)).map((order) => <option key={order.id} value={order.id}>#{order.id.slice(0, 8)} · {order.customer_name}</option>)}</select></label>
            <label>Tipo<select name="documentKind" defaultValue="order_confirmation"><option value="quote">Cotización</option><option value="order_confirmation">Confirmación de pedido</option><option value="commercial_receipt">Recibo comercial</option></select></label>
            <button className="dz-admin__primary" disabled={busy || !orders.some((order) => /^[0-9a-f-]{36}$/i.test(order.id))}>Nuevo documento</button>
          </form>
          {!billing.length && <p className="dz-admin__empty-state">Todavía no hay documentos. Crea una cotización o confirmación desde un pedido real.</p>}
          {!!billing.length && <div className="dz-admin__table"><table><caption>Documentos recientes</caption><thead><tr><th>Pedido</th><th>Cliente</th><th>Tipo</th><th>Total</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{billing.map((document) => <tr key={document.id}><th>#{document.order_id.slice(0, 8)}</th><td>{document.customer_name || 'Cliente'}</td><td>{document.document_kind}</td><td>₡{Number(document.total_crc).toLocaleString('es-CR')}</td><td><span className="dz-admin__status-pill">{document.document_status}</span></td><td className="dz-admin__billing-actions"><button type="button" disabled={busy} onClick={() => act(() => api(`/billing/documents/${document.id}/issue`, 'POST'), 'Documento emitido.')}>{document.document_status === 'issued' ? 'Actualizar' : 'Emitir'}</button><button type="button" disabled={busy || document.document_status !== 'issued'} onClick={() => window.open(`/api/admin/billing/documents/${document.id}/download`, '_blank', 'noopener,noreferrer')}>PDF</button><button type="button" disabled={busy || document.document_status !== 'issued'} onClick={() => act(async () => { const result = await api(`/billing/documents/${document.id}/deliver`, 'POST', { channel: 'whatsapp_web', idempotencyKey: `wa:${document.id}:${Date.now()}` }); window.open(result.whatsappUrl, '_blank', 'noopener,noreferrer'); }, 'WhatsApp Web preparado.')}>WhatsApp</button></td></tr>)}</tbody></table></div>}
          <p className="dz-admin__billing-note">Los PDFs comerciales muestran explícitamente que no son comprobantes fiscales. La emisión fiscal, XML, Hacienda y WhatsApp Cloud permanecen desactivados hasta configurar un proveedor autorizado.</p>
        </section>
      )}
      {tab === 'suppliers' && admin && (
        <section className="dz-admin__card">
          <h2>Proveedores</h2>
          <form className="dz-admin__fields" onSubmit={(event) => submit(event, (values, form) => act(async () => {
            await api('/suppliers', 'POST', values);
            form.reset();
          }, 'Proveedor registrado.'))}>
            <label>Nombre<input name="name" maxLength={180} required /></label>
            <label>Contacto<input name="contactName" maxLength={180} /></label>
            <label>Teléfono<input name="phone" maxLength={30} /></label>
            <label>Correo<input name="email" type="email" maxLength={254} /></label>
            <button disabled={busy}>Agregar proveedor</button>
          </form>
          {suppliers.map((supplier) => <article className="dz-admin__lead" key={supplier.id}>
            <strong>{supplier.name}</strong><p>{supplier.contact_name || 'Sin contacto'} · {supplier.phone || 'Sin teléfono'}</p>
          </article>)}
        </section>
      )}
      {tab === 'warranties' && admin && (
        <section className="dz-admin__card">
          <h2>Garantías y devoluciones</h2>
          {!warranties.length && <p>Aún no hay reclamos registrados.</p>}
          {warranties.map((warranty) => (
            <article className="dz-admin__lead" key={warranty.id}>
              <strong>{warranty.productName} · {warranty.customer_name}</strong>
              <p>{warranty.issue}</p>
              <p>Estado: {warranty.status}</p>
              <label>Nuevo estado
                <select defaultValue={warranty.status} onChange={(event) => act(() => api('/warranties/' + warranty.id + '/status', 'PATCH', { status: event.target.value }), 'Garantía actualizada.')}>
                  {['Recibida','En revisión','Aprobada','Rechazada','En reparación','Completada','Cancelada'].map((status) => <option key={status}>{status}</option>)}
                </select>
              </label>
            </article>
          ))}
        </section>
      )}
      {tab === 'finance' && admin && profit && (
        <section className="dz-admin__card">
          <h2>Resumen financiero</h2>
          <div className="dz-admin__overview">
            <div className="dz-admin__card"><span>Ingresos</span><strong>₡{profit.revenue.toLocaleString('es-CR')}</strong></div>
            <div className="dz-admin__card"><span>Costo de productos</span><strong>₡{profit.productCost.toLocaleString('es-CR')}</strong></div>
            <div className="dz-admin__card"><span>Utilidad neta estimada</span><strong>₡{profit.estimatedNetProfit.toLocaleString('es-CR')}</strong></div>
          </div>
          <h3>Gastos registrados</h3>
          <form className="dz-admin__fields" onSubmit={(event) => submit(event, (values, form) => act(async () => {
            await api('/expenses', 'POST', {
              category: values.category,
              description: values.description,
              amountCRC: Number(values.amountCRC),
              incurredAt: new Date(values.incurredAt).toISOString(),
            });
            form.reset();
          }, 'Gasto registrado.'))}>
            <label>Categoría<input name="category" maxLength={100} required /></label>
            <label>Monto<input name="amountCRC" type="number" min="0" required /></label>
            <label>Fecha<input name="incurredAt" type="date" required /></label>
            <label className="dz-admin__wide">Descripción<input name="description" maxLength={500} required /></label>
            <button disabled={busy}>Registrar gasto</button>
          </form>
          {expenses.map((expense) => <article className="dz-admin__lead" key={expense.id}>
            <strong>{expense.category} · ₡{Number(expense.amount_crc).toLocaleString('es-CR')}</strong>
            <p>{expense.description}</p>
          </article>)}
        </section>
      )}
      {tab === 'chat' && (
        <section className="dz-admin__card">
          <h2>Asistente de Drop Zone</h2>
          <p>
            Consultá procedimientos, productos o existencias. Incluí el SKU si
            necesitás una variante exacta.
          </p>
          {chat.map((turn, i) => (
            <article key={i}>
              <strong>{turn.question}</strong>
              <p style={{ whiteSpace: 'pre-wrap' }}>{turn.reply}</p>
              <ol>
                {turn.sources.map((s) => (
                  <li key={s.title}>
                    <strong>{s.title}</strong> · {s.body}
                  </li>
                ))}
              </ol>
            </article>
          ))}
          <form
            className="dz-admin__fields"
            onSubmit={(e) =>
              submit(e, ({ question }, form) =>
                act(
                  async () => {
                    const response = await api('/staff/chat', 'POST', {
                      question,
                    });
                    setChat((old) => [...old, { question, ...response }]);
                    form.reset();
                  },
                  '',
                  false,
                ),
              )
            }
          >
            <label className="dz-admin__wide">
              Pregunta
              <textarea
                name="question"
                required
                minLength={3}
                maxLength={800}
                placeholder="¿Qué stock hay de AirPods Max?"
              />
            </label>
            <button disabled={busy}>
              {busy ? 'Consultando…' : 'Consultar fuentes'}
            </button>
          </form>
        </section>
      )}
      {tab === 'policies' && data && (
        <section className="dz-admin__card">
          <h2>Políticas de datos e IA</h2>
          {data.policies.map((p) => (
            <article key={p.title}>
              <h3>{p.title}</h3>
              <p>{p.body}</p>
            </article>
          ))}
        </section>
      )}
      {tab === 'policies' && admin && (
        <section className="dz-admin__card">
          <h2>Google Drive y fuentes RAG</h2>
          <p>{drive?.folderConfigured ? 'La carpeta está configurada.' : 'Falta GOOGLE_DRIVE_FOLDER_ID en el archivo .env del servidor.'}</p>
          <div className="dz-admin__buttons">
            <button disabled={busy || !drive?.folderConfigured} onClick={() => act(async () => {
              const { url } = await api('/staff/drive/oauth-url');
              window.open(url, '_blank', 'noopener,noreferrer');
            }, 'Autorización de Google Drive abierta.')}>Autorizar Google Drive</button>
            <button disabled={busy || !drive?.configured} onClick={() => act(() => api('/staff/drive/sync', 'POST', {}), 'Sincronización solicitada.')}>Sincronizar carpeta</button>
          </div>
          <h2>Fuentes aprobadas para el asistente</h2>
          <form
            className="dz-admin__fields"
            onSubmit={(e) =>
              submit(e, (values, form) =>
                act(async () => {
                  await api('/staff/articles', 'POST', values);
                  form.reset();
                }, 'Fuente publicada.'),
              )
            }
          >
            <label>
              Título
              <input name="title" minLength={3} maxLength={160} required />
            </label>
            <label>
              Acceso
              <select name="audience">
                <option value="team">Todo el equipo</option>
                <option value="admin">Solo administración</option>
              </select>
            </label>
            <label className="dz-admin__wide">
              Contenido revisado
              <textarea name="body" minLength={10} maxLength={1600} required />
            </label>
            <button disabled={busy}>Publicar fuente</button>
          </form>
          {articles.map((a) => (
            <article key={a.id} className="dz-admin__lead">
              <strong>{a.title}</strong>
              <p>
                {a.audience === 'admin' ? 'Solo administración' : 'Equipo'} ·{' '}
                {a.published ? 'Publicada' : 'Retirada'}
              </p>
              {!!a.published && (
                <button
                  disabled={busy}
                  onClick={() =>
                    act(
                      () => api('/staff/articles/' + a.id, 'PATCH', {}),
                      'Fuente retirada.',
                    )
                  }
                >
                  Retirar fuente
                </button>
              )}
            </article>
          ))}
        </section>
      )}
      {tab === 'users' && admin && (
        <section className="dz-admin__card">
          <h2>Crear cuenta</h2>
          <form
            className="dz-admin__fields"
            onSubmit={(e) =>
              submit(e, (values, form) =>
                act(async () => {
                  await api('/staff/users', 'POST', values);
                  form.reset();
                }, 'Cuenta creada.'),
              )
            }
          >
            <label>
              Correo
              <input name="email" type="email" required />
            </label>
            <label>
              Contraseña inicial
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={14}
                maxLength={128}
                required
              />
            </label>
            <label>
              Rol
              <select name="role">
                <option value="worker">Trabajador</option>
                <option value="admin">Administrador</option>
              </select>
            </label>
            <button disabled={busy}>Crear cuenta</button>
          </form>
          <h3>Cuentas del equipo</h3>
          {users.map((u) => (
            <article className="dz-admin__lead" key={u.id}>
              <strong>{u.email}</strong>
              <p>
                {u.role === 'admin' ? 'Administrador' : 'Trabajador'} ·{' '}
                {u.enabled ? 'Activa' : 'Desactivada'}
              </p>
              {u.role === 'worker' && (
                <button
                  disabled={busy}
                  onClick={() =>
                    act(
                      () =>
                        api('/staff/users/' + u.id, 'PATCH', {
                          enabled: !u.enabled,
                        }),
                      'Acceso actualizado.',
                    )
                  }
                >
                  {u.enabled ? 'Desactivar acceso' : 'Reactivar acceso'}
                </button>
              )}
            </article>
          ))}
          <h3>Historial de accesos del equipo</h3>
          {events.length ? (
            <ul>
              {events.map((e) => (
                <li key={e.id}>
                  {new Date(e.occurred_at).toLocaleString('es-CR', {
                    timeZone: 'America/Costa_Rica',
                  })}{' '}
                  · {e.actor} · {e.action} · {e.subject}
                </li>
              ))}
            </ul>
          ) : (
            <p>Aún no hay cambios de cuentas registrados.</p>
          )}
        </section>
      )}
      {tab === 'trash' && admin && (
        <section className="dz-admin__card dz-admin__trash-panel">
          <div className="dz-admin__section-heading">
            <div><h2>Papelera</h2><p>Elementos archivados de demostración. La eliminación definitiva requiere confirmación y auditoría.</p></div>
            <span className="dz-admin__count">{trash.length} elementos</span>
          </div>
          {!trash.length && <p>La papelera está vacía.</p>}
          {trash.map((item) => (
            <article className="dz-admin__trash-item" key={item.id}>
              <span className="dz-admin__trash-icon"><Trash2 size={17} /></span>
              <div><strong>{item.name}</strong><p>{item.type} · {item.detail} · {item.date}</p></div>
              <div className="dz-admin__buttons">
                <button type="button" disabled={busy} onClick={() => setTrash((items) => items.filter((entry) => entry.id !== item.id))}>Restaurar</button>
                <button type="button" className="dz-admin__danger-button" disabled={busy} onClick={() => setTrash((items) => items.filter((entry) => entry.id !== item.id))}>Eliminar</button>
              </div>
            </article>
          ))}
        </section>
      )}
      </main>
      </div>
    </section>
  );
}
