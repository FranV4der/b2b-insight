import { useState } from 'react'
import { useApp } from '../context/AppContext.tsx'
import { useAuth } from '../context/AuthContext.tsx'
import { LicitacionInfo } from '../components/LicitacionInfo.tsx'
import { getItemPrice, resolveChannel, type QuoteItem } from '../types/quote.ts'
import { createOrder, submitQuote, downloadQuotePdf } from '../services/api.ts'
import { buildWhatsAppLink, buildQuoteWhatsAppMessage } from '../utils/whatsapp.ts'
import type { CreateOrderResponse } from '../types/order.ts' 
const TAX_RATE = 0.19
const PAYMENT_METHODS = ['transferencia', 'credito', 'factura', 'contraentrega'] as const

/** Cantidad editable: permite digitar el número directo sin hacer clic una a una. */
function QtyInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [draft, setDraft] = useState(String(value))
  const [focused, setFocused] = useState(false)

  // Sincroniza el borrador con el valor real sin pisar lo que se está digitando.
  if (!focused && draft !== String(value)) {
    setDraft(String(value))
  }

  function commit() {
    const n = Math.max(1, Math.floor(Number(draft)) || 1)
    setDraft(String(n))
    onChange(n)
  }

  return (
    <input
      type="number"
      min="1"
      className="qty-input"
      value={draft}
      onFocus={() => setFocused(true)}
      onBlur={() => { setFocused(false); commit() }}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
    />
  )
}

