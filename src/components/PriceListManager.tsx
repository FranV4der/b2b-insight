import { useEffect, useState } from 'react'
import type { PriceList, PriceListDetail, PriceListItem } from '../types/auth.ts'
import type { Product } from '../types/product.ts'
import { getProducts } from '../services/api.ts'

const API_BASE = '/api'

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('token')
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options?.headers as Record<string, string> || {}),
  }
  const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error || `Error: ${res.status}`)
  }
  return res.json() as Promise<T>
}

export function PriceListManager() {
  const [lists, setLists] = useState<PriceList[]>([])
  const [selectedList, setSelectedList] = useState<PriceListDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newIsMp, setNewIsMp] = useState(false)
  const [products, setProducts] = useState<Product[]>([])

  async function loadLists() {
    setLoading(true)
    try {
      const data = await fetchApi<PriceList[]>('/price-lists')
      setLists(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar listas')
    } finally {
      setLoading(false)
    }
  }

  async function loadListDetail(id: number) {
    try {
      const data = await fetchApi<PriceListDetail>(`/price-lists/${id}`)
      setSelectedList(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar lista')
    }
  }

  async function loadAllProducts() {
    try {
      const res = await getProducts({ perPage: 1000 })
      setProducts(res.data)
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadLists()
    loadAllProducts()
  }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    try {
      await fetchApi('/price-lists', {
        method: 'POST',
        body: JSON.stringify({ name: newName.trim(), isMpPriceList: newIsMp }),
      })
      setNewName('')
      setNewIsMp(false)
      setShowForm(false)
      await loadLists()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear lista')
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('¿Eliminar esta lista de precio?')) return
    try {
      await fetchApi(`/price-lists/${id}`, { method: 'DELETE' })
      if (selectedList?.id === id) setSelectedList(null)
      await loadLists()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar lista')
    }
  }

  async function handleAddItems(items: Array<{ productId: number; price: number; discount?: number }>) {
    if (!selectedList) return
    try {
      await fetchApi(`/price-lists/${selectedList.id}/items`, {
        method: 'POST',
        body: JSON.stringify({ items }),
      })
      await loadListDetail(selectedList.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al agregar items')
    }
  }

  async function handleUpdateItem(itemId: number, price: number, discount: number) {
    try {
      await fetchApi(`/price-lists/items/${itemId}`, {
        method: 'PUT',
        body: JSON.stringify({ price, discount }),
      })
      if (selectedList) await loadListDetail(selectedList.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar item')
    }
  }

  async function handleDeleteItem(itemId: number) {
    if (!confirm('¿Eliminar este item?')) return
    try {
      await fetchApi(`/price-lists/items/${itemId}`, { method: 'DELETE' })
      if (selectedList) await loadListDetail(selectedList.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar item')
    }
  }

  if (loading) return <div className="loading">Cargando listas de precio...</div>

  return (
    <div className="user-management">
      <div className="user-mgmt-header">
        <h3>Listas de Precio</h3>
        <button className="send-quote-btn" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancelar' : '+ Nueva Lista'}
        </button>
      </div>

      {error && <div className="form-error">{error}</div>}

      {showForm && (
        <form className="user-form" onSubmit={handleCreate}>
          <div className="form-grid">
            <div className="form-field">
              <label>Nombre *</label>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ej: Lista Premium" />
            </div>
            <div className="form-field">
              <label>
                <input type="checkbox" checked={newIsMp} onChange={(e) => setNewIsMp(e.target.checked)} />
                {' '}Lista de Mercado Público
              </label>
            </div>
          </div>
          <div className="form-actions">
            <button type="submit" className="send-quote-btn">Crear Lista</button>
          </div>
        </form>
      )}

      <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <table className="product-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Tipo</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {lists.map((l) => (
                <tr key={l.id}>
                  <td>
                    <button
                      className="back-btn"
                      style={{ padding: 0, margin: 0, cursor: 'pointer' }}
                      onClick={() => loadListDetail(l.id)}
                    >
                      {l.name}
                    </button>
                  </td>
                  <td>
                    <span className={`role-badge ${l.isMpPriceList ? 'role-admin' : 'role-buyer'}`}>
                      {l.isMpPriceList ? 'M. Público' : 'General'}
                    </span>
                  </td>
                  <td>
                    <span className={`status-badge ${l.isActive ? 'status-active' : 'status-inactive'}`}>
                      {l.isActive ? 'Activa' : 'Inactiva'}
                    </span>
                  </td>
                  <td className="actions-cell">
                    <button className="table-btn table-btn-danger" onClick={() => handleDelete(l.id)}>Eliminar</button>
                  </td>
                </tr>
              ))}
              {lists.length === 0 && (
                <tr><td colSpan={4} className="empty-cell">No hay listas de precio</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {selectedList && (
          <div style={{ flex: 2, minWidth: 0 }}>
            <div className="user-mgmt-header">
              <h4 style={{ margin: 0 }}>{selectedList.name}</h4>
            </div>

            <AddProductForm
              products={products}
              existingIds={selectedList.items.map((i) => i.productId)}
              onAdd={handleAddItems}
            />

            <table className="product-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Producto</th>
                  <th>Precio</th>
                  <th>Dto %</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {selectedList.items.map((item) => (
                  <PriceListItemRow
                    key={item.id}
                    item={item}
                    onUpdate={handleUpdateItem}
                    onDelete={handleDeleteItem}
                  />
                ))}
                {selectedList.items.length === 0 && (
                  <tr><td colSpan={5} className="empty-cell">Sin productos</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function AddProductForm({
  products,
  existingIds,
  onAdd,
}: {
  products: Product[]
  existingIds: number[]
  onAdd: (items: Array<{ productId: number; price: number; discount?: number }>) => void
}) {
  const [selectedProductId, setSelectedProductId] = useState('')
  const [price, setPrice] = useState('')
  const [discount, setDiscount] = useState('')

  const available = products.filter((p) => !existingIds.includes(p.id))

  function handleAdd() {
    if (!selectedProductId || !price) return
    onAdd([{
      productId: Number(selectedProductId),
      price: Number(price),
      discount: discount ? Number(discount) : undefined,
    }])
    setSelectedProductId('')
    setPrice('')
    setDiscount('')
  }

  return (
    <div className="form-grid" style={{ marginBottom: '1rem', padding: '0.75rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
      <div className="form-field">
        <label>Producto</label>
        <select value={selectedProductId} onChange={(e) => setSelectedProductId(e.target.value)}>
          <option value="">Seleccionar...</option>
          {available.map((p) => (
            <option key={p.id} value={p.id}>{p.sku} - {p.name}</option>
          ))}
        </select>
      </div>
      <div className="form-field">
        <label>Precio</label>
        <input type="number" step="1" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" />
      </div>
      <div className="form-field">
        <label>Dto. %</label>
        <input type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" />
      </div>
      <div className="form-field" style={{ alignSelf: 'flex-end' }}>
        <button className="send-quote-btn" onClick={handleAdd}>Agregar</button>
      </div>
    </div>
  )
}

function PriceListItemRow({
  item,
  onUpdate,
  onDelete,
}: {
  item: PriceListItem
  onUpdate: (id: number, price: number, discount: number) => void
  onDelete: (id: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [price, setPrice] = useState(item.price)
  const [discount, setDiscount] = useState(item.discount)

  function handleSave() {
    onUpdate(item.id, Number(price), Number(discount))
    setEditing(false)
  }

  return (
    <tr>
      <td className="sku-cell">{item.productSku || '-'}</td>
      <td>{item.productName || `Producto #${item.productId}`}</td>
      {editing ? (
        <>
          <td><input type="number" step="1" value={price} onChange={(e) => setPrice(e.target.value)} style={{ width: '100px' }} /></td>
          <td><input type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} style={{ width: '60px' }} /></td>
          <td className="actions-cell">
            <button className="table-btn" onClick={handleSave}>Guardar</button>
            <button className="table-btn table-btn-danger" onClick={() => setEditing(false)}>Cancelar</button>
          </td>
        </>
      ) : (
        <>
          <td>${Number(item.price).toLocaleString('es-CL')}</td>
          <td>{Number(item.discount) > 0 ? `${item.discount}%` : '-'}</td>
          <td className="actions-cell">
            <button className="table-btn" onClick={() => setEditing(true)}>Editar</button>
            <button className="table-btn table-btn-danger" onClick={() => onDelete(item.id)}>Eliminar</button>
          </td>
        </>
      )}
    </tr>
  )
}
