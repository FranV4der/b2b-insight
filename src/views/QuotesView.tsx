import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext.tsx'
import { getQuotes, downloadQuotePdf, convertQuoteToOrder, type QuoteListItem } from '../services/api.ts'
import { buildWhatsAppLink, buildQuoteWhatsAppMessage } from '../utils/whatsapp.ts'
import type { QuoteItem } from '../types/quote.ts'
import { formatCLPWithSymbol } from '../utils/format.ts'

interface QuotesState {
  quotes: QuoteListItem[]
  loading: boolean
  error: string | null
  totalPages: number
}

const QUOTE_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  converted: 'Convertida en pedido',
}

function quoteTotalWithIva(total: string): number {
  const net = Number(total) || 0
  return Math.round(net + net * 0.19)
}

function isQuoteExpired(q: QuoteListItem): boolean {
  const raw = q.validUntil ?? new Date(new Date(q.createdAt).getTime() + 15 * 24 * 60 * 60 * 1000).toISOString()
  return new Date(raw).getTime() < Date.now()
}

function canConvert(q: QuoteListItem): boolean {
  return (q.status === 'pending' || q.status === 'approved') && !q.orderNumber && !isQuoteExpired(q)
}

export function QuotesView() {
  const { navigate, items } = useApp()
  const [page, setPage] = useState(1)
  const [state, setState] = useState<QuotesState>({
    quotes: [],
    loading: true,
    error: null,
    totalPages: 1,
  })
  const [downloading, setDownloading] = useState<number | null>(null)
  const [converting, setConverting] = useState<number | null>(null)
  const [convertError, setConvertError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await getQuotes({ page, perPage: 10 })
        if (!cancelled) {
          setState({
            quotes: res.data,
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
            error: e instanceof Error ? e.message : 'Error al cargar cotizaciones',
          }))
        }
      }
    }

    load()
    return () => { cancelled = true }
  }, [page, refreshKey])

  async function handleDownload(id: number) {
    setDownloading(id)
    try {
      const blob = await downloadQuotePdf(id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `cotizacion-${id}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'No se pudo descargar la cotización')
    } finally {
      setDownloading(null)
    }
  }

  async function handleConvert(id: number) {
    if (!confirm('¿Convertir esta cotización en una orden de compra? Se descontará stock y se usará tu crédito disponible.')) return
    setConverting(id)
    setConvertError(null)
    try {
      const res = await convertQuoteToOrder(id)
      alert(`Orden de compra ${res.orderNumber} creada correctamente.`)
      setRefreshKey((k) => k + 1)
    } catch (e: unknown) {
      setConvertError(e instanceof Error ? e.message : 'No se pudo convertir la cotización')
    } finally {
      setConverting(null)
    }
  }

  function handleWhatsApp(quote: QuoteListItem) {
    const quoteItems: QuoteItem[] = quote.items.map((it) => ({
      product: {
        id: it.productId,
        sku: it.sku,
        name: it.name,
        priceListPrice: String(it.unitPrice),
      } as QuoteItem['product'],
      quantity: it.quantity,
    }))
    const link = buildWhatsAppLink(
      quote.sellerPhone,
      buildQuoteWhatsAppMessage(quoteItems, quoteTotalWithIva(quote.total), quote.sellerName),
    )
    if (link) window.open(link, '_blank')
  }

  if (state.loading) {
    return <div className="loading">Cargando cotizaciones...</div>
  }

  if (state.error) {
    return <div className="form-error">{state.error}</div>
  }

  return (
    <section className="orders-view">
      <div className="orders-header">
        <h2>Mis Cotizaciones</h2>
        <p className="muted">Las cotizaciones que generas desde el carrito quedan guardadas aquí.</p>
      </div>

      {state.quotes.length === 0 ? (
        <div className="empty-state">
          <p>Aún no has generado cotizaciones.</p>
          <p className="empty-hint">
            Agrega productos al carrito y usa "Guardar Cotización" para dejar constancia y descargar el PDF.
          </p>
          <button onClick={() => navigate(items.length ? 'cart' : 'catalog')}>
            {items.length ? 'Ir a mi carrito' : 'Explorar catálogo'}
          </button>
        </div>
      ) : (
        <>
        {convertError && <div className="form-error">{convertError}</div>}
        <table className="product-table orders-table">
          <thead>
            <tr>
              <th>N°</th>
              <th>Fecha</th>
              <th>Válida hasta</th>
              <th>Canal</th>
              <th>Licitación</th>
              <th>Ítems</th>
              <th>Total (IVA incl.)</th>
              <th>Estado</th>
              <th>OC</th>
              <th>Vendedor</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {state.quotes.map((q) => (
              <tr key={q.id}>
                <td>#{q.id}</td>
                <td>{new Date(q.createdAt).toLocaleDateString('es-CL')}</td>
                <td>{q.validUntil ? new Date(q.validUntil).toLocaleDateString('es-CL') : '-'}</td>
                <td>{q.userType === 'chilecompra' ? 'ChileCompra' : 'Convenio Marco'}</td>
                <td>{q.licitacionCode || '-'}</td>
                <td>{q.items.reduce((sum, it) => sum + it.quantity, 0)}</td>
                <td>{formatCLPWithSymbol(quoteTotalWithIva(q.total))}</td>
                <td>
                  <span className={`status-badge ${q.status === 'approved' ? 'status-active' : q.status === 'rejected' ? 'status-inactive' : 'status-pending'}`}>
                    {isQuoteExpired(q) && q.status !== 'converted' ? 'Expirada' : QUOTE_STATUS_LABELS[q.status] ?? q.status}
                  </span>
                </td>
                <td>{q.orderNumber || '-'}</td>
                <td>{q.sellerName || '-'}</td>
                <td className="actions-cell">
                  <button
                    className="table-btn"
                    onClick={() => handleDownload(q.id)}
                    disabled={downloading === q.id}
                  >
                    {downloading === q.id ? 'Generando...' : 'PDF'}
                  </button>
                  {q.sellerPhone && (
                    <button className="table-btn" onClick={() => handleWhatsApp(q)}>
                      WhatsApp
                    </button>
                  )}
                  {canConvert(q) && (
                    <button
                      className="table-btn"
                      onClick={() => handleConvert(q.id)}
                      disabled={converting === q.id}
                    >
                      {converting === q.id ? 'Generando...' : 'Generar OC'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </>
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