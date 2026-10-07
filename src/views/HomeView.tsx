import { useEffect, useState } from 'react'
import type { Product } from '../types/product.ts'
import { getProducts, getProduct, searchProducts, type GetProductsParams } from '../services/api.ts'
import { ProductCard } from '../components/ProductCard.tsx'
import { useApp } from '../context/AppContext.tsx'
import { useAuth } from '../context/AuthContext.tsx'
import { resolveChannel } from '../types/quote.ts' 
interface StoreState {
  products: Product[]
  loading: boolean
  error: string | null
  total: number
  totalPages: number
}

interface Filters {
  minPrice: string
  maxPrice: string
  inStock: boolean
  lengthCm: string
  widthCm: string
  heightCm: string
}

const EMPTY_FILTERS: Filters = { minPrice: '', maxPrice: '', inStock: false, lengthCm: '', widthCm: '', heightCm: '' }

export function HomeView() {
  const { userType, storeSearch, storeCategory, addItem, setStoreSearch, setStoreCategory } = useApp()
  const { user, customer } = useAuth()
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [filtersOpen, setFiltersOpen] = useState(false)

  const [quickSku, setQuickSku] = useState('')
  const [quickQty, setQuickQty] = useState('1')
  const [quickMsg, setQuickMsg] = useState<string | null>(null)
  const [quickBusy, setQuickBusy] = useState(false)
  const [state, setState] = useState<StoreState>({
    products: [],
    loading: true,
    error: null,
    total: 0,
    totalPages: 1,
  })

  const [featured, setFeatured] = useState<Product[] | null>(null)

  const [lastSearch, setLastSearch] = useState(storeSearch)
  if (storeSearch !== lastSearch) {
    setLastSearch(storeSearch)
    setPage(1)
  }

  const [lastCategory, setLastCategory] = useState(storeCategory)
  if (storeCategory !== lastCategory) {
    setLastCategory(storeCategory)
    setPage(1)
  }

  useEffect(() => {
    let cancelled = false
    const channel = resolveChannel(customer?.type, userType)

    async function load() {
      try {
        const params: GetProductsParams = {
          page,
          perPage: 20,
          search: storeSearch || undefined,
          categoryId: storeCategory ?? undefined,
          channel,
          minPrice: filters.minPrice ? Number(filters.minPrice) : undefined,
          maxPrice: filters.maxPrice ? Number(filters.maxPrice) : undefined,
          inStock: filters.inStock || undefined,
          maxLength: filters.lengthCm ? Number(filters.lengthCm) : undefined,
          maxWidth: filters.widthCm ? Number(filters.widthCm) : undefined,
          maxHeight: filters.heightCm ? Number(filters.heightCm) : undefined,
        }
        const res = await getProducts(params)
        if (!cancelled) {
          setState({
            products: res.data,
            loading: false,
            error: null,
            total: res.pagination.total,
            totalPages: res.pagination.total_pages,
          })
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: e instanceof Error ? e.message : 'Error al cargar productos',
          }))
        }
      }
    }

    load()
    return () => { cancelled = true }
  }, [page, storeSearch, storeCategory, userType, customer?.type, user, filters])

  useEffect(() => { setPage(1) }, [filters])

  useEffect(() => {
    let cancelled = false
    const channel = resolveChannel(customer?.type, userType)
    getProducts({ featured: true, perPage: 10, channel })
      .then((res) => { if (!cancelled) setFeatured(res.data) })
      .catch(() => { if (!cancelled) setFeatured([]) })
    return () => { cancelled = true }
  }, [userType, customer?.type, user])

  async function handleQuickAdd(e: React.FormEvent) {
    e.preventDefault()
    const sku = quickSku.trim()
    if (!sku) return
    setQuickBusy(true)
    setQuickMsg(null)
    try {
      const suggestions = await searchProducts(sku)
      const match =
        suggestions.find((s) => s.sku.toUpperCase() === sku.toUpperCase()) ??
        (suggestions.length === 1 ? suggestions[0] : null)
      if (!match) {
        setQuickMsg(`No se encontró un producto con el código "${sku}".`)
        return
      }
      const product = await getProduct(match.id)
      const qty = Math.max(1, Number(quickQty) || 1)
      addItem(product, qty)
      setQuickMsg(`✓ ${match.name} (${qty} unidad${qty > 1 ? 'es' : ''}) agregado al carrito.`)
      setQuickSku('')
      setQuickQty('1')
    } catch (err) {
      setQuickMsg(err instanceof Error ? err.message : 'Error al agregar el producto')
    } finally {
      setQuickBusy(false)
    }
  }

  function setFilter(k: keyof Filters, v: string | boolean) {
    setFilters((f) => ({ ...f, [k]: (k === 'inStock' ? Boolean(v) : String(v)) }))
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS)
  }

  return (
    <section className="store-view">
      <section className="store-hero">
        <div className="hero-content">
          <span className="hero-eyebrow">Plataforma B2B · Cotizaciones y compras públicas</span>
          <h1>
            Compra para tu <span className="text-gradient">licitación</span> en un solo lugar
          </h1>
          <p>
            {user
              ? 'Los precios mostrados corresponden a tu lista de precios asignada. Agrega productos, cotiza y descarga tu orden.'
              : 'Explora el catálogo, arma tu carrito y genera una cotización en minutos. Inicia sesión para ver tus precios.'}
          </p>
          <div className="hero-badges">
            <span className="hero-badge">
              <span className="hero-badge-dot" /> ChileCompra
            </span>
            <span className="hero-badge">
              <span className="hero-badge-dot" /> Convenio Marco
            </span>
            <span className="hero-badge">
              <span className="hero-badge-dot" /> Precios netos + IVA 19%
            </span>
          </div>
        </div>

        <div className="hero-features">
          <div className="hero-card">
            <span className="hero-card-num">01</span>
            <b>ChileCompra</b>
            <small>Busca por código de licitación y arma el pedido</small>
          </div>
          <div className="hero-card">
            <span className="hero-card-num">02</span>
            <b>Cotiza en línea</b>
            <small>Genera y descarga tu cotización en PDF</small>
          </div>
          <div className="hero-card">
            <span className="hero-card-num">03</span>
            <b>Precios claros</b>
            <small>Netos, IVA y totales transparentes</small>
          </div>
        </div>

        <div className="store-trust">
          <span>✓ Despacho a todo Chile</span>
          <span>✓ Facturación electrónica</span>
          <span>✓ Pago a 30·60·90 días</span>
          <span>✓ Atención B2B</span>
        </div>
      </section>

      {featured && featured.length > 0 && (
        <section className="featured-section">
          <div className="featured-header">
            <h3>Destacados</h3>
            <span className="featured-sub">Productos seleccionados por tu proveedor</span>
          </div>
          <div className="featured-row">
            {featured.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      )}

      {user && (
        <form className="quick-add" onSubmit={handleQuickAdd}>
          <h4>Pedido rápido por código</h4>
          <input
            type="text"
            placeholder="Ingresa un SKU / código"
            value={quickSku}
            onChange={(e) => setQuickSku(e.target.value)}
          />
          <input
            type="number"
            min="1"
            value={quickQty}
            onChange={(e) => setQuickQty(e.target.value)}
            className="quick-qty"
          />
          <button className="send-quote-btn" disabled={quickBusy}>
            {quickBusy ? 'Agregando...' : 'Agregar'}
          </button>
          {quickMsg && <span className="quick-msg">{quickMsg}</span>}
        </form>
      )}

      <div className="catalog-toolbar">
        <button className="filter-toggle" onClick={() => setFiltersOpen((o) => !o)}>
          <span className="filter-icon">⚙</span>
          {filtersOpen ? 'Ocultar filtros' : 'Filtros'}
          <span className="filter-sub">precio · stock · dimensiones</span>
        </button>

        <span className="catalog-count">
          <b>{state.total}</b> producto{state.total !== 1 ? 's' : ''} encontrado{state.total !== 1 ? 's' : ''}
        </span>
      </div>

      {filtersOpen && (
        <div className="catalog-filters">
          <div className="form-grid">
            <label>
              Precio mín.
              <input type="number" min="0" placeholder="0" value={filters.minPrice} onChange={(e) => setFilter('minPrice', e.target.value)} />
            </label>
            <label>
              Precio máx.
              <input type="number" min="0" placeholder="99999999" value={filters.maxPrice} onChange={(e) => setFilter('maxPrice', e.target.value)} />
            </label>
            <label className="filter-instock">
              <input type="checkbox" checked={filters.inStock} onChange={(e) => setFilter('inStock', e.target.checked ? '1' : '')} />
              Solo con stock
            </label>
            <label>
              Largo (cm)
              <input type="number" min="0" placeholder="ej: 50" value={filters.lengthCm} onChange={(e) => setFilter('lengthCm', e.target.value)} />
            </label>
            <label>
              Ancho (cm)
              <input type="number" min="0" placeholder="ej: 40" value={filters.widthCm} onChange={(e) => setFilter('widthCm', e.target.value)} />
            </label>
            <label>
              Alto (cm)
              <input type="number" min="0" placeholder="ej: 30" value={filters.heightCm} onChange={(e) => setFilter('heightCm', e.target.value)} />
            </label>
          </div>
          <button className="btn-sm" onClick={clearFilters}>Limpiar filtros</button>
        </div>
      )}

      {state.loading ? (
        <div className="loading">Cargando productos...</div>
      ) : state.error ? (
        <div className="error">{state.error}</div>
      ) : (
        <>
          <div className="product-grid">
            {state.products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
          {state.products.length === 0 && (
            <div className="empty-quote-empty">
              <p>
                {storeSearch || storeCategory != null || filters.inStock || filters.minPrice || filters.maxPrice
                  || filters.lengthCm || filters.widthCm || filters.heightCm
                  ? 'No se encontraron productos con los criterios seleccionados.'
                  : user
                    ? 'Tu proveedor aún no ha publicado productos en este catálogo.'
                    : 'El catálogo aún está preparándose. Inicia sesión para ver los precios cuando esté disponible.'}
              </p>
              {(storeSearch || storeCategory != null || filters.inStock || filters.minPrice || filters.maxPrice
                || filters.lengthCm || filters.widthCm || filters.heightCm) && (
                <button
                  className="send-quote-btn"
                  onClick={() => { setStoreSearch(''); setStoreCategory(null); clearFilters() }}
                >
                  Limpiar búsqueda y filtros
                </button>
              )}
            </div>
          )}
          {state.totalPages > 1 && (
            <div className="pagination">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button>
              <span>Página {page} de {state.totalPages}</span>
              <button disabled={page >= state.totalPages} onClick={() => setPage(page + 1)}>Siguiente</button>
            </div>
          )}
        </>
      )}
    </section>
  )
}
