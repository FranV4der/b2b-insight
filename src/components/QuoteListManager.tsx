import { useEffect, useState } from 'react'
import { getQuotes, downloadQuotePdf, updateQuoteStatus, type QuoteListItem } from '../services/api.ts'

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  converted: 'Convertida en pedido',
}

const STATUS_OPTIONS = ['pending', 'approved', 'rejected', 'converted'] as const

export function QuoteListManager() {
  const [data, setData] = useState<{
    key: number
    rows: QuoteListItem[]
    error: string
  } | null>(null)
  const [downloading, setDownloading] = useState<number | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    getQuotes({ perPage: 50 })
      .then((res) => { if (!cancelled) setData({ key: Date.now(), rows: res.data, error: '' }) })
      .catch((e) => {
        if (cancelled) return
        setData({ key: Date.now(), rows: [], error: e instanceof Error ? e.message : 'Error al cargar' })
      })
    return () => { cancelled = true }
  }, [])

  const loading = !data
  const rows = data?.rows ?? []
  const loadError = data?.error ?? ''

  async function handleDownload(id: number) {
    setDownloading(id)
    setError('')
    try {
      const blob = await downloadQuotePdf(id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `cotizacion-${id}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo descargar la cotización')
    } finally {
      setDownloading(null)
    }
  }

  async function handleStatus(id: number, status: string) {
    setError('')
    try {
      await updateQuoteStatus(id, status)
      setData((prev) =>
        prev ? { ...prev, rows: prev.rows.map((r) => (r.id === id ? { ...r, status } : r)) } : prev,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al actualizar el estado')
    }
  }

  if (loading) return <p className="muted">Cargando cotizaciones...</p>
  if (loadError) return <p className="form-error">{loadError}</p>

  return (
    <div className="admin-panel">
      <h3>Cotizaciones recibidas</h3>
      {error && <p className="form-error">{error}</p>}
      {rows.length === 0 ? (
        <p className="muted">Aún no has recibido cotizaciones.</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>N°</th>
              <th>Cliente</th>
              <th>Canal</th>
              <th>Total (neto)</th>
              <th>Estado</th>
              <th>Fecha</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((q) => (
              <tr key={q.id}>
                <td>#{q.id}</td>
                <td>{q.cotizanteName || q.cotizanteEmail || `Usuario #${q.userId ?? '-'}`}</td>
                <td>{q.userType === 'chilecompra' ? 'ChileCompra' : 'Convenio Marco'}
                  {q.licitacionCode ? ` (${q.licitacionCode})` : ''}
                </td>
                <td>${Number(q.total).toLocaleString('es-CL')}</td>
                <td>
                  <select
                    className={`status-select badge-${q.status}`}
                    value={q.status}
                    onChange={(e) => handleStatus(q.id, e.target.value)}
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                </td>
                <td>{new Date(q.createdAt).toLocaleDateString('es-CL')}</td>
                <td>
                  <button className="btn-sm" onClick={() => handleDownload(q.id)} disabled={downloading === q.id}>
                    {downloading === q.id ? '...' : 'Descargar PDF'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}