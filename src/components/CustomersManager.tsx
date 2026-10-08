import { useEffect, useState } from 'react'
import { getCustomers, updateCustomer, createCustomer, getPriceLists } from '../services/api.ts'
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

const CHANNEL_NAME: Record<'retail' | 'chilecompra', string> = {
  retail: 'Normal',
  chilecompra: 'ChileCompra',
}

const EMPTY_FORM = {
  kind: 'empresa' as 'persona' | 'empresa',
  name: '',
  rut: '',
  email: '',
  phone: '',
  address: '',
  commune: '',
  region: '',
  billingAddress: '',
  billingCommune: '',
  billingRegion: '',
  type: 'normal' as CompanyType,
  paymentTerms: '',
  retailPriceListId: '',
  chilecompraPriceListId: '',
  creditLimit: '0',
  status: 'pending',
  password: '',
}

type FormState = typeof EMPTY_FORM

function assignedChannelId(c: CustomerAdminItem, channel: 'retail' | 'chilecompra'): string {
  return c.priceLists?.find((p) => p.channel === channel)?.id?.toString() ?? ''
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
    retailPriceListId: assignedChannelId(c, 'retail'),
    chilecompraPriceListId: assignedChannelId(c, 'chilecompra'),
    creditLimit: c.creditLimit ?? '0',
    status: c.status,
    password: '',
  }
}

function priceListIdsFromForm(f: FormState): number[] {
  const ids: number[] = []
  if (f.retailPriceListId) ids.push(Number(f.retailPriceListId))
  if (f.chilecompraPriceListId) ids.push(Number(f.chilecompraPriceListId))
  return ids
}

function ListsCell({ customer }: { customer: CustomerAdminItem }) {
  const list = customer.priceLists ?? []
  if (!list.length) return <span className="muted">Sin asignar</span>
  return (
    <span>
      {list.map((p) => (
        <span key={`${p.channel}-${p.id}`} className="role-badge role-buyer" style={{ marginRight: 4 }}>
          {p.name} ({CHANNEL_NAME[p.channel]})
        </span>
      ))}
    </span>
  )
}

interface PriceListSelectsProps {
  value: Pick<FormState, 'retailPriceListId' | 'chilecompraPriceListId'>
  priceLists: PriceList[]
  setValue: (updates: Partial<Pick<FormState, 'retailPriceListId' | 'chilecompraPriceListId'>>) => void
}

