import { useState } from 'react'
import { useAuth } from '../context/AuthContext.tsx'
import { register } from '../services/api.ts'

interface Props {
  onToggleLogin: () => void
}

export function RegisterView({ onToggleLogin }: Props) {
  const { setAuth } = useAuth()
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    companyName: '',
    companyRut: '',
    companyAddress: '',
    companyPhone: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!form.name.trim() || !form.email.trim() || !form.password || !form.companyName.trim()) {
      setError('Nombre, email, contraseña y nombre de empresa son requeridos')
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
      const res = await register({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        companyName: form.companyName.trim(),
        companyRut: form.companyRut.trim() || undefined,
        companyAddress: form.companyAddress.trim() || undefined,
        companyPhone: form.companyPhone.trim() || undefined,
      })
      setAuth(res.user, res.company, res.token)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-view">
      <div className="auth-card auth-card-wide">
        <h1>Registrar Empresa</h1>
        <p className="auth-subtitle">Crea tu cuenta de proveedor y comienza a cotizar</p>

        {error && <div className="form-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-section">
            <h4>Datos del Administrador</h4>
            <div className="form-grid">
              <div className="form-field">
                <label htmlFor="reg-name">Nombre completo *</label>
                <input id="reg-name" value={form.name} onChange={(e) => update('name', e.target.value)} />
              </div>
              <div className="form-field">
                <label htmlFor="reg-email">Email *</label>
                <input id="reg-email" type="email" value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="admin@empresa.cl" />
              </div>
              <div className="form-field">
                <label htmlFor="reg-password">Contraseña *</label>
                <input id="reg-password" type="password" value={form.password} onChange={(e) => update('password', e.target.value)} placeholder="Mínimo 8 caracteres" />
              </div>
              <div className="form-field">
                <label htmlFor="reg-confirm">Confirmar contraseña *</label>
                <input id="reg-confirm" type="password" value={form.confirmPassword} onChange={(e) => update('confirmPassword', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="form-section">
            <h4>Datos de la Empresa</h4>
            <div className="form-grid">
              <div className="form-field form-field-full">
                <label htmlFor="reg-company">Nombre de la empresa *</label>
                <input id="reg-company" value={form.companyName} onChange={(e) => update('companyName', e.target.value)} />
              </div>
              <div className="form-field">
                <label htmlFor="reg-rut">RUT</label>
                <input id="reg-rut" value={form.companyRut} onChange={(e) => update('companyRut', e.target.value)} placeholder="76.123.456-7" />
              </div>
              <div className="form-field">
                <label htmlFor="reg-phone">Teléfono</label>
                <input id="reg-phone" value={form.companyPhone} onChange={(e) => update('companyPhone', e.target.value)} placeholder="+56 9 1234 5678" />
              </div>
              <div className="form-field form-field-full">
                <label htmlFor="reg-address">Dirección</label>
                <input id="reg-address" value={form.companyAddress} onChange={(e) => update('companyAddress', e.target.value)} />
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
