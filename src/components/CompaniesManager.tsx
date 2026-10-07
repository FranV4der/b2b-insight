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
              <label>
                Nombre comercial
                <input value={f.name} onChange={set('name')} />
              </label>
              <label>
                Razón social
                <input value={f.legalName} onChange={set('legalName')} />
              </label>
              <label>
                RUT
                <input value={f.rut} onChange={set('rut')} placeholder="12345678-5" />
              </label>
              <label>
                Giro
                <input value={f.businessActivity} onChange={set('businessActivity')} />
              </label>
              <label>
                Dirección
                <input value={f.address} onChange={set('address')} />
              </label>
              <label>
                Comuna
                <input value={f.commune} onChange={set('commune')} />
              </label>
              <label>
                Región
                <input value={f.region} onChange={set('region')} />
              </label>
              <label>
                Teléfono
                <input value={f.phone} onChange={set('phone')} />
              </label>
              <label>
                Email
                <input value={f.email} onChange={set('email')} />
              </label>
              <label>
                Sitio web
                <input value={f.website} onChange={set('website')} />
              </label>
              <label>
                Contacto
                <input value={f.contactName} onChange={set('contactName')} />
              </label>
              <label>
                Cargo del contacto
                <input value={f.contactRole} onChange={set('contactRole')} />
              </label>
              <label>
                Email del contacto
                <input value={f.contactEmail} onChange={set('contactEmail')} />
              </label>
              <label>
                Teléfono del contacto
                <input value={f.contactPhone} onChange={set('contactPhone')} />
              </label>
              <label>
                Estado
                <select value={f.status} onChange={set('status')}>
                  <option value="pending">Pendiente</option>
                  <option value="active">Activo</option>
                  <option value="suspended">Suspendido</option>
                </select>
              </label>
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
