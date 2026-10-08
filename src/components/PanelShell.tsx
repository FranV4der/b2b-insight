import { useState, type ReactNode } from 'react'
import { useApp } from '../context/AppContext.tsx'
import { useAuth } from '../context/AuthContext.tsx'
import type { AdminTab } from '../types/panel.ts'

type IconName =
  | 'dashboard' | 'package' | 'plus' | 'upload' | 'folder' | 'tag'
  | 'cart' | 'file' | 'dollar' | 'users' | 'building' | 'userCheck'
  | 'menu' | 'close' | 'logout'

const ICONS: Record<IconName, ReactNode> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </>
  ),
  package: (
    <>
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </>
  ),
  plus: (
    <>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </>
  ),
  upload: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m17 8-5-5-5 5" />
      <path d="M12 3v12" />
    </>
  ),
  folder: (
    <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
  ),
  tag: (
    <>
      <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
      <circle cx="7.5" cy="7.5" r=".5" fill="currentColor" />
    </>
  ),
  cart: (
    <>
      <circle cx="8" cy="21" r="1" />
      <circle cx="19" cy="21" r="1" />
      <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
    </>
  ),
  file: (
    <>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
      <path d="M10 9H8" />
    </>
  ),
  dollar: (
    <>
      <path d="M12 2v20" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  building: (
    <>
      <rect width="16" height="20" x="4" y="2" rx="2" />
      <path d="M9 22v-4h6v4" />
      <path d="M8 6h.01" />
      <path d="M16 6h.01" />
      <path d="M12 6h.01" />
      <path d="M12 10h.01" />
      <path d="M12 14h.01" />
      <path d="M16 10h.01" />
      <path d="M16 14h.01" />
      <path d="M8 10h.01" />
      <path d="M8 14h.01" />
    </>
  ),
  userCheck: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="m16 11 2 2 4-4" />
    </>
  ),
  menu: (
    <>
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h16" />
    </>
  ),
  close: (
    <>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </>
  ),
  logout: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </>
  ),
}

function Icon({ name }: { name: IconName }) {
  return (
    <svg
      className="nav-icon"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  )
}

interface NavItem {
  label: string
  icon: IconName
  tab?: AdminTab
  dashboard?: boolean
}

interface NavSection {
  title?: string
  items: NavItem[]
}

interface Props {
  children: ReactNode
}

export function PanelShell({ children }: Props) {
  const { view, adminTab, gotoAdmin, navigate } = useApp()
  const { user, logout, isAdmin } = useAuth()
  const [drawerOpen, setDrawerOpen] = useState(false)

  const onDashboard = view === 'dashboard'

  function select(item: NavItem) {
    setDrawerOpen(false)
    if (item.dashboard) navigate('dashboard')
    else if (item.tab) gotoAdmin(item.tab)
  }

  const sections: NavSection[] = [
    { items: [{ label: 'Dashboard', icon: 'dashboard', dashboard: true }] },
    {
      title: 'Catálogo',
      items: [
        { label: 'Productos', icon: 'package', tab: 'list' },
        { label: 'Nuevo Producto', icon: 'plus', tab: 'create' },
        { label: 'Carga Masiva', icon: 'upload', tab: 'import' },
        { label: 'Categorías', icon: 'folder', tab: 'categories' },
        { label: 'Marcas', icon: 'tag', tab: 'brands' },
      ],
    },
    {
      title: 'Ventas',
      items: [
        { label: 'Órdenes', icon: 'cart', tab: 'orders' },
        { label: 'Cotizaciones', icon: 'file', tab: 'quotes' },
      ],
    },
    {
      title: 'Comercial',
      items: [
        { label: 'Listas de Precio', icon: 'dollar', tab: 'pricelists' },
        { label: 'Clientes', icon: 'userCheck', tab: 'customers' },
      ],
    },
    {
      title: 'Cuenta',
      items: [
        { label: 'Usuarios', icon: 'users', tab: 'users' },
        { label: isAdmin ? 'Vendedores' : 'Mi Empresa', icon: 'building', tab: 'companies' },
      ],
    },
  ]

  function isCurrent(item: NavItem): boolean {
    if (item.dashboard) return onDashboard
    return !onDashboard && item.tab === adminTab
  }

  return (
    <>
      <button
        type="button"
        className="panel-menu-btn"
        onClick={() => setDrawerOpen((o) => !o)}
        aria-label={drawerOpen ? 'Cerrar menú' : 'Abrir menú'}
        aria-expanded={drawerOpen}
      >
        <Icon name={drawerOpen ? 'close' : 'menu'} />
      </button>

      {drawerOpen && (
        <button
          type="button"
          className="panel-backdrop"
          aria-label="Cerrar menú"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      <aside className={`panel-sidebar${drawerOpen ? ' is-open' : ''}`}>
        <div className="panel-brand">
          <span className="panel-brand-mark">IB</span>
          <span className="panel-brand-text">
            <b>Panel de gestión</b>
            <small>insight-b2b</small>
          </span>
        </div>

        <nav className="panel-nav" aria-label="Secciones del panel">
          {sections.map((section, i) => (
            <div className="nav-section" key={section.title ?? `nav-${i}`}>
              {section.title && <span className="nav-section-title">{section.title}</span>}
              {section.items.map((item) => {
                const current = isCurrent(item)
                return (
                  <button
                    type="button"
                    key={item.label}
                    className={`nav-item${current ? ' is-active' : ''}`}
                    onClick={() => select(item)}
                    aria-current={current ? 'page' : undefined}
                  >
                    <Icon name={item.icon} />
                    <span>{item.label}</span>
                  </button>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="panel-user">
          <span className="panel-user-avatar" aria-hidden="true">
            {(user?.name || user?.email || '?').charAt(0).toUpperCase()}
          </span>
          <span className="panel-user-info">
            <b>{user?.name || 'Usuario'}</b>
            <small>{user?.email}</small>
          </span>
          <button type="button" className="panel-logout" onClick={logout} aria-label="Cerrar sesión">
            <Icon name="logout" />
          </button>
        </div>
      </aside>

      <div className="panel-main">{children}</div>
    </>
  )
}
