import { useState } from 'react'
import { useAuth } from '../context/AuthContext.tsx'
import { registerCotizador } from '../services/api.ts'

interface Props {
  onToggleLogin: () => void
}

export function RegisterCotizadorView({ onToggleLogin }: Props) {
  const { setAuth } = useAuth()
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
    institution: '',
    position: '',
    rut: '',
    companyType: 'chilecompra',
  })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!form.name.trim() || !form.email.trim() || !form.password || !form.institution.trim()) {
      setError('Nombre, email, contraseña e institución son requeridos')
      return
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError('El formato del email no es válido')
      return
    }

    if (form.password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres')
      return
    }

    if (form.password !== form.confirmPassword) {
      setError('Las contraseñas no coinciden')
      return
    }

    setLoading(true)
    try {
      const res = await registerCotizador({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        phone: form.phone.trim() || undefined,
        institution: form.institution.trim(),
        position: form.position.trim() || undefined,
        rut: form.rut.trim() || undefined,
        companyType: form.companyType === 'chilecompra' ? 'chilecompra' : 'normal',
      })
      setAuth(res.user, res.customer ?? null, res.token)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-view">
      <div className="auth-card auth-card-wide">
        <h1>Crear Cuenta de Cotizador</h1>
        <p className="auth-subtitle">Regístrate para solicitar cotizaciones a proveedores</p>

        {error && <div className="form-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-section">
            <h4>Tipo de Comprador</h4>
            <div className="form-grid">
              <label className="radio-card">
                <input
                  type="radio"
                  name="companyType"
                  value="chilecompra"
                  checked={form.companyType === 'chilecompra'}
                  onChange={() => update('companyType', 'chilecompra')}
                />
                <div>
                  <strong>Comprador ChileCompra</strong>
                  <span>Compra con código de licitación ganada y lista de precios de Mercado Público.</span>
                </div>
              </label>
              <label className="radio-card">
                <input
                  type="radio"
                  name="companyType"
                  value="normal"
                  checked={form.companyType === 'normal'}
                  onChange={() => update('companyType', 'normal')}
                />
                <div>
                  <strong>Comprador Normal</strong>
                  <span>Compra con la lista de precios asignada a tu empresa.</span>
                </div>
              </label>
            </div>
          </div>

          <div className="form-section">
            <h4>Datos Personales</h4>
            <div className="form-grid">
              <div className="form-field">
                <label htmlFor="cot-name">Nombre completo *</label>
                <input id="cot-name" value={form.name} onChange={(e) => update('name', e.target.value)} />
              </div>
              <div className="form-field">
                <label htmlFor="cot-email">Email *</label>
                <input id="cot-email" type="email" value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="nombre@institucion.cl" />
              </div>
              <div className="form-field">
                <label htmlFor="cot-phone">Teléfono</label>
                <input id="cot-phone" value={form.phone} onChange={(e) => update('phone', e.target.value)} placeholder="+56 9 1234 5678" />
              </div>
              <div className="form-field">
                <label htmlFor="cot-position">Cargo</label>
                <input id="cot-position" value={form.position} onChange={(e) => update('position', e.target.value)} placeholder="Jefe de Compras" />
              </div>
              <div className="form-field">
                <label htmlFor="cot-password">Contraseña *</label>
                <input id="cot-password" type="password" value={form.password} onChange={(e) => update('password', e.target.value)} placeholder="Mínimo 8 caracteres" />
              </div>
              <div className="form-field">
                <label htmlFor="cot-confirm">Confirmar contraseña *</label>
                <input id="cot-confirm" type="password" value={form.confirmPassword} onChange={(e) => update('confirmPassword', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="form-section">
            <h4>Datos de la Institución</h4>
            <div className="form-grid">
              <div className="form-field form-field-full">
                <label htmlFor="cot-institution">Nombre de la institución *</label>
                <input id="cot-institution" value={form.institution} onChange={(e) => update('institution', e.target.value)} placeholder="Municipalidad de Santiago" />
              </div>
              <div className="form-field">
                <label htmlFor="cot-rut">RUT</label>
                <input id="cot-rut" value={form.rut} onChange={(e) => update('rut', e.target.value)} placeholder="76.123.456-7" />
              </div>
            </div>
          </div>

          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? 'Creando cuenta...' : 'Crear Cuenta'}
          </button>
        </form>

        <p className="auth-switch">
          ¿Ya tienes cuenta?{' '}
          <button type="button" onClick={onToggleLogin}>Iniciar sesión</button>
        </p>
      </div>
    </div>
  )
}
