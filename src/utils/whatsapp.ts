import type { QuoteItem } from '../types/quote.ts'
import { getItemPrice, TAX_RATE } from '../types/quote.ts'
import { formatCLP } from './format.ts'

function fmt(n: number) { return formatCLP(n) }

/** Normaliza un teléfono chileno a formato internacional (ej: 56912345678). */
export function normalizePhone(phone: string | null | undefined): string {
  const digits = (phone ?? '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('56')) return digits
  if (digits.startsWith('0')) return `56${digits.slice(1)}`
  if (digits.length === 9) return `56${digits}`
  return `56${digits.replace(/^9(?=\d{8})/, '9')}`
}

export function buildWhatsAppLink(phone: string | null | undefined, message: string): string {
  const number = normalizePhone(phone)
  if (!number) return ''
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`
}

export function buildQuoteWhatsAppMessage(
  items: QuoteItem[],
  total: number,
  vendor: string | null,
): string {
  const lines = items.map((i) => {
    const unit = getItemPrice(i)
    return `• ${i.product.name} (SKU ${i.product.sku ?? '-'}) x ${i.quantity} = $${fmt(
      unit * i.quantity
    )}`
  })
  const net = total / (1 + TAX_RATE)
  const taxLine = Math.round(net * TAX_RATE)
  const header = vendor ? `Hola ${vendor}, quiero cotizar lo siguiente:` : 'Hola, quiero cotizar lo siguiente:'
  const body = [
    header,
    '',
    ...lines,
    '',
    `Subtotal (neto): $${fmt(Math.round(net))}`,
    `IVA (19%): $${fmt(taxLine)}`,
    `Total (IVA incl.): $${fmt(total)}`,
    '',
    'Gracias',
  ]
  return body.join('\n')
}