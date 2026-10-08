import { useEffect, useState } from 'react'
import { getCompanies, updateCompany } from '../services/api.ts'
import type { CompanyAdminItem } from '../services/api.ts'

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  active: 'Activo',
  suspended: 'Suspendido',
}

function SellerRow({ company, onSave }: { company: CompanyAdminItem; onSave: () => void }) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [f, setF] = useState({
    name: company.name,
    legalName: company.legalName ?? '',
    businessActivity: company.businessActivity ?? '',
    rut: company.rut ?? '',
    address: company.address ?? '',
    commune: company.commune ?? '',
    region: company.region ?? '',
    phone: company.phone ?? '',
    email: company.email ?? '',
    website: company.website ?? '',
    contactName: company.contactName ?? '',
    contactRole: company.contactRole ?? '',
    contactEmail: company.contactEmail ?? '',
    contactPhone: company.contactPhone ?? '',
    status: company.status,
  })

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }))

  async function save() {
    setSaving(true)
    setError('')
    try {
      await updateCompany(company.id, { ...f, rut: f.rut || null })
      setOpen(false)
      onSave()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <tr>
        <td>
          <strong>{company.name}</strong>
          {company.legalName && <div className="muted">{company.legalName}</div>}
        </td>
        <td>{company.rut ?? '-'}</td>
        <td>{company.contactName ?? '-'}</td>
        <td>
          <span className={`badge-${company.status}`}>{STATUS_LABELS[company.status] ?? company.status}</span>
        </td>
        <td>
          <button className="btn-sm" onClick={() => setOpen((o) => !o)}>
            {open ? 'Cerrar' : 'Editar'}
          </button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={5}>
            {error && <p className="form-error">{error}</p>}
            <div className="form-grid">
              <div className="form-field">
                <label>Nombre comercial</label>
                <input value={f.name} onChange={set('name')} />
              </div>
              <div className="form-field">
                <label>Razón social</label>
                <input value={f.legalName} onChange={set('legalName')} />
              </div>
              <div className="form-field">
                <label>RUT</label>
                <input value={f.rut} onChange={set('rut')} placeholder="12345678-5" />
              </div>
              <div className="form-field">
                <label>Giro</label>
                <input value={f.businessActivity} onChange={set('businessActivity')} />
              </div>
              <div className="form-field">
                <label>Dirección</label>
                <input value={f.address} onChange={set('address')} />
              </div>
              <div className="form-field">
                <label>Comuna</label>
                <input value={f.commune} onChange={set('commune')} />
              </div>
              <div className="form-field">
                <label>Región</label>
                <input value={f.region} onChange={set('region')} />
              </div>
              <div className="form-field">
                <label>Teléfono</label>
                <input value={f.phone} onChange={set('phone')} />
              </div>
              <div className="form-field">
                <label>Email</label>
                <input value={f.email} onChange={set('email')} type="email" />
              </div>
              <div className="form-field">
                <label>Sitio web</label>
                <input value={f.website} onChange={set('website')} placeholder="https://" />
              </div>
              <div className="form-field">
                <label>Contacto</label>
                <input value={f.contactName} onChange={set('contactName')} />
              </div>
              <div className="form-field">
                <label>Cargo del contacto</label>
                <input value={f.contactRole} onChange={set('contactRole')} />
              </div>
              <div className="form-field">
                <label>Email del contacto</label>
                <input value={f.contactEmail} onChange={set('contactEmail')} type="email" />
              </div>
              <div className="form-field">
                <label>Teléfono del contacto</label>
                <input value={f.contactPhone} onChange={set('contactPhone')} />
              </div>
              <div className="form-field">
                <label>Estado</label>
                <select value={f.status} onChange={set('status')}>
                  <option value="pending">Pendiente</option>
                  <option value="active">Activo</option>
                  <option value="suspended">Suspendido</option>
                </select>
              </div>
            </div>
            <button className="btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar vendedor'}
            </button>
          </td>
        </tr>
      )}
    </>
  )
}

/** Gestión de vendedores: las empresas que publican catálogo en la plataforma. */
export function CompaniesManager() {
  const [search, setSearch] = useState('')
  const [data, setData] = useState<{ key: string; rows: CompanyAdminItem[]; error: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    getCompanies({ search: search || undefined })
      .then((rows) => { if (!cancelled) setData({ key: search, rows, error: '' }) })
      .catch((e) => {
        if (!cancelled) setData({ key: search, rows: [], error: e instanceof Error ? e.message : 'Error al cargar' })
      })
    return () => { cancelled = true }
  }, [search])

  const loading = data?.key !== search
  const rows = data?.rows ?? []
  const error = data?.error ?? ''

  if (loading) return <p className="muted">Cargando vendedores...</p>
  if (error) return <p className="form-error">{error}</p>

  return (
    <div className="admin-panel">
      <h3>Vendedores</h3>
      <p className="muted">Empresas que publican catálogo. Los compradores se gestionan en la pestaña Clientes.</p>
      <input
        type="text"
        placeholder="Buscar por nombre, email o RUT..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="search-input"
      />
      <table className="admin-table">
        <thead>
          <tr>
            <th>Vendedor</th>
            <th>RUT</th>
            <th>Contacto</th>
            <th>Estado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <SellerRow key={c.id} company={c} onSave={() => setData((p) => (p ? { ...p, rows: [...p.rows] } : p))} />
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">No hay vendedores registrados.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
