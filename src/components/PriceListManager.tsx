import { useEffect, useState } from 'react'
import type { PriceList, PriceListDetail, PriceListItem } from '../types/auth.ts'
import type { Product } from '../types/product.ts'
import { getProducts } from '../services/api.ts'
import { PriceListExcelImport } from './PriceListExcelImport.tsx'

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
  const [newChannel, setNewChannel] = useState<'retail' | 'chilecompra'>('retail')
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
        body: JSON.stringify({ name: newName.trim(), channel: newChannel }),
      })
      setNewName('')
      setNewChannel('retail')
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
    <div className="user-management" style={{ maxWidth: 1100 }}>
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
              <label>Canal *</label>
              <select value={newChannel} onChange={(e) => setNewChannel(e.target.value as 'retail' | 'chilecompra')}>
                <option value="retail">Compra normal</option>
                <option value="chilecompra">ChileCompra</option>
              </select>
            </div>
          </div>
          <div className="form-actions">
            <button type="submit" className="send-quote-btn">Crear Lista</button>
          </div>
        </form>
      )}

      <div className="pl-layout">
        <aside className="pl-sidebar">
          <div className="pl-sidebar-header">
            <span>Listas ({lists.length})</span>
          </div>
          <ul className="pl-list">
            {lists.map((l) => (
              <li key={l.id}>
                <button
                  className={`pl-list-item${selectedList?.id === l.id ? ' selected' : ''}`}
                  onClick={() => loadListDetail(l.id)}
                >
                  <span className="pl-list-item-info">
                    <span className="pl-list-item-name">{l.name}</span>
                    <span className={`role-badge ${l.channel === 'chilecompra' ? 'role-admin' : 'role-buyer'}`}>
                      {l.channel === 'chilecompra' ? 'ChileCompra' : 'Normal'}
                    </span>
                  </span>
                </button>
                <button
                  className="pl-list-item-delete"
                  title="Eliminar lista"
                  onClick={() => handleDelete(l.id)}
                >
                  ✕
                </button>
              </li>
            ))}
            {lists.length === 0 && (
              <li className="pl-empty">No hay listas de precio</li>
            )}
          </ul>
        </aside>

        <section className="pl-panel">
          {!selectedList ? (
            <div className="pl-empty">Selecciona una lista de la izquierda para ver y editar sus precios.</div>
          ) : (
            <>
              <div className="pl-panel-header">
                <h4>{selectedList.name}</h4>
                <span className={`role-badge ${selectedList.channel === 'chilecompra' ? 'role-admin' : 'role-buyer'}`}>
                  {selectedList.channel === 'chilecompra' ? 'ChileCompra' : 'Normal'}
                </span>
                <span className={`status-badge ${selectedList.isActive ? 'status-active' : 'status-inactive'}`}>
                  {selectedList.isActive ? 'Activa' : 'Inactiva'}
                </span>
              </div>

              <div className="pl-section-title">Carga masiva de precios</div>
              <PriceListExcelImport
                priceListId={selectedList.id}
                onImported={() => loadListDetail(selectedList.id)}
              />

              <div className="pl-section-title">Agregar producto</div>
              <AddProductForm
                products={products}
                existingIds={selectedList.items.map((i) => i.productId)}
                onAdd={handleAddItems}
              />

              <div className="pl-section-title">Precios en la lista ({selectedList.items.length})</div>
              <div className="pl-table-scroll">
                <table className="product-table pl-list-table">
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
            </>
          )}
        </section>
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
    <div className="pl-popup-card">
      <div className="form-grid">
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
          <td colSpan={2}>
            <div className="pl-item-edit">
              <input name="price" type="number" step="1" value={price} onChange={(e) => setPrice(e.target.value)} />
              <input name="discount" type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} />
            </div>
          </td>
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
