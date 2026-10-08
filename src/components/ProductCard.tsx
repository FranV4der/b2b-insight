import type { Product } from '../types/product.ts'
import { useApp } from '../context/AppContext.tsx'
import { useAuth } from '../context/AuthContext.tsx'
import { getItemPrice, getPriceLabel, getPriceWithTax } from '../types/quote.ts'

interface Props {
  product: Product
}

const PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300' fill='%23e2e8f0'%3E%3Crect width='300' height='300'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%2394a3b8' font-size='14'%3E Sin imagen %3C/text%3E%3C/svg%3E"

export function ProductCard({ product }: Props) {
  const { addItem, viewProduct, isInQuote, userType, navigate } = useApp()
  const { user } = useAuth()

  const price = getItemPrice({ product, quantity: 1 })
  const outOfStock = product.stock <= 0
  const inQuote = isInQuote(product.id)
  const imageUrl = product.images?.[0]?.url || PLACEHOLDER

  function handleAddToQuote(e: React.MouseEvent) {
    e.stopPropagation()
    if (inQuote) {
      navigate('cart')
      return
    }
    if (!outOfStock) {
      addItem(product)
    }
  }

  return (
    <article className="product-card" onClick={() => viewProduct(product)}>
      <div className="product-img">
        <img src={imageUrl} alt={product.images?.[0]?.alt || product.name} loading="lazy" />
        {product.brandName && <span className="brand-chip">{product.brandName}</span>}
        {outOfStock && <span className="out-of-stock-badge">Sin stock</span>}
      </div>
      <div className="product-info">
        <div className="product-title-row">
          <h3>{product.name}</h3>
        </div>
        <span className="sku">SKU {product.sku}</span>
        {product.shortDesc && (
          <p className="product-desc">{product.shortDesc}</p>
        )}
        <span className={outOfStock ? 'product-stock out-of-stock' : 'product-stock'}>
          {outOfStock ? 'Sin stock' : `${product.stock} en stock`}
        </span>
        <div className="product-price">
          {user ? (
            <>
              <span className="price">${price.toLocaleString('es-CL')}</span>
              <span className="price-tax">neto · c/IVA ${getPriceWithTax(price).toLocaleString('es-CL')}</span>
              {userType && <span className="price-badge">{getPriceLabel(userType)}</span>}
            </>
          ) : (
            <span className="price-hidden">Precio reservado</span>
          )}
        </div>
        {user && (
          <button
            className={inQuote ? 'btn-in-quote' : outOfStock ? 'btn-out-of-stock' : ''}
            onClick={handleAddToQuote}
            disabled={outOfStock}
          >
            {inQuote ? '✓ Ver en el carrito' : 'Agregar al carrito'}
          </button>
        )}
      </div>
    </article>
  )
}
