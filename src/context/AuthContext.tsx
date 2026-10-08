import { createContext, useContext, useState, useEffect, useCallback, type Dispatch, type SetStateAction, type ReactNode } from 'react'
import type { AuthUser, AuthCustomer } from '../types/auth.ts'
import { getMe } from '../services/api.ts'

interface AuthState {
  user: AuthUser | null
  /** Vendedor del usuario (`empresa` / `admin`). */
  company: AuthCustomer | null
  /** Comprador del usuario (`cotizador`). */
  customer: AuthCustomer | null
  token: string | null
  loading: boolean
}

interface AuthContextType extends AuthState {
  setAuth: (user: AuthUser, customer: AuthCustomer | null, token: string) => void
  logout: () => void
  isAdmin: boolean
  isEmpresa: boolean
  isCotizador: boolean
  /** Visibilidad del dropdown de login. Fuera de AuthState para que setAuth/logout no lo reinicien. */
  loginOpen: boolean
  setLoginOpen: Dispatch<SetStateAction<boolean>>
}

const AuthContext = createContext<AuthContextType | null>(null)

function getInitialToken(): string | null {
  return localStorage.getItem('token')
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const initialToken = getInitialToken()
  const [state, setState] = useState<AuthState>({
    user: null,
    company: null,
    customer: null,
    token: initialToken,
    loading: !!initialToken,
  })

  useEffect(() => {
    if (!initialToken) return

    let cancelled = false
    getMe()
      .then(({ user, company, customer }) => {
        if (!cancelled) {
          setState({ user, company, customer, token: initialToken, loading: false })
        }
      })
      .catch(() => {
        if (!cancelled) {
          localStorage.removeItem('token')
          setState({ user: null, company: null, customer: null, token: null, loading: false })
        }
      })

    return () => { cancelled = true }
  }, [initialToken])

  const setAuth = useCallback((user: AuthUser, customer: AuthCustomer | null, token: string) => {
    localStorage.setItem('token', token)
    setState({ user, company: null, customer, token, loading: false })
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('token')
    setState({ user: null, company: null, customer: null, token: null, loading: false })
  }, [])

  const isAdmin = state.user?.role === 'admin'
  const isEmpresa = state.user?.role === 'empresa'
  const isCotizador = state.user?.role === 'cotizador'

  const [loginOpen, setLoginOpen] = useState(false)

  return (
    <AuthContext.Provider
      value={{ ...state, setAuth, logout, isAdmin, isEmpresa, isCotizador, loginOpen, setLoginOpen }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