function PriceListSelects({ value, priceLists, setValue }: PriceListSelectsProps) {
  const retail = priceLists.filter((p) => p.channel === 'retail')
  const mp = priceLists.filter((p) => p.channel === 'chilecompra')
  return (
    <>
      <div className="form-field">
        <label>Lista normal</label>
        <select
          value={value.retailPriceListId}
          onChange={(e) => setValue({ retailPriceListId: e.target.value })}
        >
          <option value="">Sin asignar</option>
          {retail.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div className="form-field">
        <label>Lista ChileCompra</label>
        <select
          value={value.chilecompraPriceListId}
          onChange={(e) => setValue({ chilecompraPriceListId: e.target.value })}
        >
          <option value="">Sin asignar</option>
          {mp.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
    </>
  )
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
        priceListIds: priceListIdsFromForm(f),
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
        <td><ListsCell customer={customer} /></td>
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
              <div className="form-field">
                <label>Tipo</label>
                <select value={f.kind} onChange={set('kind')}>
                  <option value="empresa">Empresa</option>
                  <option value="persona">Persona natural</option>
                </select>
              </div>
              <div className="form-field">
                <label>Nombre / Razón social</label>
                <input value={f.name} onChange={set('name')} />
              </div>
              <div className="form-field">
                <label>RUT</label>
                <input value={f.rut} onChange={set('rut')} placeholder="12345678-5" />
              </div>
              <div className="form-field">
                <label>Email</label>
                <input value={f.email} onChange={set('email')} />
              </div>
              <div className="form-field">
                <label>Teléfono</label>
                <input value={f.phone} onChange={set('phone')} />
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
                <label>Canal de compra</label>
                <select value={f.type} onChange={set('type')}>
                  <option value="normal">Compra normal</option>
                  <option value="chilecompra">ChileCompra</option>
                  <option value="both">Ambos</option>
                </select>
              </div>
              <PriceListSelects
                value={f}
                priceLists={priceLists}
                setValue={(updates) => setF((p) => ({ ...p, ...updates }))}
              />
              <div className="form-field">
                <label>Límite de crédito</label>
                <input value={f.creditLimit} onChange={set('creditLimit')} />
              </div>
              <div className="form-field">
                <label>Condición de pago</label>
                <select value={f.paymentTerms} onChange={set('paymentTerms')}>
                  <option value="">Sin condición</option>
                  <option value="contado">De contado</option>
                  <option value="30">30 días</option>
                  <option value="60">60 días</option>
                  <option value="90">90 días</option>
                </select>
              </div>
              <div className="form-field">
                <label>Dirección de facturación</label>
                <input value={f.billingAddress} onChange={set('billingAddress')} placeholder="Si difiere de la de envío" />
              </div>
              <div className="form-field">
                <label>Comuna (facturación)</label>
                <input value={f.billingCommune} onChange={set('billingCommune')} />
              </div>
              <div className="form-field">
                <label>Región (facturación)</label>
                <input value={f.billingRegion} onChange={set('billingRegion')} />
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
            <div className="admin-actions">
              <button className="btn-primary" onClick={save} disabled={saving}>
                {saving ? 'Guardando...' : 'Guardar comprador'}
              </button>
              <button className="btn-sm" onClick={() => setOpen(false)}>Cancelar</button>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function NewCustomerForm({
  priceLists,
  onCreated,
}: {
  priceLists: PriceList[]
  onCreated: () => void
}) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [f, setF] = useState<FormState>({ ...EMPTY_FORM })

  const set = (k: keyof FormState) => (e: { target: { value: string } }) =>
    setF((p) => ({ ...p, [k]: e.target.value }))

  async function create() {
    setSaving(true)
    setError('')
    try {
      await createCustomer({
        kind: f.kind,
        name: f.name,
        rut: f.rut || null,
        email: f.email || null,
        phone: f.phone || null,
        address: f.address || null,
        commune: f.commune || null,
        region: f.region || null,
        type: f.type,
        paymentTerms: (f.paymentTerms || null) as CustomerAdminItem['paymentTerms'],
        priceListIds: priceListIdsFromForm(f),
        creditLimit: f.creditLimit || '0',
        status: f.status,
      })
      setOpen(false)
      setF({ ...EMPTY_FORM })
      onCreated()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ marginBottom: '1rem' }}>
      <button className="send-quote-btn" onClick={() => setOpen((o) => !o)}>
        {open ? 'Cancelar' : '+ Nuevo comprador'}
      </button>
      {open && (
        <div className="user-form" style={{ marginTop: '0.75rem' }}>
          {error && <p className="form-error">{error}</p>}
          <div className="form-grid">
            <div className="form-field">
              <label>Tipo</label>
              <select value={f.kind} onChange={set('kind')}>
                <option value="empresa">Empresa</option>
                <option value="persona">Persona natural</option>
              </select>
            </div>
            <div className="form-field">
              <label>Nombre / Razón social *</label>
              <input value={f.name} onChange={set('name')} />
            </div>
            <div className="form-field">
              <label>RUT</label>
              <input value={f.rut} onChange={set('rut')} placeholder="12345678-5" />
            </div>
            <div className="form-field">
              <label>Email</label>
              <input value={f.email} onChange={set('email')} />
            </div>
            <div className="form-field">
              <label>Teléfono</label>
              <input value={f.phone} onChange={set('phone')} />
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
              <label>Canal de compra</label>
              <select value={f.type} onChange={set('type')}>
                <option value="normal">Compra normal</option>
                <option value="chilecompra">ChileCompra</option>
                <option value="both">Ambos</option>
              </select>
            </div>
            <PriceListSelects
              value={f}
              priceLists={priceLists}
              setValue={(updates) => setF((p) => ({ ...p, ...updates }))}
            />
            <div className="form-field">
              <label>Límite de crédito</label>
              <input value={f.creditLimit} onChange={set('creditLimit')} />
            </div>
            <div className="form-field">
              <label>Condición de pago</label>
              <select value={f.paymentTerms} onChange={set('paymentTerms')}>
                <option value="">Sin condición</option>
                <option value="contado">De contado</option>
                <option value="30">30 días</option>
                <option value="60">60 días</option>
                <option value="90">90 días</option>
              </select>
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
          <div className="admin-actions">
            <button className="btn-primary" onClick={create} disabled={saving || !f.name.trim()}>
              {saving ? 'Creando...' : 'Crear comprador'}
            </button>
          </div>
        </div>
      )}
    </div>
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
      <NewCustomerForm priceLists={priceLists} onCreated={() => setData((p) => (p ? { ...p, rows: [...p.rows] } : p))} />
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
            <th>Listas</th>
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