import { useState } from 'react'
import { AppProvider, useApp } from './context/AppContext.tsx'
import { AuthProvider, useAuth } from './context/AuthContext.tsx'
import { Header, type RegisterMode } from './components/Header.tsx'
import { HomeView } from './views/HomeView.tsx'
import { CartView } from './views/CartView.tsx'
import { OrdersView } from './views/OrdersView.tsx'
import { OrderDetailView } from './views/OrderDetailView.tsx'
import { QuotesView } from './views/QuotesView.tsx'
import { AdminView } from './views/AdminView.tsx'
import { DashboardView } from './views/DashboardView.tsx'
import { ProductDetailView } from './views/ProductDetailView.tsx'
import { RegisterView } from './views/RegisterView.tsx'
import { RegisterCotizadorView } from './views/RegisterCotizadorView.tsx'
import './App.css'

function LoginRequired() {
  return (
    <section className="login-required">
      <h2>Debes iniciar sesión</h2>
      <p>Para acceder a esta sección, inicia sesión desde el menú superior.</p>
    </section>
  )
}

function AppMain() {
  const { view, navigate, setUserType } = useApp()
  const { user, isAdmin, isEmpresa, loading, company } = useAuth()
  const [authMode, setAuthMode] = useState<RegisterMode | null>(null)
  const [syncedUserId, setSyncedUserId] = useState<number | null>(null)

  if (user && user.id !== syncedUserId) {
    setSyncedUserId(user.id)
    setUserType(company?.type === 'chilecompra' ? 'mercadopublico' : 'general')
    setAuthMode(null)
  }

  const isManager = user != null && (isEmpresa || isAdmin)
  // Los administradores (plataforma y de empresa) operan sobre el panel de
  // gestión, no sobre el catálogo de compradores. Se les desvía al Dashboard.
  const BUYER_VIEWS = ['home', 'catalog', 'cart', 'orders', 'order-detail', 'product-detail', 'quotes'] as const
  if (isManager && (BUYER_VIEWS as readonly string[]).includes(view)) {
    navigate('dashboard')
  }
  // Fuera de sesión, las vistas de gestión quedan fuera de alcance.
  if (!user && (view === 'dashboard' || view === 'admin')) {
    navigate('home')
  }

  if (loading) {
    return (
      <div className="auth-loading">
        <div className="loading">Cargando...</div>
      </div>
    )
  }

  if (!user && authMode === 'register-empresa') {
    return <RegisterView onToggleLogin={() => setAuthMode(null)} />
  }

  if (!user && authMode === 'register-cotizador') {
    return <RegisterCotizadorView onToggleLogin={() => setAuthMode(null)} />
  }

  const requiresLogin = view === 'cart' || view === 'orders' || view === 'order-detail' || view === 'quotes' || view === 'dashboard' || view === 'admin'
  const isEmpresaView = view === 'dashboard' || view === 'admin'

  let content
  if (view === 'product-detail') {
    content = <ProductDetailView />
  } else if (requiresLogin && !user) {
    content = <LoginRequired />
  } else if (isEmpresaView && !isEmpresa && !isAdmin) {
    content = <HomeView />
  } else if (view === 'cart') {
    content = <CartView />
  } else if (view === 'orders') {
    content = <OrdersView />
  } else if (view === 'order-detail') {
    content = <OrderDetailView />
  } else if (view === 'quotes') {
    content = <QuotesView />
  } else if (view === 'dashboard') {
    content = <DashboardView />
  } else if (view === 'admin') {
    content = <AdminView />
  } else {
    content = <HomeView />
  }

  return (
    <>
      <Header onOpenRegister={setAuthMode} />
      <main>{content}</main>
    </>
  )
}

function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <AppMain />
      </AppProvider>
    </AuthProvider>
  )
}

export default App
