export type UserRole = 'admin' | 'empresa' | 'cotizador'

export interface AuthUser {
  id: number
  email: string
  name: string
  role: UserRole
  /** Vendedor al que pertenece el usuario. null para el admin de plataforma. */
  companyId: number | null
  /** Comprador al que pertenece el usuario. null = persona natural sin organización. */
  customerId: number | null
  isMercadoPublico: boolean
}

export type CompanyType = 'normal' | 'chilecompra' | 'both'
export type BuyChannel = 'retail' | 'chilecompra'
export type CompanyStatus = 'pending' | 'active' | 'suspended'
export type CustomerKind = 'persona' | 'empresa'

/** Comprador: persona natural u organización. */
export interface AuthCustomer {
  id: number
  kind: CustomerKind
  name: string
  type: CompanyType
  priceListId: number | null
  status: CompanyStatus | null
}

export interface LoginResponse {
  token: string
  user: AuthUser
  /** Vendedor (rol `empresa` / `admin`). */
  company: AuthCustomer | null
  /** Comprador (rol `cotizador`). */
  customer: AuthCustomer | null
}

export interface UserListItem {
  id: number
  email: string
  name: string
  role: UserRole
  active: boolean
  companyId: number | null
  customerId: number | null
  isMercadoPublico: boolean
  createdAt: string
}

export interface PriceList {
  id: number
  name: string
  companyId: number
  isActive: boolean
  isMpPriceList: boolean
  validFrom: string | null
  validUntil: string | null
  createdAt: string
}

export interface PriceListItem {
  id: number
  priceListId: number
  productId: number
  price: string
  discount: string
  minQuantity: number
  productSku?: string
  productName?: string
}

export interface PriceListDetail extends PriceList {
  items: PriceListItem[]
}

export interface PriceListProduct {
  id: number
  sku: string
  name: string
  description: string | null
  shortDesc: string | null
  stock: number
  status: string
  price: string
  discount: string
  minQuantity: number
}
