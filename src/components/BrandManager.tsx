import { useEffect, useState } from 'react'
import type { Brand } from '../types/product.ts'
import { getBrands, createBrand, updateBrand, deleteBrand } from '../services/api.ts'

export function BrandManager() {
  const [brands, setBrands] = useState<Brand[]>([])
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')

  useEffect(() => {
    let cancelled = false
    getBrands()
      .then((rows) => { if (!cancelled) setBrands(rows) })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Error al cargar marcas') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [refreshKey])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError('')
    try {
      await createBrand({ name: name.trim() })
      setName('')
      setRefreshKey((k) => k + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear la marca')
    } finally {
      setSaving(false)
    }
  }

  async function handleRename(id: number) {
    if (!editName.trim()) return
    try {
      await updateBrand(id, { name: editName.trim() })
      setEditingId(null)
      setEditName('')
      setRefreshKey((k) => k + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al renombrar')
    }
  }

  async function handleDelete(id: number, brandName: string) {
    if (!confirm(`¿Eliminar la marca "${brandName}"? Los productos asignados quedan sin marca.`)) return
    try {
      await deleteBrand(id)
      setRefreshKey((k) => k + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar')
    }
  }

  return (
    <div className="manager-wrap">
      <h3>Marcas</h3>

      <form className="inline-create-form" onSubmit={handleCreate}>
        <input
          type="text"
          placeholder="Nombre de la nueva marca (p. ej. Bosch)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className="send-quote-btn" disabled={saving || !name.trim()}>
          {saving ? 'Creando...' : 'Agregar marca'}
        </button>
      </form>

      {error && <p className="form-error">{error}</p>}

      {loading ? (
        <div className="loading">Cargando...</div>
      ) : brands.length === 0 ? (
        <p className="empty-cell">Aún no hay marcas. Crea la primera con el formulario de arriba.</p>
      ) : (
        <table className="product-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Slug</th>
              <th>Productos</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {brands.map((brand) => (
              <tr key={brand.id}>
                <td>
                  {editingId === brand.id ? (
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleRename(brand.id); if (e.key === 'Escape') setEditingId(null) }}
                      autoFocus
                    />
                  ) : (
                    brand.name
                  )}
                </td>
                <td className="muted">{brand.slug}</td>
                <td>{String(brand.productCount ?? '0')}</td>
                <td className="actions-cell">
                  {editingId === brand.id ? (
                    <>
                      <button className="table-btn" onClick={() => handleRename(brand.id)}>Guardar</button>
                      <button className="table-btn" onClick={() => setEditingId(null)}>Cancelar</button>
                    </>
                  ) : (
                    <>
                      <button className="table-btn" onClick={() => { setEditingId(brand.id); setEditName(brand.name) }}>Renombrar</button>
                      <button className="table-btn table-btn-danger" onClick={() => handleDelete(brand.id, brand.name)}>Eliminar</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}