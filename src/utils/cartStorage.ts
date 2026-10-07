import type { QuoteItem } from '../types/quote.ts'

const CART_STORAGE_PREFIX = 'insight-b2b.cart.v1'

export interface StoredCart {
  items: QuoteItem[]
  licitacionCode: string
}

const EMPTY: StoredCart = { items: [], licitacionCode: '' }

export function cartStorageKey(userEmail: string): string {
  return `${CART_STORAGE_PREFIX}.${userEmail.toLowerCase()}`
}

export function loadCart(userEmail: string | null): StoredCart {
  if (!userEmail) return EMPTY
  try {
    const raw = localStorage.getItem(cartStorageKey(userEmail))
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw) as Partial<StoredCart>
    return {
      items: Array.isArray(parsed.items) ? parsed.items : [],
      licitacionCode: typeof parsed.licitacionCode === 'string' ? parsed.licitacionCode : '',
    }
  } catch {
    return EMPTY
  }
}

export function saveCart(userEmail: string, cart: StoredCart): void {
  try {
    localStorage.setItem(cartStorageKey(userEmail), JSON.stringify(cart))
  } catch {
    // ignore quota/privacidad errors
  }
}

export function clearCart(userEmail: string | null): void {
  if (!userEmail) return
  localStorage.removeItem(cartStorageKey(userEmail))
}

export function purgeLegacyCart(): void {
  localStorage.removeItem(CART_STORAGE_PREFIX)
}
