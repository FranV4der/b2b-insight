import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext.tsx'
import { useAuth } from '../context/AuthContext.tsx'
import { cancelOrder, downloadOrderPdf, getAdminOrder, getOrder, getProduct, triggerBlobDownload } from '../services/api.ts'
import type { Order } from '../types/order.ts'
import { getChannelLabel, getOrderStatusClass, getOrderStatusLabel } from '../types/order.ts'

interface OrderDetailState {
  order: Order | null
  loading: boolean
  error: string | null
}

export function OrderDetailView() {
  const { selectedOrder, backToOrders, addItem, navigate } = useApp()
  const { isEmpresa } = useAuth()
  const [state, setState] = useState<OrderDetailState>({ order: null, loading: true, error: null })
  const [cancelling, setCancelling] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [reordering, setReordering] = useState(false)

  useEffect(() => {
    if (selectedOrder == null) return
    const orderId = selectedOrder
    let cancelled = false

    async function load() {
      try {
        const data = await (isEmpresa ? getAdminOrder(orderId) : getOrder(orderId))
        if (!cancelled) setState({ order: data, loading: false, error: null })
      } catch (e: unknown) {
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: e instanceof Error ? e.message : 'Error al cargar pedido',
          }))
        }
      }
    }

    load()
    return () => { cancelled = true }
  }, [selectedOrder, isEmpresa])

  async function handleCancel() {
    if (!state.order) return
    setCancelling(true)
    try {
      const updated = await cancelOrder(state.order.id)
      setState((prev) => ({ ...prev, order: updated, error: null }))
    } catch (e: unknown) {
      setState((prev) => ({
        ...prev,
        error: e instanceof Error ? e.message : 'Error al cancelar pedido',
      }))
    } finally {
      setCancelling(false)
    }
  }

  async function handleDownloadPdf() {
    if (!state.order) return
    setDownloading(true)
    try {
      const blob = await downloadOrderPdf(state.order.id)
      triggerBlobDownload(blob, `OC-${state.order.orderNumber}.pdf`)
    } catch (e: unknown) {
      setState((prev) => ({
        ...prev,
        error: e instanceof Error ? e.message : 'Error al descargar el PDF',
      }))
    } finally {
      setDownloading(false)
    }
  }

  async function handleReorder() {
    if (!state.order?.items?.length) return
    setReordering(true)
    setState((prev) => ({ ...prev, error: null }))
    try {
      let added = 0
      let skipped = 0
      for (const item of state.order.items) {
        if (item.productId == null) { skipped += 1; continue }
        try {
          const product = await getProduct(item.productId)
          if (product.status !== 'active') { skipped += 1; continue }
          addItem(product, item.quantity)
          added += 1
        } catch {
          skipped += 1
        }
      }
      if (added === 0) {
        setState((prev) => ({
          ...prev,
          error: skipped > 0
            ? 'Los productos de esta orden ya no están disponibles en el catálogo.'
            : 'No se pudo repetir el pedido.',
        }))
        return
      }
      navigate('cart')
    } catch (e: unknown) {
      setState((prev) => ({
        ...prev,
        error: e instanceof Error ? e.message : 'Error al repetir el pedido',
      }))
    } finally {
      setReordering(false)
    }
  }

  if (selectedOrder == null) return null

  if (state.loading) {
    return <div className="loading">Cargando pedido...</div>
  }

  if (!state.order) {
    return (
      <section className="order-detail-view">
        {state.error && <div className="form-error">{state.error}</div>}
        <button className="back-btn" onClick={backToOrders}>← Volver a mis órdenes</button>
      </section>
    )
  }

  const order = state.order
  const canCancel = order.status === 'pending' || order.status === 'confirmed'

  return (
    <section className="order-detail-view">
      <button className="back-btn" onClick={backToOrders}>← Volver a mis órdenes</button>

      <div className="order-detail-header">
        <h2>Orden de Compra {order.orderNumber}</h2>
        <span className={`status-badge ${getOrderStatusClass(order.status)}`}>
          {getOrderStatusLabel(order.status)}
        </span>
      </div>

      <div className="order-meta">
        <p><strong>Fecha:</strong> {new Date(order.createdAt).toLocaleString('es-CL')}</p>
        <p><strong>Canal:</strong> {getChannelLabel(order.channel)}</p>
        {order.licitacionCode && <p><strong>Licitación:</strong> {order.licitacionCode}</p>}
        {order.paymentMethod && <p><strong>Pago:</strong> {order.paymentMethod}</p>}
        {order.poNumber && <p><strong>OC / Referencia:</strong> {order.poNumber}</p>}
        {order.shippingAddress && <p><strong>Despacho:</strong> {order.shippingAddress}</p>}
        {order.shippingNotes && <p><strong>Notas de despacho:</strong> {order.shippingNotes}</p>}
        {order.notes && <p><strong>Comentarios:</strong> {order.notes}</p>}
      </div>

      {order.items && order.items.length > 0 && (
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
            {order.items.map((item) => (
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
          <span>${Number(order.subtotal).toLocaleString('es-CL')}</span>
        </div>
        <div className="total-breakdown">
          <span>IVA (19%)</span>
          <span>${Number(order.tax).toLocaleString('es-CL')}</span>
        </div>
        <div className="total-breakdown total-breakdown-final">
          <strong>Total</strong>
          <strong>${Number(order.total).toLocaleString('es-CL')}</strong>
        </div>
      </div>

      {state.error && <div className="form-error">{state.error}</div>}

      <div className="order-detail-actions">
        <button className="table-btn" onClick={handleDownloadPdf} disabled={downloading}>
          {downloading ? 'Generando...' : 'Descargar PDF'}
        </button>
        {!isEmpresa && (
          <button className="table-btn" onClick={handleReorder} disabled={reordering}>
            {reordering ? 'Copiando...' : 'Repetir pedido'}
          </button>
        )}
        {canCancel && !isEmpresa && (
          <button className="clear-btn" onClick={handleCancel} disabled={cancelling}>
            {cancelling ? 'Cancelando...' : 'Cancelar orden de compra'}
          </button>
        )}
      </div>
    </section>
  )
}
