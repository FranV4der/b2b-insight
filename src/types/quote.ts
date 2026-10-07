import type { Product } from './product.ts'
import type { UserType } from './user.ts'
import type { BuyChannel, CompanyType } from './auth.ts'

export interface QuoteItem {
  product: Product
  quantity: number
}

export function getItemPrice(item: QuoteItem): number {
  if (item.product.priceListPrice) {
    const price = Number(item.product.priceListPrice)
    const discount = Number(item.product.priceListDiscount || 0)
    return discount > 0 ? Math.round(price * (1 - discount / 100)) : Math.round(price)
  }
  return Math.round(Number(item.product.regularPrice) || 0)
}

export const TAX_RATE = 0.19

/**
 * Precio con IVA 19% redondeado al peso. `getItemPrice` devuelve el precio
 * neto; este helper es para mostrar el importe final que paga el cliente.
 */
export function getPriceWithTax(net: number): number {
  return Math.round(net + net * TAX_RATE)
}

export function getPriceLabel(userType: UserType): string {
  return userType === 'mercadopublico' ? 'Precio Mercado Público' : 'Precio General'
}

export function resolveChannel(companyType: CompanyType | undefined, userType: UserType): BuyChannel {
  if (companyType === 'chilecompra') return 'chilecompra'
  if (companyType === 'normal') return 'retail'
  return userType === 'mercadopublico' ? 'chilecompra' : 'retail'
}

export interface Quote {
  items: QuoteItem[]
  userType: 'general' | 'mercadopublico'
  licitacionCode?: string
  createdAt: Date
}

export type View = 'home' | 'catalog' | 'cart' | 'admin' | 'product-detail' | 'dashboard' | 'orders' | 'order-detail' | 'quotes'
