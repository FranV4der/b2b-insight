import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext.tsx'
import { getOrders } from '../services/api.ts'
import type { Order } from '../types/order.ts'
import { getChannelLabel, getOrderStatusClass, getOrderStatusLabel } from '../types/order.ts'

interface OrdersState {
  orders: Order[]
  loading: boolean
  error: string | null
  totalPages: number
}

export function OrdersView() {
  const { navigate, viewOrder } = useApp()
  const [page, setPage] = useState(1)
  const [state, setState] = useState<OrdersState>({
    orders: [],
    loading: true,
    error: null,
    totalPages: 1,
  })

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await getOrders({ page, perPage: 10 })
        if (!cancelled) {
          setState({
            orders: res.data,
            loading: false,
            error: null,
            totalPages: res.pagination.total_pages,
          })
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
  }, [page])

  if (state.loading) {
    return <div className="loading">Cargando pedidos...</div>
  }

  if (state.error) {
    return <div className="form-error">{state.error}</div>
  }

  return (
    <section className="orders-view">
      <div className="orders-header">
        <h2>Mis Órdenes de Compra</h2>
      </div>

      {state.orders.length === 0 ? (
        <div className="empty-state">
          <p>Aún no tienes órdenes de compra.</p>
          <p className="empty-hint">Los pedidos que confirmes aparecerán aquí.</p>
          <button onClick={() => navigate('catalog')}>Ir al catálogo</button>
        </div>
      ) : (
        <table className="product-table orders-table">
          <thead>
            <tr>
              <th>N° Orden de Compra</th>
              <th>Fecha</th>
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
              <tr key={o.id} className="orders-row" onClick={() => viewOrder(o.id)}>
                <td>{o.orderNumber}</td>
                <td>{new Date(o.createdAt).toLocaleDateString('es-CL')}</td>
                <td>{getChannelLabel(o.channel)}</td>
                <td>{o.licitacionCode || '-'}</td>
                <td>{o.itemCount ?? '-'}</td>
                <td>${Number(o.total).toLocaleString('es-CL')}</td>
                <td>
                  <span className={`status-badge ${getOrderStatusClass(o.status)}`}>
                    {getOrderStatusLabel(o.status)}
                  </span>
                </td>
                <td><button className="table-btn">Ver</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {state.totalPages > 1 && (
        <div className="pagination">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button>
          <span>Página {page} de {state.totalPages}</span>
          <button disabled={page >= state.totalPages} onClick={() => setPage(page + 1)}>Siguiente</button>
        </div>
      )}
    </section>
  )
}
