import { useEffect, useState } from 'react'
import { getCustomers, updateCustomer, getPriceLists } from '../services/api.ts'
import type { CustomerAdminItem } from '../services/api.ts'
import type { PriceList, CompanyType } from '../types/auth.ts'

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  active: 'Activo',
  suspended: 'Suspendido',
}

const PAYMENT_TERMS_LABELS: Record<string, string> = {
  contado: 'De contado',
  '30': '30 días',
  '60': '60 días',
  '90': '90 días',
}

const CHANNEL_LABELS: Record<CompanyType, string> = {
  normal: 'Compra normal',
  chilecompra: 'ChileCompra',
  both: 'Ambos',
}

interface FormState {
  kind: 'persona' | 'empresa'
  name: string
  rut: string
  email: string
  phone: string
  address: string
  commune: string
  region: string
  billingAddress: string
  billingCommune: string
  billingRegion: string
  type: CompanyType
  paymentTerms: string
  priceListId: string
  creditLimit: string
  status: string
}

function toForm(c: CustomerAdminItem): FormState {
  return {
    kind: c.kind,
    name: c.name,
    rut: c.rut ?? '',
    email: c.email ?? '',
    phone: c.phone ?? '',
    address: c.address ?? '',
    commune: c.commune ?? '',
    region: c.region ?? '',
    billingAddress: c.billingAddress ?? '',
    billingCommune: c.billingCommune ?? '',
    billingRegion: c.billingRegion ?? '',
    type: c.type,
    paymentTerms: c.paymentTerms ?? '',
    priceListId: c.priceListId?.toString() ?? '',
    creditLimit: c.creditLimit ?? '0',
    status: c.status,
  }
}

function CustomerRow({
  customer,
  priceLists,
  onSave,
}: {
  customer: CustomerAdminItem
  priceLists: PriceList[]
  onSave: () => void
}) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [f, setF] = useState<FormState>(() => toForm(customer))

  const set = (k: keyof FormState) => (e: { target: { value: string } }) =>
    setF((p) => ({ ...p, [k]: e.target.value }))

  async function save() {
    setSaving(true)
    setError('')
    try {
      await updateCustomer(customer.id, {
        ...f,
        rut: f.rut || null,
        priceListId: f.priceListId ? Number(f.priceListId) : null,
        creditLimit: f.creditLimit || '0',
        paymentTerms: (f.paymentTerms || null) as CustomerAdminItem['paymentTerms'],
        billingAddress: f.billingAddress || null,
        billingCommune: f.billingCommune || null,
        billingRegion: f.billingRegion || null,
      })
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
          <strong>{customer.name}</strong>
          <div className="muted">{customer.kind === 'persona' ? 'Persona natural' : 'Empresa'}</div>
        </td>
        <td>{customer.rut ?? '-'}</td>
        <td>{CHANNEL_LABELS[customer.type]}</td>
        <td>{customer.priceListId ?? '-'}</td>
        <td>${customer.creditLimit}</td>
        <td>{customer.paymentTerms ? PAYMENT_TERMS_LABELS[customer.paymentTerms] : '-'}</td>
        <td>
          <span className={`badge-${customer.status}`}>{STATUS_LABELS[customer.status] ?? customer.status}</span>
        </td>
        <td>
          <button className="btn-sm" onClick={() => setOpen((o) => !o)}>
            {open ? 'Cerrar' : 'Editar'}
          </button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={8}>
            {error && <p className="form-error">{error}</p>}
            <div className="form-grid">
              <label>
                Tipo
                <select value={f.kind} onChange={set('kind')}>
                  <option value="empresa">Empresa</option>
                  <option value="persona">Persona natural</option>
                </select>
              </label>
              <label>
                Nombre / Razón social
                <input value={f.name} onChange={set('name')} />
              </label>
              <label>
                RUT
                <input value={f.rut} onChange={set('rut')} placeholder="12345678-5" />
              </label>
              <label>
                Email
                <input value={f.email} onChange={set('email')} />
              </label>
              <label>
                Teléfono
                <input value={f.phone} onChange={set('phone')} />
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
                Canal de compra
                <select value={f.type} onChange={set('type')}>
                  <option value="normal">Compra normal</option>
                  <option value="chilecompra">ChileCompra</option>
                  <option value="both">Ambos</option>
                </select>
              </label>
              <label>
                Lista de precio
                <select value={f.priceListId} onChange={set('priceListId')}>
                  <option value="">Sin asignar</option>
                  {priceLists.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Límite de crédito
                <input value={f.creditLimit} onChange={set('creditLimit')} />
              </label>
              <label>
                Condición de pago
                <select value={f.paymentTerms} onChange={set('paymentTerms')}>
                  <option value="">Sin condición</option>
                  <option value="contado">De contado</option>
                  <option value="30">30 días</option>
                  <option value="60">60 días</option>
                  <option value="90">90 días</option>
                </select>
              </label>
              <label>
                Dirección de facturación
                <input value={f.billingAddress} onChange={set('billingAddress')} placeholder="Si difiere de la de envío" />
              </label>
              <label>
                Comuna (facturación)
                <input value={f.billingCommune} onChange={set('billingCommune')} />
              </label>
              <label>
                Región (facturación)
                <input value={f.billingRegion} onChange={set('billingRegion')} />
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
              {saving ? 'Guardando...' : 'Guardar comprador'}
            </button>
          </td>
        </tr>
      )}
    </>
  )
}

/** Gestión de compradores: personas naturales y organizaciones que compran catálogo. */
export function CustomersManager() {
  const [search, setSearch] = useState('')
  const [data, setData] = useState<{
    key: string
    rows: CustomerAdminItem[]
    priceLists: PriceList[]
    error: string
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([getCustomers({ search: search || undefined }), getPriceLists().catch(() => [])])
      .then(([rows, priceLists]) => {
        if (!cancelled) setData({ key: search, rows, priceLists, error: '' })
      })
      .catch((e) => {
        if (cancelled) return
        setData({ key: search, rows: [], priceLists: [], error: e instanceof Error ? e.message : 'Error al cargar' })
      })
    return () => { cancelled = true }
  }, [search])

  const loading = data?.key !== search
  const rows = data?.rows ?? []
  const priceLists = data?.priceLists ?? []
  const error = data?.error ?? ''

  if (loading) return <p className="muted">Cargando compradores...</p>
  if (error) return <p className="form-error">{error}</p>

  return (
    <div className="admin-panel">
      <h3>Compradores</h3>
      <p className="muted">Personas naturales y organizaciones que compran en la plataforma.</p>
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
            <th>Comprador</th>
            <th>RUT</th>
            <th>Canal</th>
            <th>Lista</th>
            <th>Crédito</th>
            <th>Pago</th>
            <th>Estado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <CustomerRow key={c.id} customer={c} priceLists={priceLists} onSave={() => setData((p) => (p ? { ...p, rows: [...p.rows] } : p))} />
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={8} className="muted">No hay compradores registrados.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
