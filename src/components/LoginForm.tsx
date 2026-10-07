import { useState } from 'react'
import { useAuth } from '../context/AuthContext.tsx'
import { login } from '../services/api.ts'

interface Props {
  onSuccess?: () => void
  onRegisterEmpresa?: () => void
  onRegisterCotizador?: () => void
}

export function LoginForm({ onSuccess, onRegisterEmpresa, onRegisterCotizador }: Props) {
  const { setAuth } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!email.trim() || !password) {
      setError('Email y contraseña son requeridos')
      return
    }

    setLoading(true)
    try {
      const res = await login(email.trim(), password)
      setAuth(res.user, res.customer ?? null, res.token)
      onSuccess?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <h3>Iniciar sesión</h3>

      {error && <div className="form-error">{error}</div>}

      <div className="form-field">
        <label htmlFor="login-email">Email</label>
        <input
          id="login-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@empresa.cl"
          autoComplete="email"
        />
      </div>

      <div className="form-field">
        <label htmlFor="login-password">Contraseña</label>
        <input
          id="login-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          autoComplete="current-password"
        />
      </div>

      <button type="submit" className="auth-submit" disabled={loading}>
        {loading ? 'Ingresando...' : 'Ingresar'}
      </button>

      {(onRegisterEmpresa || onRegisterCotizador) && (
        <div className="login-form-links">
          {onRegisterEmpresa && (
            <button type="button" onClick={onRegisterEmpresa}>Registrar mi empresa</button>
          )}
          {onRegisterCotizador && (
            <button type="button" onClick={onRegisterCotizador}>Crear cuenta de cotizador</button>
          )}
        </div>
      )}
    </form>
  )
}
