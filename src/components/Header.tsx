import { useEffect, useState } from 'react'
import type { Category } from '../types/product.ts'
import { getCategories, searchProducts, type ProductSuggestion } from '../services/api.ts'
import { useApp } from '../context/AppContext.tsx'
import { useAuth } from '../context/AuthContext.tsx'
import { NotificationBell } from './NotificationBell.tsx'
import { LoginForm } from './LoginForm.tsx'

export type RegisterMode = 'register-empresa' | 'register-cotizador'

interface Props {
  onOpenRegister: (mode: RegisterMode) => void
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  empresa: 'Empresa',
  cotizador: 'Cotizador',
}

export function Header({ onOpenRegister }: Props) {
  const { userType, items, navigate, setUserType, view, storeSearch, setStoreSearch, storeCategory, setStoreCategory } = useApp()
  const { user, customer, logout, isEmpresa, isAdmin } = useAuth()
  const [loginOpen, setLoginOpen] = useState(false)
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [categories, setCategories] = useState<Category[]>([])
  const [suggestions, setSuggestions] = useState<ProductSuggestion[]>([])
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0)
  const canManage = isEmpresa || isAdmin
  const isBuyer = !!user && !canManage
  const canToggleProfile = isBuyer && customer?.type === 'both'
  const showSearch = !canManage && (view === 'home' || view === 'product-detail')

  useEffect(() => {
    let cancelled = false
    const t = setTimeout(() => {
      const q = storeSearch.trim()
      if (cancelled) return
      if (!q || q.length < 2) {
        setSuggestions([])
        setSuggestionsOpen(false)
        return
      }
      searchProducts(q)
        .then((rows) => {
          if (!cancelled) {
            setSuggestions(rows)
            setSuggestionsOpen(rows.length > 0)
          }
        })
        .catch(() => {})
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [storeSearch])

  useEffect(() => {
    let cancelled = false
    getCategories()
      .then((rows) => { if (!cancelled) setCategories(rows) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const selectCategory = (categoryId: number | null) => {
    setStoreCategory(categoryId)
    setCategoryOpen(false)
    navigate('home')
  }

  return (
    <header className="app-header">
      <div className="header-left">
        <button className="logo-btn" onClick={() => navigate(canManage ? 'dashboard' : 'home')}>
          <h1>insight<b>B2B</b></h1>
        </button>

        {canManage ? (
          <nav className="header-nav header-nav-admin">
            <button
              className={`nav-link${view === 'dashboard' ? ' active' : ''}`}
              onClick={() => navigate('dashboard')}
            >
              Dashboard
            </button>
            <button
              className={`nav-link${view === 'admin' ? ' active' : ''}`}
              onClick={() => navigate('admin')}
            >
              Panel de Administración
            </button>
          </nav>
        ) : (
          <nav className="header-nav">
            <button
              className={`nav-link${view === 'home' ? ' active' : ''}`}
              onClick={() => navigate('home')}
            >
              Inicio
            </button>

            <div className="categories-menu">
              <button
                className={`nav-link${storeCategory != null ? ' active' : ''}`}
                onClick={() => setCategoryOpen((open) => !open)}
              >
                Categorías
              </button>
              {categoryOpen && (
                <div className="categories-dropdown">
                  <button
                    className={storeCategory == null ? 'selected' : undefined}
                    onClick={() => selectCategory(null)}
                  >
                    Todas
                  </button>
                  {categories.map((category) => (
                    <button
                      key={category.id}
                      className={storeCategory === category.id ? 'selected' : undefined}
                      onClick={() => selectCategory(category.id)}
                    >
                      {storeCategory === category.id ? '✓ ' : ''}{category.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {user && (
              <button
                className={`nav-link${view === 'orders' ? ' active' : ''}`}
                onClick={() => navigate('orders')}
              >
                Órdenes
              </button>
            )}
            {user && (
              <button
                className={`nav-link${view === 'quotes' ? ' active' : ''}`}
                onClick={() => navigate('quotes')}
              >
                Cotizaciones
              </button>
            )}
          </nav>
        )}
      </div>

      {showSearch && (
        <div className="header-search-wrap">
          <form className="header-search" onSubmit={(e) => { e.preventDefault(); navigate('home') }}>
            <input
              type="text"
              placeholder="Buscar por nombre o SKU..."
              value={storeSearch}
              onChange={(e) => { setStoreSearch(e.target.value); setSuggestionsOpen(true) }}
              onFocus={() => { if (suggestions.length) setSuggestionsOpen(true) }}
              onBlur={() => setTimeout(() => setSuggestionsOpen(false), 150)}
            />
          </form>
          {suggestionsOpen && suggestions.length > 0 && (
            <ul className="search-suggestions">
              {suggestions.map((sugg) => (
                <li key={sugg.id}>
                  <button
                    onMouseDown={(e) => { e.preventDefault(); setStoreSearch(sugg.name); setSuggestionsOpen(false); navigate('home') }}
                  >
                    <span className="sugg-name">{sugg.name}</span>
                    <span className="sugg-sku">SKU {sugg.sku}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="header-right">
        {user && isBuyer && (
          canToggleProfile ? (
            <div className="profile-toggle">
              <button
                className={userType === 'mercadopublico' ? undefined : 'active'}
                onClick={() => setUserType('general')}
              >
                Compra Normal
              </button>
              <button
                className={userType === 'mercadopublico' ? 'active' : undefined}
                onClick={() => setUserType('mercadopublico')}
              >
                ChileCompra
              </button>
            </div>
          ) : (
            <span className="user-badge">
              {customer?.type === 'chilecompra' ? 'ChileCompra' : 'Compra Normal'}
            </span>
          )
        )}

        {user && isBuyer && (
          <button onClick={() => navigate('cart')} className="quote-btn">
            Carrito {itemCount > 0 && <span className="badge">{itemCount}</span>}
          </button>
        )}

        {!user && (
          <div className="login-menu">
            <button className="login-btn" onClick={() => setLoginOpen((open) => !open)}>
              Iniciar sesión
            </button>
            {loginOpen && (
              <div className="login-dropdown">
                <LoginForm
                  onSuccess={() => setLoginOpen(false)}
                  onRegisterEmpresa={() => { setLoginOpen(false); onOpenRegister('register-empresa') }}
                  onRegisterCotizador={() => { setLoginOpen(false); onOpenRegister('register-cotizador') }}
                />
              </div>
            )}
          </div>
        )}

        {user && <NotificationBell />}

        {user && (
          <div className="user-session">
            <span className="session-name">{user.name}</span>
            {customer && <span className="session-company">{customer.name}</span>}
            <span className="session-role">{ROLE_LABELS[user.role] ?? 'Cotizador'}</span>
            <button className="logout-btn" onClick={logout}>Salir</button>
          </div>
        )}
      </div>
    </header>
  )
}