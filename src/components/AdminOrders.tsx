import { useEffect, useState } from 'react'
import { getAdminOrders, getAdminOrder, updateOrderStatus, downloadOrderPdf, triggerBlobDownload } from '../services/api.ts'
import type { Order, OrderStatus } from '../types/order.ts'
import { getChannelLabel, getOrderStatusClass, getOrderStatusLabel } from '../types/order.ts'

interface OrdersState {
  orders: Order[]
  loading: boolean
  error: string | null
  totalPages: number
}

const NEXT_ACTIONS: Partial<Record<OrderStatus, { status: OrderStatus; label: string }>> = {
  pending: { status: 'confirmed', label: 'Confirmar orden de compra' },
  confirmed: { status: 'shipped', label: 'Marcar como enviado' },
  shipped: { status: 'delivered', label: 'Marcar como entregado' },
}

const STATUS_FILTERS: OrderStatus[] = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled']

export function AdminOrders() {
  const [state, setState] = useState<OrdersState>({ orders: [], loading: true, error: null, totalPages: 1 })
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [detail, setDetail] = useState<Order | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await getAdminOrders({ page, perPage: 10, status: statusFilter || undefined })
        if (!cancelled) {
          setState({ orders: res.data, loading: false, error: null, totalPages: res.pagination.total_pages })
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: e instanceof Error ? e.message : 'Error al cargar pedidos',
          }))
        }
      }
    }

    load()
    return () => { cancelled = true }
  }, [page, statusFilter])

  async function viewDetail(order: Order) {
    setDetailError(null)
    setDetail(order)
    try {
      const data = await getAdminOrder(order.id)
      setDetail(data)
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : 'Error al cargar pedido')
      setDetail(null)
    }
  }

  async function handleStatus(order: Order) {
    const action = NEXT_ACTIONS[order.status]
    if (!action) return
    setDetailError(null)
    try {
      const updated = await updateOrderStatus(order.id, action.status)
      setDetail((prev) => (prev && prev.id === updated.id ? updated : prev))
      setState((prev) => ({
        ...prev,
        orders: statusFilter && updated.status !== statusFilter
          ? prev.orders.filter((o) => o.id !== updated.id)
          : prev.orders.map((o) => (o.id === updated.id ? { ...o, status: updated.status } : o)),
      }))
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : 'Error al actualizar pedido')
    }
  }

  async function handleDownloadPdf() {
    if (!detail) return
    setDownloading(true)
    setDetailError(null)
    try {
      const blob = await downloadOrderPdf(detail.id)
      triggerBlobDownload(blob, `OC-${detail.orderNumber}.pdf`)
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : 'Error al descargar el PDF')
    } finally {
      setDownloading(false)
    }
  }

  function changeFilter(status: string) {
    setDetail(null)
    setStatusFilter(status)
  }

  function changePage(next: number) {
    setDetail(null)
    setPage(next)
  }

  if (state.loading) {
    return <div className="loading">Cargando pedidos...</div>
  }

  return (
    <div className="admin-orders">
      <div className="user-mgmt-header">
        <h3>Órdenes de Clientes</h3>
        <select value={statusFilter} onChange={(e) => changeFilter(e.target.value)}>
          <option value="">Todos los estados</option>
          {STATUS_FILTERS.map((s) => (
            <option key={s} value={s}>{getOrderStatusLabel(s)}</option>
          ))}
        </select>
      </div>

      {state.error && <div className="form-error">{state.error}</div>}

      {state.orders.length === 0 ? (
        <div className="empty-state">
          <p>No hay órdenes de compra de tus clientes.</p>
          <p className="empty-hint">Los pedidos aparecerán aquí cuando los clientes los confirmen.</p>
        </div>
      ) : (
        <table className="product-table orders-table">
          <thead>
            <tr>
              <th>N° Orden de Compra</th>
              <th>Fecha</th>
              <th>Cliente</th>
              <th>Canal</th>
              <th>Licitación</th>
              <th>Ítems</th>
              <th>Total</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {state.orders.map((o) => (
              <tr key={o.id}>
                <td>{o.orderNumber}</td>
                <td>{new Date(o.createdAt).toLocaleDateString('es-CL')}</td>
                <td>{o.companyName || `Empresa #${o.companyId}`}</td>
                <td>{getChannelLabel(o.channel)}</td>
                <td>{o.licitacionCode || '-'}</td>
                <td>{o.itemCount ?? '-'}</td>
                <td>${Number(o.total).toLocaleString('es-CL')}</td>
                <td>
                  <span className={`status-badge ${getOrderStatusClass(o.status)}`}>
                    {getOrderStatusLabel(o.status)}
                  </span>
                </td>
                <td className="actions-cell">
                  <button className="table-btn" onClick={() => viewDetail(o)}>Ver detalle</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {state.totalPages > 1 && (
        <div className="pagination">
          <button disabled={page <= 1} onClick={() => changePage(page - 1)}>Anterior</button>
          <span>Página {page} de {state.totalPages}</span>
          <button disabled={page >= state.totalPages} onClick={() => changePage(page + 1)}>Siguiente</button>
        </div>
      )}

      {detail && (
        <div className="order-detail-panel">
          <div className="user-mgmt-header">
            <h4>Orden de Compra {detail.orderNumber} — {detail.companyName || `Empresa #${detail.companyId}`}</h4>
            <span className={`status-badge ${getOrderStatusClass(detail.status)}`}>
              {getOrderStatusLabel(detail.status)}
            </span>
          </div>

          <div className="order-meta">
            <p><strong>Fecha:</strong> {new Date(detail.createdAt).toLocaleString('es-CL')}</p>
            <p><strong>Canal:</strong> {getChannelLabel(detail.channel)}</p>
            {detail.licitacionCode && <p><strong>Licitación:</strong> {detail.licitacionCode}</p>}
            {detail.paymentMethod && <p><strong>Pago:</strong> {detail.paymentMethod}</p>}
            {detail.poNumber && <p><strong>OC / Referencia:</strong> {detail.poNumber}</p>}
            {detail.shippingAddress && <p><strong>Despacho:</strong> {detail.shippingAddress}</p>}
            {detail.shippingNotes && <p><strong>Notas de despacho:</strong> {detail.shippingNotes}</p>}
            {detail.notes && <p><strong>Comentarios:</strong> {detail.notes}</p>}
          </div>

          {detail.items && detail.items.length > 0 && (
            <table className="product-table orders-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Producto</th>
                  <th>Cant.</th>
                  <th>P. Unitario</th>
                  <th>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {detail.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.productSku || '-'}</td>
                    <td>{item.productName}</td>
                    <td>{item.quantity}</td>
                    <td>${Number(item.unitPrice).toLocaleString('es-CL')}</td>
                    <td>${Number(item.totalPrice).toLocaleString('es-CL')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="order-totals">
            <div className="total-breakdown">
              <span>Subtotal</span>
              <span>${Number(detail.subtotal).toLocaleString('es-CL')}</span>
            </div>
            <div className="total-breakdown">
              <span>IVA (19%)</span>
              <span>${Number(detail.tax).toLocaleString('es-CL')}</span>
            </div>
            <div className="total-breakdown total-breakdown-final">
              <strong>Total</strong>
              <strong>${Number(detail.total).toLocaleString('es-CL')}</strong>
            </div>
          </div>

          {detailError && <div className="form-error">{detailError}</div>}

          <div className="order-detail-actions">
            <button className="table-btn" onClick={() => setDetail(null)}>Cerrar</button>
            <button className="table-btn" onClick={handleDownloadPdf} disabled={downloading}>
              {downloading ? 'Generando...' : 'Descargar PDF'}
            </button>
            {NEXT_ACTIONS[detail.status] && (
              <button
                className="send-quote-btn"
                onClick={() => handleStatus(detail)}
              >
                {NEXT_ACTIONS[detail.status]!.label}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