export function CartView() {
  const { items, userType, licitacionCode, navigate, updateQuantity, removeItem, setLicitacionCode, clearQuote } = useApp()
  const { customer } = useAuth()

  const channel = resolveChannel(customer?.type, userType)
  const purchaseBlocked = customer != null && customer.status !== 'active'

  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState<CreateOrderResponse | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [paymentMethod, setPaymentMethod] = useState('')
  const [shippingAddress, setShippingAddress] = useState('')
  const [shippingNotes, setShippingNotes] = useState('')
  const [notes, setNotes] = useState('')
  const [poNumber, setPoNumber] = useState('')

  const [quoteSaving, setQuoteSaving] = useState(false)
  const [quoteSavedId, setQuoteSavedId] = useState<number | null>(null)
  const [quoteDownloding, setQuoteDownloding] = useState(false)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [quoteSellerPhone, setQuoteSellerPhone] = useState<string | null>(null)
  const [quoteSellerName, setQuoteSellerName] = useState<string | null>(null)

  const subtotal = items.reduce((sum, i) => sum + getItemPrice(i) * i.quantity, 0)
  const tax = Math.round(subtotal * TAX_RATE)
  const total = subtotal + tax

  function handleClear() {
    clearQuote()
    navigate('catalog')
  }

  async function handleSaveQuote() {
    setQuoteError(null)
    setQuoteSaving(true)
    try {
      const res = await submitQuote({
        userType: channel === 'chilecompra' ? 'chilecompra' : 'convenio-marco',
        licitacionCode: channel === 'chilecompra' ? licitacionCode || undefined : undefined,
        items: items.map((i) => ({
          productId: i.product.id,
          name: i.product.name,
          sku: i.product.sku ?? null,
          quantity: i.quantity,
          unitPrice: getItemPrice(i),
        })),
        total,
      })
      setQuoteSavedId(res.id)
      setQuoteSellerPhone(res.sellerPhone ?? null)
      setQuoteSellerName(res.sellerName ?? null)
    } catch (err) {
      setQuoteError(err instanceof Error ? err.message : 'Error al guardar la cotización')
    } finally {
      setQuoteSaving(false)
    }
  }

  async function handleDownloadQuote() {
    if (!quoteSavedId) return
    setQuoteDownloding(true)
    setQuoteError(null)
    try {
      const blob = await downloadQuotePdf(quoteSavedId)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `cotizacion-${quoteSavedId}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setQuoteError(err instanceof Error ? err.message : 'No se pudo descargar la cotización')
    } finally {
      setQuoteDownloding(false)
    }
  }

  async function handleSubmitOrder() {
    setSubmitError(null)
    if (purchaseBlocked) {
      setSubmitError('Tu empresa aún no está habilitada para realizar compras.')
      return
    }
    setSubmitting(true)

    try {
      const res = await createOrder({
        items: items.map((i) => ({ productId: i.product.id, quantity: i.quantity })),
        channel,
        licitacionCode: channel === 'chilecompra' ? licitacionCode || undefined : undefined,
        paymentMethod: paymentMethod || undefined,
        shippingAddress: shippingAddress || undefined,
        shippingNotes: shippingNotes || undefined,
        notes: notes || undefined,
        poNumber: poNumber || undefined,
      })
      clearQuote()
      setSubmitted(res)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Error al crear el pedido')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <section className="quote-view">
        <div className="quote-success">
          <h2>Orden de Compra Confirmada</h2>
          <p className="order-number">
            Número de Orden de Compra: <strong>{submitted.orderNumber}</strong>
          </p>
          <p>
            Total: ${Number(submitted.total).toLocaleString('es-CL')} (IVA incluido)
          </p>
          <div className="quote-success-actions">
            <button onClick={() => navigate('orders')}>Ver mis órdenes</button>
            <button onClick={() => navigate('catalog')}>Seguir comprando</button>
          </div>
        </div>
      </section>
    )
  }

  if (items.length === 0) {
    return (
      <section className="quote-view">
        <h2>Carrito</h2>
        <div className="empty-quote">
          <p>Tu carrito está vacío.</p>
          <button onClick={() => navigate('catalog')}>Ir al catálogo</button>
        </div>
      </section>
    )
  }

  return (
    <section className="quote-view">
      <h2>Revisar Orden de Compra</h2>
      <p className="quote-type">
        Canal: <strong>{channel === 'chilecompra' ? 'ChileCompra' : 'Retail'}</strong>
        {' · '}
        <span className="quote-item-count">{items.length} producto{items.length !== 1 ? 's' : ''}</span>
      </p>

      {channel === 'chilecompra' && (
        <div className="licitacion-field">
          <label htmlFor="licitacion-code">Código de Licitación *</label>
          <input
            id="licitacion-code"
            type="text"
            value={licitacionCode}
            onChange={(e) => setLicitacionCode(e.target.value)}
            placeholder="Ej: 1509-5-L114"
          />
          <LicitacionInfo code={licitacionCode} />
        </div>
      )}

      <div className="quote-items">
        {items.map((item) => {
          const unitPrice = getItemPrice(item)
          return (
            <div key={item.product.id} className="quote-item">
              <div className="quote-item-info">
                <span className="quote-item-name">{item.product.name}</span>
                <span className="quote-item-meta">
                  {item.product.sku && <span className="sku">SKU: {item.product.sku}</span>}
                  <span className="quote-item-price">${unitPrice.toLocaleString('es-CL')} c/u</span>
                </span>
              </div>
              <div className="quote-item-controls">
                <button onClick={() => updateQuantity(item.product.id, item.quantity - 1)}>-</button>
                <QtyInput value={item.quantity} onChange={(v) => updateQuantity(item.product.id, v)} />
                <button onClick={() => updateQuantity(item.product.id, item.quantity + 1)}>+</button>
                <button className="remove-btn" onClick={() => removeItem(item.product.id)}>Eliminar</button>
              </div>
              <div className="quote-item-subtotal">
                ${(unitPrice * item.quantity).toLocaleString('es-CL')}
              </div>
            </div>
          )
        })}
      </div>

      {purchaseBlocked && (
        <div className="form-error">
          {customer?.status === 'suspended'
            ? 'Tu empresa está suspendida y no puede realizar compras. Contacta al proveedor para regularizar tu cuenta.'
            : 'Tu empresa está pendiente de aprobación. Un proveedor debe activar tu cuenta antes de que puedas confirmar órdenes de compra.'}
        </div>
      )}

      {!purchaseBlocked && (
        <div className="order-form">
          <h4>Datos de la Orden de Compra</h4>
        <div className="form-grid">
          <div className="form-field">
            <label htmlFor="order-payment">Método de pago</label>
            <select id="order-payment" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              <option value="">Seleccionar...</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="order-po">OC / Referencia</label>
            <input id="order-po" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} placeholder="N° de orden de compra" />
          </div>
          <div className="form-field form-field-full">
            <label htmlFor="order-address">Dirección de despacho</label>
            <input id="order-address" value={shippingAddress} onChange={(e) => setShippingAddress(e.target.value)} placeholder="Dirección de entrega" />
          </div>
          <div className="form-field form-field-full">
            <label htmlFor="order-shipping-notes">Notas de despacho</label>
            <textarea id="order-shipping-notes" value={shippingNotes} onChange={(e) => setShippingNotes(e.target.value)} rows={2} placeholder="Indicaciones para el despacho" />
          </div>
          <div className="form-field form-field-full">
            <label htmlFor="order-notes">Comentarios</label>
            <textarea id="order-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Observaciones adicionales" />
          </div>
        </div>
      </div>
      )}

      <div className="quote-section">
        <h4>Cotización</h4>
        <p className="muted">
          Genera una cotización formal (PDF) de este carrito sin comprometer stock.
        </p>
        {quoteError && <div className="form-error">{quoteError}</div>}
        {quoteSavedId ? (
          <div className="quote-saved-actions">
            <span className="muted">
              Cotización <strong>#{quoteSavedId}</strong> guardada.
            </span>
            <button className="send-quote-btn" onClick={handleDownloadQuote} disabled={quoteDownloding}>
              {quoteDownloding ? 'Descargando...' : '⬇ Descargar PDF'}
            </button>
            {quoteSellerPhone && (
              <a
                className="whatsapp-btn"
                href={buildWhatsAppLink(quoteSellerPhone, buildQuoteWhatsAppMessage(items as QuoteItem[], total, quoteSellerName))}
                target="_blank"
                rel="noreferrer"
              >
                Enviar por WhatsApp
              </a>
            )}
            <button className="table-btn" onClick={() => navigate('quotes')}>
              Ver mis cotizaciones
            </button>
          </div>
        ) : (
          <button className="quote-btn" onClick={handleSaveQuote} disabled={quoteSaving}>
            {quoteSaving ? 'Guardando...' : 'Guardar Cotización'}
          </button>
        )}
      </div>

      <div className="quote-total">
        <div className="total-breakdown">
          <span>Subtotal (neto)</span>
          <span>${subtotal.toLocaleString('es-CL')}</span>
        </div>
        <div className="total-breakdown">
          <span>IVA (19%)</span>
          <span>${tax.toLocaleString('es-CL')}</span>
        </div>
        <div className="total-breakdown total-breakdown-final">
          <strong>Total</strong>
          <strong>${total.toLocaleString('es-CL')}</strong>
        </div>
      </div>

      {submitError && <div className="form-error">{submitError}</div>}

      <div className="quote-actions">
        <button onClick={() => navigate('catalog')}>Seguir comprando</button>
        {!purchaseBlocked && (
          <button className="send-quote-btn" onClick={handleSubmitOrder} disabled={submitting}>
            {submitting ? 'Confirmando...' : 'Confirmar Orden de Compra'}
          </button>
        )}
        <button className="clear-btn" onClick={handleClear}>Vaciar carrito</button>
      </div>
    </section>
  )
}
