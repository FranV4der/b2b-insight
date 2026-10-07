import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext.tsx'
import { useApp } from '../context/AppContext.tsx'
import { getQuoteStats } from '../services/api.ts'
import type { QuoteStats } from '../services/api.ts'

export function DashboardView() {
  const { company } = useAuth()
  const { navigate } = useApp()
  const [stats, setStats] = useState<QuoteStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getQuoteStats()
      .then((data) => { if (!cancelled) setStats(data) })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Error') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return <div className="loading">Cargando dashboard...</div>
  }

  if (error) {
    return <div className="form-error">{error}</div>
  }

  return (
    <section className="dashboard-view">
      <div className="dashboard-header">
        <div>
          <h2>Dashboard</h2>
          <p className="dashboard-subtitle">{company?.name}</p>
        </div>
        <div className="dashboard-actions">
          <button onClick={() => navigate('admin')}>Gestionar Productos</button>
        </div>
      </div>

      <div className="metric-cards">
        <div className="metric-card">
          <div className="metric-icon metric-icon-products">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
              <line x1="7" y1="7" x2="7.01" y2="7" />
            </svg>
          </div>
          <div className="metric-content">
            <span className="metric-value">{stats?.products.total ?? 0}</span>
            <span className="metric-label">Productos</span>
            <span className="metric-detail">{stats?.products.active ?? 0} activos</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon metric-icon-quotes">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          </div>
          <div className="metric-content">
            <span className="metric-value">{stats?.quotations.total ?? 0}</span>
            <span className="metric-label">Cotizaciones</span>
            <span className="metric-detail">{stats?.quotations.pending ?? 0} pendientes</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon metric-icon-clients">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <div className="metric-content">
            <span className="metric-value">{stats?.clients ?? 0}</span>
            <span className="metric-label">Clientes</span>
            <span className="metric-detail">cotizantes únicos</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon metric-icon-revenue">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="1" x2="12" y2="23" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          </div>
          <div className="metric-content">
            <span className="metric-value">${(stats?.revenue ?? 0).toLocaleString('es-CL')}</span>
            <span className="metric-label">Ingresos Potenciales</span>
            <span className="metric-detail">cotizaciones válidas</span>
          </div>
        </div>
      </div>

      <div className="dashboard-section">
        <div className="section-header">
          <h3>Cotizaciones Recientes</h3>
          <button onClick={() => navigate('admin')}>Ver todas</button>
        </div>

        {!stats?.recentQuotes.length ? (
          <div className="empty-state">
            <p>No hay cotizaciones recibidas aún.</p>
            <p className="empty-hint">Las cotizaciones aparecerán aquí cuando los clientes las envíen.</p>
          </div>
        ) : (
          <table className="product-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Cotizante</th>
                <th>Institución</th>
                <th>Tipo</th>
                <th>Licitación</th>
                <th>Total</th>
                <th>Estado</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentQuotes.map((q) => (
                <tr key={q.id}>
                  <td>{q.id}</td>
                  <td>{q.cotizanteName || '-'}</td>
                  <td>{q.cotizanteInstitution || '-'}</td>
                  <td>
                    <span className={`user-badge ${q.userType === 'mercadopublico' ? 'user-badge-alt' : ''}`}>
                      {q.userType === 'mercadopublico' ? 'Mercado Público' : 'Compra General'}
                    </span>
                  </td>
                  <td>{q.licitacionCode || '-'}</td>
                  <td>${Number(q.total).toLocaleString('es-CL')}</td>
                  <td>
                    <span className={`status-badge ${q.status === 'pending' ? 'status-pending' : q.status === 'accepted' ? 'status-active' : 'status-inactive'}`}>
                      {q.status === 'pending' ? 'Pendiente' : q.status === 'accepted' ? 'Aceptada' : 'Rechazada'}
                    </span>
                  </td>
                  <td>{new Date(q.createdAt).toLocaleDateString('es-CL')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}
