import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext.tsx'
import { useAuth } from '../context/AuthContext.tsx'
import { getProduct } from '../services/api.ts'
import { getItemPrice, getPriceLabel, getPriceWithTax } from '../types/quote.ts'

const DOC_TYPE_LABELS: Record<string, string> = {
  hoja_seguridad: 'Hoja de seguridad',
  manual: 'Manual',
  ficha_tecnica: 'Ficha técnica',
  otro: 'Documento',
}

const PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='600' fill='%23e2e8f0'%3E%3Crect width='600' height='600'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%2394a3b8' font-size='18'%3E Sin imagen %3C/text%3E%3C/svg%3E"

export function ProductDetailView() {
  const { selectedProduct, backToCatalog, addItem, isInQuote, userType, navigate } = useApp()
  const { user } = useAuth()
  const [activeImage, setActiveImage] = useState(0)
  const [activeTab, setActiveTab] = useState<'description' | 'ficha'>('description')
  const [quantity, setQuantity] = useState(1)
  const [detail, setDetail] = useState(selectedProduct)

  // El listado del catálogo trae solo la imagen principal; acá se pide el
  // producto completo (todas las imágenes, categorías y documentos).
  if (detail?.id !== selectedProduct?.id) {
    setDetail(selectedProduct)
  }

  useEffect(() => {
    const id = selectedProduct?.id
    if (!id) return
    let cancelled = false
    getProduct(id)
      .then((p) => { if (!cancelled) setDetail(p) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [selectedProduct?.id])

  if (!selectedProduct) return null

  const product = detail ?? selectedProduct
  const images = product.images?.length ? product.images : []
  const price = getItemPrice({ product, quantity })
  const unitPrice = getItemPrice({ product, quantity: 1 })
  const outOfStock = product.stock <= 0
  const inQuote = isInQuote(product.id)

  function handleAdd() {
    if (inQuote) {
      navigate('cart')
      return
    }
    for (let i = 0; i < quantity; i++) {
      addItem(product)
    }
  }

  return (
    <section className="product-detail">
      <button className="back-btn" onClick={backToCatalog}>
        ← Volver al catálogo
      </button>

      <div className="detail-layout">
        <div className="detail-gallery">
          <div className="gallery-main">
            <img
              src={images.length ? images[activeImage]?.url : PLACEHOLDER}
              alt={images.length ? (images[activeImage]?.alt || product.name) : product.name}
            />
          </div>
          {images.length > 1 && (
            <div className="gallery-thumbs">
              {images.map((img, i) => (
                <button
                  key={img.id}
                  className={`gallery-thumb ${i === activeImage ? 'active' : ''}`}
                  onClick={() => setActiveImage(i)}
                >
                  <img src={img.url} alt={img.alt || ''} />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="detail-info">
          <div className="detail-header">
            <h1>{product.name}</h1>
            {product.sku && <span className="detail-sku">SKU: {product.sku}</span>}
          </div>

          {product.categories?.length ? (
            <div className="detail-categories">
              {product.categories.map((cat) => (
                <span key={cat.categoryId} className="category-tag">{cat.name}</span>
              ))}
            </div>
          ) : null}

          {product.shortDesc && (
            <p className="detail-short-desc">{product.shortDesc}</p>
          )}

          <div className="detail-pricing">
            {user ? (
              <>
                <div className="detail-price-main">
                  <span className="detail-price">${unitPrice.toLocaleString('es-CL')}</span>
                  <span className="price-tax">neto</span>
                  {userType && <span className="price-badge">{getPriceLabel(userType)}</span>}
                </div>
                <div className="detail-price-tax">
                  Con IVA (19%): <strong>${getPriceWithTax(unitPrice).toLocaleString('es-CL')}</strong>
                </div>
                {userType && Number(product.regularPrice) !== unitPrice && (
                  <span className="detail-price-regular">
                    Precio regular: ${Number(product.regularPrice).toLocaleString('es-CL')}
                  </span>
                )}
              </>
            ) : (
              <span className="price-hidden">Inicia sesión para ver el precio</span>
            )}
          </div>

          <div className="detail-stock">
            {outOfStock ? (
              <span className="stock-out">Sin stock</span>
            ) : product.stock <= 5 ? (
              <span className="stock-low">Solo quedan {product.stock} unidades</span>
            ) : (
              <span className="stock-available">Stock disponible: {product.stock} unidades</span>
            )}
          </div>

          <div className="detail-quantity">
            <label>Cantidad:</label>
            <div className="quantity-selector">
              <button
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                disabled={outOfStock || !user}
              >
                −
              </button>
              <input
                type="number"
                min="1"
                max={product.stock || 9999}
                value={quantity}
                onChange={(e) => {
                  const v = parseInt(e.target.value) || 1
                  setQuantity(Math.max(1, Math.min(v, product.stock || 9999)))
                }}
                disabled={outOfStock || !user}
              />
              <button
                onClick={() => setQuantity(Math.min(quantity + 1, product.stock || 9999))}
                disabled={outOfStock || !user}
              >
                +
              </button>
            </div>
            {user && quantity > 1 && (
              <span className="quantity-subtotal">
                Subtotal: ${price.toLocaleString('es-CL')}
              </span>
            )}
          </div>

          <div className="detail-specs">
            <h4>Especificaciones</h4>
            <dl>
              <div><dt>SKU</dt><dd>{product.sku || '—'}</dd></div>
              <div>
                <dt>Dimensiones</dt>
                <dd>
                  {product.lengthCm || product.widthCm || product.heightCm
                    ? `${product.lengthCm || '—'} × ${product.widthCm || '—'} × ${product.heightCm || '—'} cm`
                    : 'Sin especificar'}
                </dd>
              </div>
              {product.weightKg && (
                <div><dt>Peso</dt><dd>{product.weightKg} kg</dd></div>
              )}
            </dl>
          </div>

          <button
            className={`detail-add-btn ${inQuote ? 'btn-in-quote' : ''}`}
            onClick={handleAdd}
            disabled={outOfStock || !user}
          >
            {!user ? 'Inicia sesión para comprar' : inQuote ? '✓ Ver en el carrito' : 'Agregar al carrito'}
          </button>
        </div>
      </div>

      <div className="detail-tabs">
        <div className="tabs-header">
          <button
            className={`tab-btn ${activeTab === 'description' ? 'active' : ''}`}
            onClick={() => setActiveTab('description')}
          >
            Descripción
          </button>
          <button
            className={`tab-btn ${activeTab === 'ficha' ? 'active' : ''}`}
            onClick={() => setActiveTab('ficha')}
          >
            Ficha Técnica
          </button>
        </div>

        <div className="tab-content">
          {activeTab === 'description' && (
            <div className="tab-description">
              {product.description ? (
                <p>{product.description}</p>
              ) : (
                <p className="no-content">Este producto no tiene descripción detallada.</p>
              )}
            </div>
          )}

          {activeTab === 'ficha' && (
            <div className="tab-ficha">
              {product.documents && product.documents.length > 0 && (
                <div className="doc-list">
                  <h4>Documentos del producto</h4>
                  <ul>
                    {product.documents.map((doc) => (
                      <li key={doc.id}>
                        <span className="doc-type">{DOC_TYPE_LABELS[doc.docType] || doc.docType}</span>
                        <a href={doc.fileUrl} target="_blank" rel="noreferrer">{doc.title}</a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {product.technicalSheetUrl ? (
                <div className="ficha-content">
                  <div className="ficha-preview">
                    <iframe
                      src={product.technicalSheetUrl}
                      title="Ficha técnica"
                    />
                  </div>
                  <a
                    href={product.technicalSheetUrl}
                    download
                    className="ficha-download"
                    target="_blank"
                    rel="noreferrer"
                  >
                    📄 Descargar ficha técnica
                  </a>
                </div>
              ) : (
                <p className="no-content">Este producto no tiene ficha técnica disponible.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
