import { useState } from 'react'
import type { Product } from '../types/product.ts'
import { ProductForm } from '../components/ProductForm.tsx'
import { ProductTable } from '../components/ProductTable.tsx'
import { ExcelUploader } from '../components/ExcelUploader.tsx'
import { CategoryManager } from '../components/CategoryManager.tsx'
import { BrandManager } from '../components/BrandManager.tsx'
import { UserManagement } from '../components/UserManagement.tsx'
import { PriceListManager } from '../components/PriceListManager.tsx'
import { AdminOrders } from '../components/AdminOrders.tsx'
import { QuoteListManager } from '../components/QuoteListManager.tsx'
import { CompaniesManager } from '../components/CompaniesManager.tsx'
import { CompanyProfile } from '../components/CompanyProfile.tsx'
import { CustomersManager } from '../components/CustomersManager.tsx'
import { useAuth } from '../context/AuthContext.tsx'

type AdminTab = 'list' | 'create' | 'import' | 'categories' | 'brands' | 'users' | 'pricelists' | 'orders' | 'quotes' | 'companies' | 'customers'

export function AdminView() {
  const { isEmpresa, isAdmin } = useAuth()
  const canManage = isEmpresa || isAdmin
  const [tab, setTab] = useState<AdminTab>('list')
  const [editing, setEditing] = useState<Product | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  function refresh() {
    setRefreshKey((k) => k + 1)
  }

  function handleEdit(product: Product) {
    setEditing(product)
    setTab('create')
  }

  function handleSaved() {
    setEditing(null)
    setTab('list')
    refresh()
  }

  function handleCancel() {
    setEditing(null)
    setTab('list')
  }

  return (
    <section className="admin-view">
      <div className="admin-header">
        <h2>Panel de Administración</h2>
        <div className="admin-tabs">
          <button
            className={tab === 'list' ? 'tab-active' : ''}
            onClick={() => { setTab('list'); setEditing(null) }}
          >
            Productos
          </button>
          <button
            className={tab === 'create' && !editing ? 'tab-active' : ''}
            onClick={() => { setTab('create'); setEditing(null) }}
          >
            Nuevo Producto
          </button>
          <button
            className={tab === 'import' ? 'tab-active' : ''}
            onClick={() => setTab('import')}
          >
            Carga Masiva
          </button>
          {canManage && (
            <button
              className={tab === 'categories' ? 'tab-active' : ''}
              onClick={() => setTab('categories')}
            >
              Categorías
            </button>
          )}
          {canManage && (
            <button
              className={tab === 'brands' ? 'tab-active' : ''}
              onClick={() => setTab('brands')}
            >
              Marcas
            </button>
          )}
          {canManage && (
            <button
              className={tab === 'users' ? 'tab-active' : ''}
              onClick={() => setTab('users')}
            >
              Usuarios
            </button>
          )}
          {canManage && (
            <button
              className={tab === 'pricelists' ? 'tab-active' : ''}
              onClick={() => setTab('pricelists')}
            >
              Listas de Precio
            </button>
          )}
          {canManage && (
            <button
              className={tab === 'orders' ? 'tab-active' : ''}
              onClick={() => setTab('orders')}
            >
              Órdenes
            </button>
          )}
          {canManage && (
            <button
              className={tab === 'quotes' ? 'tab-active' : ''}
              onClick={() => setTab('quotes')}
            >
              Cotizaciones
            </button>
          )}
          {isAdmin && (
            <button
              className={tab === 'companies' ? 'tab-active' : ''}
              onClick={() => setTab('companies')}
            >
              Vendedores
            </button>
          )}
          {isEmpresa && !isAdmin && (
            <button
              className={tab === 'companies' ? 'tab-active' : ''}
              onClick={() => setTab('companies')}
            >
              Mi Empresa
            </button>
          )}
          {canManage && (
            <button
              className={tab === 'customers' ? 'tab-active' : ''}
              onClick={() => setTab('customers')}
            >
              Clientes
            </button>
          )}
        </div>
      </div>

      <div className="admin-content">
        {tab === 'list' && (
          <ProductTable onEdit={handleEdit} refreshKey={refreshKey} />
        )}
        {tab === 'create' && (
          <ProductForm product={editing} onSaved={handleSaved} onCancel={handleCancel} />
        )}
        {tab === 'import' && (
          <ExcelUploader onImported={refresh} />
        )}
        {tab === 'categories' && canManage && (
          <CategoryManager />
        )}
        {tab === 'brands' && canManage && (
          <BrandManager />
        )}
        {tab === 'users' && canManage && (
          <UserManagement />
        )}
        {tab === 'pricelists' && canManage && (
          <PriceListManager />
        )}
        {tab === 'orders' && canManage && (
          <AdminOrders />
        )}
        {tab === 'quotes' && canManage && (
          <QuoteListManager />
        )}
        {tab === 'companies' && isAdmin && (
          <CompaniesManager />
        )}
        {tab === 'companies' && isEmpresa && !isAdmin && (
          <CompanyProfile />
        )}
        {tab === 'customers' && canManage && (
          <CustomersManager />
        )}
      </div>
    </section>
  )
}
