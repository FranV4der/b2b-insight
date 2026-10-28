import type { Product } from './product.ts'
import type { UserType } from './user.ts'
import type { BuyChannel, CompanyType } from './auth.ts'

export interface QuoteItem {
  product: Product
  quantity: number
}

/**
 * Precio unitario del ítem, resuelto SIEMPRE desde la lista de precios asignada
 * (la fuente de verdad). Si el producto no tiene precio de lista, devuelve 0.
 * El precio ya viene con descuento aplicado desde la lista de precios.
 */
export function getItemPrice(item: QuoteItem): number {
  if (item.product.priceListPrice) {
    return Math.round(Number(item.product.priceListPrice))
  }
  return 0
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
