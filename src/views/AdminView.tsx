import { useState } from 'react'
import type { Product } from '../types/product.ts'
import type { AdminTab } from '../types/panel.ts'
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
import { useApp } from '../context/AppContext.tsx'

const TITLES: Record<AdminTab, string> = {
  list: 'Productos',
  create: 'Nuevo Producto',
  import: 'Carga Masiva',
  categories: 'Categorías',
  brands: 'Marcas',
  users: 'Usuarios',
  pricelists: 'Listas de Precio',
  orders: 'Órdenes',
  quotes: 'Cotizaciones',
  companies: 'Vendedores',
  customers: 'Clientes',
}

const SUBTITLES: Partial<Record<AdminTab, string>> = {
  list: 'Catálogo publicado y borradores',
  import: 'Crea o actualiza productos desde una planilla Excel',
  categories: 'Árbol de categorías del catálogo',
  brands: 'Marcas disponibles para filtrar',
  users: 'Usuarios del panel de gestión',
  pricelists: 'Precios por canal para cada comprador',
  orders: 'Pedidos que contienen tus productos',
  quotes: 'Cotizaciones recibidas de tus compradores',
  customers: 'Compradores que te atienden',
}

export function AdminView() {
  const { isEmpresa, isAdmin } = useAuth()
  const { adminTab, editingProduct, gotoAdmin, editProduct } = useApp()
  const canManage = isEmpresa || isAdmin
  const [refreshKey, setRefreshKey] = useState(0)

  function refresh() {
    setRefreshKey((k) => k + 1)
  }

  function handleEdit(product: Product) {
    editProduct(product)
  }

  function handleSaved() {
    gotoAdmin('list')
    refresh()
  }

  function handleCancel() {
    gotoAdmin('list')
  }

  const title = adminTab === 'create' && editingProduct ? 'Editar Producto' : TITLES[adminTab]
  const subtitle = adminTab === 'create' && editingProduct ? undefined : SUBTITLES[adminTab]

  return (
    <section className="admin-view">
      <header className="panel-heading">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </header>

      <div className="admin-content">
        {adminTab === 'list' && (
          <ProductTable onEdit={handleEdit} refreshKey={refreshKey} />
        )}
        {adminTab === 'create' && (
          <ProductForm product={editingProduct} onSaved={handleSaved} onCancel={handleCancel} />
        )}
        {adminTab === 'import' && (
          <ExcelUploader onImported={refresh} />
        )}
        {adminTab === 'categories' && canManage && (
          <CategoryManager />
        )}
        {adminTab === 'brands' && canManage && (
          <BrandManager />
        )}
        {adminTab === 'users' && canManage && (
          <UserManagement />
        )}
        {adminTab === 'pricelists' && canManage && (
          <PriceListManager />
        )}
        {adminTab === 'orders' && canManage && (
          <AdminOrders />
        )}
        {adminTab === 'quotes' && canManage && (
          <QuoteListManager />
        )}
        {adminTab === 'companies' && isAdmin && (
          <CompaniesManager />
        )}
        {adminTab === 'companies' && isEmpresa && !isAdmin && (
          <CompanyProfile />
        )}
        {adminTab === 'customers' && canManage && (
          <CustomersManager />
        )}
      </div>
    </section>
  )
}
