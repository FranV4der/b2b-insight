import { useEffect, useState } from 'react'
import type { Product } from '../types/product.ts'
import { getProducts, deleteProduct, updateProduct } from '../services/api.ts'

interface Props {
  onEdit: (product: Product) => void
  refreshKey: number
}

export function ProductTable({ onEdit, refreshKey }: Props) {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await getProducts({ page, perPage: 15, search: search || undefined, status: 'active' })
        if (!cancelled) {
          setProducts(res.data)
          setTotalPages(res.pagination.total_pages)
          setTotal(res.pagination.total)
        }
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [page, search, refreshKey])

  async function handleDelete(id: number, name: string) {
    if (!confirm(`Eliminar "${name}"?`)) return
    try {
      await deleteProduct(id)
      setProducts((prev) => prev.filter((p) => p.id !== id))
      setTotal((prev) => prev - 1)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al eliminar')
    }
  }

  async function handleToggleFeatured(p: Product) {
    try {
      await updateProduct(p.id, { featured: !p.featured })
      setProducts((prev) => prev.map((x) => (x.id === p.id ? { ...x, featured: !p.featured } : x)))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al actualizar')
    }
  }

  return (
    <div className="product-table-wrap">
      <div className="table-toolbar">
        <input
          type="text"
          placeholder="Buscar..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
        />
      </div>

      {loading ? (
        <div className="loading">Cargando...</div>
      ) : error ? (
        <div className="error">{error}</div>
      ) : (
        <>
          <p className="catalog-count">{total} producto{total !== 1 ? 's' : ''}</p>
          <table className="product-table">
            <thead>
              <tr>
                <th className="thumb-cell">Imagen</th>
                <th>SKU</th>
                <th>Nombre</th>
                <th>Precio</th>
                <th>Stock</th>
                <th>Destacado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td className="thumb-cell">
                    {p.images?.[0]?.url ? (
                      <img className="product-thumb" src={p.images[0].url} alt={p.name} />
                    ) : (
                      <span className="product-thumb product-thumb-placeholder">—</span>
                    )}
                  </td>
                  <td className="sku-cell">{p.sku}</td>
                  <td>{p.name}</td>
                  <td>${Number(p.regularPrice).toLocaleString('es-CL')}</td>
                  <td>{p.stock}</td>
                  <td>
                    <button
                      className={`featured-btn${p.featured ? ' featured-on' : ''}`}
                      title={p.featured ? 'Quitar de destacados' : 'Marcar como destacado'}
                      onClick={() => handleToggleFeatured(p)}
                    >
                      {p.featured ? '★' : '☆'}
                    </button>
                  </td>
                  <td className="actions-cell">
                    <button className="table-btn" onClick={() => onEdit(p)}>Editar</button>
                    <button className="table-btn table-btn-danger" onClick={() => handleDelete(p.id, p.name)}>Eliminar</button>
                  </td>
                </tr>
              ))}
              {products.length === 0 && (
                <tr><td colSpan={7} className="empty-cell">No hay productos</td></tr>
              )}
            </tbody>
          </table>
          {totalPages > 1 && (
            <div className="pagination">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button>
              <span>Página {page} de {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Siguiente</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
