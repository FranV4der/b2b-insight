import type { BuyChannel } from './auth.ts'

export type OrderStatus = 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled'

export interface OrderItem {
  id: number
  orderId: number
  productId: number | null
  productName: string
  productSku: string | null
  quantity: number
  unitPrice: string
  totalPrice: string
}

export interface Order {
  id: number
  orderNumber: string
  companyId: number
  companyName?: string
  userId: number | null
  status: OrderStatus
  channel: BuyChannel
  licitacionCode: string | null
  subtotal: string
  tax: string
  total: string
  currency: string
  paymentMethod: string | null
  shippingAddress: string | null
  shippingNotes: string | null
  notes: string | null
  poNumber: string | null
  createdAt: string
  itemCount?: number
  items?: OrderItem[]
}

export interface CreateOrderData {
  items: Array<{ productId: number; quantity: number }>
  channel?: BuyChannel
  licitacionCode?: string
  shippingAddress?: string
  shippingNotes?: string
  notes?: string
  poNumber?: string
  paymentMethod?: string
}

export interface CreateOrderResponse {
  id: number
  orderNumber: string
  status: string
  channel: BuyChannel
  subtotal: string
  tax: string
  total: string
  createdAt: string
}

export interface OrderListResponse {
  data: Order[]
  pagination: {
    page: number
    per_page: number
    total: number
    total_pages: number
  }
}

export function getOrderStatusLabel(status: OrderStatus): string {
  const labels: Record<OrderStatus, string> = {
    pending: 'Pendiente',
    confirmed: 'Confirmada',
    shipped: 'Enviada',
    delivered: 'Entregada',
    cancelled: 'Cancelada',
  }
  return labels[status] ?? status
}

export function getOrderStatusClass(status: OrderStatus): string {
  const classes: Record<OrderStatus, string> = {
    pending: 'status-pending',
    confirmed: 'status-active',
    shipped: 'status-active',
    delivered: 'status-active',
    cancelled: 'status-inactive',
  }
  return classes[status] ?? ''
}

export function getChannelLabel(channel: BuyChannel): string {
  return channel === 'chilecompra' ? 'ChileCompra' : 'Retail'
}
