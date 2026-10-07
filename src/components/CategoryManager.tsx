import { useEffect, useState } from 'react'
import type { Category } from '../types/product.ts'
import { getCategories, createCategory, deleteCategory } from '../services/api.ts'

export function CategoryManager() {
  const [categories, setCategories] = useState<Category[]>([])
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    getCategories()
      .then((rows) => { if (!cancelled) setCategories(rows) })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Error al cargar categorías') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [refreshKey])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError('')
    try {
      await createCategory({ name: name.trim() })
      setName('')
      setRefreshKey((k) => k + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear la categoría')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number, categoryName: string) {
    if (!confirm(`¿Eliminar la categoría "${categoryName}"? Los productos quedan sin esa categoría.`)) return
    try {
      await deleteCategory(id)
      setRefreshKey((k) => k + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar')
    }
  }

  return (
    <div className="manager-wrap">
      <h3>Categorías</h3>

      <form className="inline-create-form" onSubmit={handleCreate}>
        <input
          type="text"
          placeholder="Nombre de la nueva categoría (p. ej. Herramientas)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className="send-quote-btn" disabled={saving || !name.trim()}>
          {saving ? 'Creando...' : 'Agregar categoría'}
        </button>
      </form>

      {error && <p className="form-error">{error}</p>}

      {loading ? (
        <div className="loading">Cargando...</div>
      ) : categories.length === 0 ? (
        <p className="empty-cell">Aún no hay categorías. Crea la primera con el formulario de arriba.</p>
      ) : (
        <table className="product-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Slug</th>
              <th>Productos</th>
              <th>Eliminar</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((category) => (
              <tr key={category.id}>
                <td>{category.name}</td>
                <td className="muted">{category.slug}</td>
                <td>{String(category.productCount ?? '0')}</td>
                <td className="actions-cell">
                  <button className="table-btn table-btn-danger" onClick={() => handleDelete(category.id, category.name)}>
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}