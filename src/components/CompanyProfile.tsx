import { useEffect, useState, useRef } from 'react'
import { getCompanies, updateCompany, uploadCompanyLogo, type CompanyAdminItem } from '../services/api.ts'

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente de aprobación',
  active: 'Activo',
  suspended: 'Suspendido',
}

export function CompanyProfile() {
  const [form, setForm] = useState<CompanyAdminItem | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const logoInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    getCompanies()
      .then((rows) => {
        if (!cancelled) {
          const mine = rows[0]
          if (mine) setForm(mine)
          else setError('No se encontró tu empresa. Contacta al administrador de plataforma.')
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Error al cargar tu empresa')
      })
    return () => { cancelled = true }
  }, [])

  if (error) return <p className="form-error">{error}</p>
  if (!form) return <p className="muted">Cargando tu empresa...</p>

  const set = (k: string) => (e: { target: { value: string } }) => {
    setSaved(false)
    setForm((f) => (f ? { ...f, [k]: e.target.value } : f))
  }

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingLogo(true)
    setError('')
    setSaved(false)
    try {
      const res = await uploadCompanyLogo(file)
      setForm((f) => (f ? { ...f, logoUrl: res.logoUrl } : f))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al subir el logo')
    } finally {
      setUploadingLogo(false)
      if (logoInputRef.current) logoInputRef.current.value = ''
    }
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const payload = {
        name: form.name,
        legalName: form.legalName || null,
        businessActivity: form.businessActivity || null,
        rut: form.rut || null,
        address: form.address || null,
        commune: form.commune || null,
        region: form.region || null,
        phone: form.phone || null,
        email: form.email || null,
        website: form.website || null,
        logoUrl: form.logoUrl || null,
        contactName: form.contactName || null,
        contactRole: form.contactRole || null,
        contactEmail: form.contactEmail || null,
        contactPhone: form.contactPhone || null,
      }
      await updateCompany(form.id, payload)
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="admin-panel">
      <h3>Mi Empresa</h3>
      <p className="muted">
        Datos de tu vendedor. Estos aparecen en el catálogo y en las órdenes de compra.
      </p>

      <form onSubmit={save} className="product-form">
        <div className="form-section">
          <h4>Identificación</h4>
          <div className="form-grid">
            <label className="form-field">
              Nombre comercial *
              <input value={form.name} onChange={set('name')} required />
            </label>
            <label className="form-field">
              Razón social
              <input value={form.legalName ?? ''} onChange={set('legalName')} />
            </label>
            <label className="form-field">
              RUT
              <input value={form.rut ?? ''} onChange={set('rut')} placeholder="12345678-5" />
            </label>
            <label className="form-field">
              Giro
              <input value={form.businessActivity ?? ''} onChange={set('businessActivity')} />
            </label>
          </div>
          <div className="form-grid">
            <label className="form-field">
              Dirección
              <input value={form.address ?? ''} onChange={set('address')} />
            </label>
            <label className="form-field">
              Comuna
              <input value={form.commune ?? ''} onChange={set('commune')} />
            </label>
            <label className="form-field">
              Región
              <input value={form.region ?? ''} onChange={set('region')} />
            </label>
          </div>
        </div>

        <div className="form-section">
          <h4>Logo</h4>
          <div className="logo-upload">
            <input
              ref={logoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={handleLogoChange}
              hidden
            />
            {(form.logoUrl || uploadingLogo) ? (
              <div className="logo-preview">
                <img
                  src={uploadingLogo ? undefined : form.logoUrl ?? undefined}
                  className={uploadingLogo ? 'logo-preview-loading' : undefined}
                  alt="Logo de la empresa"
                />
                {uploadingLogo && <p className="muted">Subiendo logo...</p>}
                <button type="button" className="btn-sm" onClick={() => logoInputRef.current?.click()}>
                  Cambiar logo
                </button>
              </div>
            ) : (
              <button type="button" className="image-upload-zone" onClick={() => logoInputRef.current?.click()}>
                Subir logo de la empresa (JPG/PNG/WEBP, máx. 2MB)
              </button>
            )}
          </div>
        </div>

        <div className="form-section">
          <h4>Contacto y sitio web</h4>
          <div className="form-grid">
            <label className="form-field">
              Teléfono
              <input value={form.phone ?? ''} onChange={set('phone')} />
            </label>
            <label className="form-field">
              Email
              <input value={form.email ?? ''} onChange={set('email')} />
            </label>
            <label className="form-field">
              Sitio web
              <input value={form.website ?? ''} onChange={set('website')} placeholder="https://..." />
            </label>
            <label className="form-field">
              Persona de contacto
              <input value={form.contactName ?? ''} onChange={set('contactName')} />
            </label>
            <label className="form-field">
              Cargo del contacto
              <input value={form.contactRole ?? ''} onChange={set('contactRole')} />
            </label>
            <label className="form-field">
              Email del contacto
              <input value={form.contactEmail ?? ''} onChange={set('contactEmail')} />
            </label>
            <label className="form-field">
              Teléfono del contacto
              <input value={form.contactPhone ?? ''} onChange={set('contactPhone')} />
            </label>
          </div>
        </div>

        <div className="form-section">
          <h4>Estado</h4>
          <p>
            <span className={`badge-${form.status}`}>{STATUS_LABELS[form.status] ?? form.status}</span>{' '}
            <span className="muted">(solo el administrador de plataforma puede cambiarlo)</span>
          </p>
        </div>

        {error && <p className="form-error">{error}</p>}
        {saved && <p className="form-success">✓ Empresa actualizada.</p>}

        <div className="form-actions">
          <button type="submit" className="send-quote-btn" disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar Empresa'}
          </button>
        </div>
      </form>
    </div>
  )
}