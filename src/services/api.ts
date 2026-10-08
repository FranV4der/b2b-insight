import type { Product, ProductListResponse, Category, Brand, ProductDocument } from '../types/product.ts'
import type { LoginResponse, AuthUser, AuthCustomer, UserListItem, CompanyType, BuyChannel, PriceList, CustomerPriceList } from '../types/auth.ts'
import type { Order, OrderListResponse, CreateOrderData, CreateOrderResponse, OrderStatus } from '../types/order.ts'
import type { AppNotification, NotificationsResponse } from '../types/notification.ts'

const API_BASE = '/api'

function getToken(): string | null {
  return localStorage.getItem('token')
}

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    ...(options?.headers as Record<string, string> || {}),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  if (!headers['Content-Type'] && !(options?.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  })

  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const message = body?.error || `API error: ${res.status} ${res.statusText}`
    throw new Error(message)
  }
  return res.json() as Promise<T>
}

export interface GetProductsParams {
  page?: number
  perPage?: number
  search?: string
  status?: string
  channel?: BuyChannel
  categoryId?: number
  featured?: boolean
  minPrice?: number
  maxPrice?: number
  inStock?: boolean
  minLength?: number
  maxLength?: number
  minWidth?: number
  maxWidth?: number
  minHeight?: number
  maxHeight?: number
}

export async function getProducts(params?: GetProductsParams): Promise<ProductListResponse> {
  const searchParams = new URLSearchParams()
  if (params?.page) searchParams.set('page', String(params.page))
  if (params?.perPage) searchParams.set('per_page', String(params.perPage))
  if (params?.search) searchParams.set('search', params.search)
  if (params?.status) searchParams.set('status', params.status)
  if (params?.channel) searchParams.set('channel', params.channel)
  if (params?.categoryId) searchParams.set('category_id', String(params.categoryId))
  if (params?.featured !== undefined) searchParams.set('featured', params.featured ? '1' : '0')
  if (params?.minPrice !== undefined) searchParams.set('min_price', String(params.minPrice))
  if (params?.maxPrice !== undefined) searchParams.set('max_price', String(params.maxPrice))
  if (params?.inStock) searchParams.set('in_stock', '1')
  if (params?.minLength !== undefined) searchParams.set('min_length', String(params.minLength))
  if (params?.maxLength !== undefined) searchParams.set('max_length', String(params.maxLength))
  if (params?.minWidth !== undefined) searchParams.set('min_width', String(params.minWidth))
  if (params?.maxWidth !== undefined) searchParams.set('max_width', String(params.maxWidth))
  if (params?.minHeight !== undefined) searchParams.set('min_height', String(params.minHeight))
  if (params?.maxHeight !== undefined) searchParams.set('max_height', String(params.maxHeight))

  const qs = searchParams.toString()
  return fetchApi<ProductListResponse>(`/products${qs ? `?${qs}` : ''}`)
}

export interface ProductSuggestion {
  id: number
  sku: string
  name: string
  stock: number
}

/** Sugerencias para el autocompletado del buscador. */
export async function searchProducts(search: string): Promise<ProductSuggestion[]> {
  const qs = new URLSearchParams({ search })
  return fetchApi<ProductSuggestion[]>(`/products/search?${qs.toString()}`)
}

export async function getProduct(id: number, channel?: BuyChannel): Promise<Product> {
  const qs = channel ? `?channel=${channel}` : ''
  return fetchApi<Product>(`/products/${id}${qs}`)
}

export async function getCategories(): Promise<Category[]> {
  return fetchApi<Category[]>('/categories')
}

export async function createCategory(data: { name: string; slug?: string; parentId?: number | null }): Promise<Category> {
  return fetchApi<Category>('/categories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function deleteCategory(id: number): Promise<void> {
  await fetchApi<{ message: string }>(`/categories/${id}`, { method: 'DELETE' })
}

export interface BrandInput {
  name: string
  slug?: string
}

export async function getBrands(): Promise<Brand[]> {
  return fetchApi<Brand[]>('/brands')
}

export async function createBrand(data: BrandInput): Promise<Brand> {
  return fetchApi<Brand>('/brands', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function updateBrand(id: number, data: BrandInput): Promise<Brand> {
  return fetchApi<Brand>(`/brands/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function deleteBrand(id: number): Promise<void> {
  await fetchApi<{ message: string }>(`/brands/${id}`, { method: 'DELETE' })
}

export interface CreateProductData {
  sku: string
  name: string
  description?: string
  shortDesc?: string
  regularPrice: number
  priceChilecompra?: number
  priceConvenioMarco?: number
  stock?: number
  status?: string
  featured?: boolean
  categoryIds?: number[]
  brandId?: number | null
  lengthCm?: number | null
  widthCm?: number | null
  heightCm?: number | null
  weightKg?: number | null
}

export async function createProduct(data: CreateProductData): Promise<Product> {
  return fetchApi<Product>('/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function updateProduct(id: number, data: Partial<CreateProductData>): Promise<Product> {
  return fetchApi<Product>(`/products/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function deleteProduct(id: number): Promise<void> {
  await fetchApi<{ message: string }>(`/products/${id}`, { method: 'DELETE' })
}

export interface ImportPreview {
  status: 'preview'
  total_rows: number
  valid_rows: number
  errors: string[]
  preview: Record<string, unknown>[]
}

export interface ImportResult {
  status: 'completed'
  created: number
  updated: number
  errors: string[]
}

export async function importProducts(file: File, confirm = false): Promise<ImportPreview | ImportResult> {
  const formData = new FormData()
  formData.append('file', file)
  if (confirm) formData.append('confirm', 'true')

  const res = await fetch(`${API_BASE}/products/import`, {
    method: 'POST',
    body: formData,
  })

  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error || `Import error: ${res.status}`)
  }

  return res.json() as Promise<ImportPreview | ImportResult>
}

function authHeaders(): Record<string, string> {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function downloadTemplate(): Promise<{ blob: Blob; filename: string }> {
  const res = await fetch(`${API_BASE}/products/template`, { headers: authHeaders() })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error || `Error al descargar plantilla (${res.status})`)
  }
  const blob = await res.blob()
  const cd = res.headers.get('Content-Disposition')
  const match = cd?.match(/filename="?([^";]+)"?/)
  const filename = match?.[1] || 'template_productos.xlsx'
  return { blob, filename }
}

export interface UploadImage {
  id: number
  productId: number
  url: string
  alt: string | null
  sortOrder: number
}

export async function uploadCompanyLogo(
  file: File,
  companyId?: number,
): Promise<{ logoUrl: string }> {
  const formData = new FormData()
  formData.append('logo', file)
  if (companyId) formData.append('companyId', String(companyId))

  const res = await fetch(`${API_BASE}/uploads/company-logo`, {
    method: 'POST',
    body: formData,
    headers: authHeaders(),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error || `Upload error: ${res.status}`)
  }

  return res.json() as Promise<{ logoUrl: string }>
}

export async function uploadImages(productId: number, files: File[]): Promise<UploadImage[]> {
  const formData = new FormData()
  for (const file of files) {
    formData.append('images', file)
  }

  const res = await fetch(`${API_BASE}/uploads/${productId}/images`, {
    method: 'POST',
    body: formData,
    headers: authHeaders(),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error || `Upload error: ${res.status}`)
  }

  return res.json() as Promise<UploadImage[]>
}

export async function deleteImage(productId: number, imageId: number): Promise<void> {
  await fetchApi<{ message: string }>(`/uploads/${productId}/images/${imageId}`, { method: 'DELETE' })
}

export async function uploadTechnicalSheet(productId: number, file: File): Promise<{ url: string }> {
  const formData = new FormData()
  formData.append('pdf', file)

  const res = await fetch(`${API_BASE}/uploads/${productId}/technical-sheet`, {
    method: 'POST',
    body: formData,
    headers: authHeaders(),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error || `Upload error: ${res.status}`)
  }

  return res.json() as Promise<{ url: string }>
}

export async function deleteTechnicalSheet(productId: number): Promise<void> {
  await fetchApi<{ message: string }>(`/uploads/${productId}/technical-sheet`, { method: 'DELETE' })
}

export type ProductDocType = 'hoja_seguridad' | 'manual' | 'ficha_tecnica' | 'otro'

/** Adjunta uno o varios PDFs (hoja de seguridad, manual, ficha técnica, otro). */
export async function uploadDocuments(
  productId: number,
  files: File[],
  docType: ProductDocType,
  title?: string
): Promise<ProductDocument[]> {
  const formData = new FormData()
  for (const file of files) {
    formData.append('files', file)
  }
  formData.append('docType', docType)
  if (title) formData.append('title', title)

  const res = await fetch(`${API_BASE}/uploads/${productId}/documents`, {
    method: 'POST',
    body: formData,
    headers: authHeaders(),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error || `Upload error: ${res.status}`)
  }

  return res.json() as Promise<ProductDocument[]>
}

export async function deleteDocument(productId: number, docId: number): Promise<void> {
  await fetchApi<{ message: string }>(`/uploads/${productId}/documents/${docId}`, { method: 'DELETE' })
}

export interface RegisterData {
  email: string
  password: string
  name: string
  companyName: string
  companyRut?: string
  companyAddress?: string
  companyPhone?: string
  companyType?: CompanyType
}

export interface RegisterCotizadorData {
  email: string
  password: string
  name: string
  phone?: string
  institution: string
  position?: string
  rut?: string
  companyType?: CompanyType
}

export async function register(data: RegisterData): Promise<LoginResponse> {
  return fetchApi<LoginResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function registerCotizador(data: RegisterCotizadorData): Promise<LoginResponse> {
  return fetchApi<LoginResponse>('/auth/register-cotizador', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  return fetchApi<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export async function getMe(): Promise<{ user: AuthUser; company: AuthCustomer | null; customer: AuthCustomer | null }> {
  return fetchApi('/auth/me')
}

export async function getUsers(): Promise<UserListItem[]> {
  return fetchApi<UserListItem[]>('/users')
}

export async function createUser(data: { email: string; password: string; name: string; role: string }): Promise<UserListItem> {
  return fetchApi<UserListItem>('/users', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateUser(id: number, data: { name?: string; email?: string; role?: string; active?: boolean; isMercadoPublico?: boolean }): Promise<UserListItem> {
  return fetchApi<UserListItem>(`/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function deleteUser(id: number): Promise<void> {
  await fetchApi<{ message: string }>(`/users/${id}`, { method: 'DELETE' })
}

export interface SubmitQuoteData {
  companyId?: number
  licitacionCode?: string
  userType: string
  items: Array<{ productId: number; name: string; sku: string | null; quantity: number; unitPrice: number }>
  total: number
  cotizanteName?: string
  cotizanteEmail?: string
  cotizantePhone?: string
  cotizanteInstitution?: string
  cotizantePosition?: string
  cotizanteRut?: string
}

export interface SubmitQuoteResponse {
  id: number
  status: string
  createdAt: string
  sellerName?: string | null
  sellerPhone?: string | null
}

export async function getQuote(id: number): Promise<QuoteListItem> {
  return fetchApi<QuoteListItem>(`/quotes/${id}`)
}

export async function downloadQuotePdf(id: number): Promise<Blob> {
  const token = getToken()
  const res = await fetch(`${API_BASE}/quotes/${id}/pdf`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error || 'No se pudo descargar la cotización')
  }
  return res.blob()
}

export async function submitQuote(data: SubmitQuoteData): Promise<SubmitQuoteResponse> {
  return fetchApi<SubmitQuoteResponse>('/quotes', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateQuoteStatus(id: number, status: string): Promise<QuoteListItem> {
  return fetchApi<QuoteListItem>(`/quotes/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  })
}

export interface QuoteListItem {
  id: number
  userId: number | null
  companyId: number | null
  customerId: number | null
  licitacionCode: string | null
  userType: string
  items: Array<{ productId: number; name: string; sku: string | null; quantity: number; unitPrice: number }>
  total: string
  cotizanteName: string | null
  cotizanteEmail: string | null
  cotizantePhone: string | null
  cotizanteInstitution: string | null
  cotizantePosition: string | null
  cotizanteRut: string | null
  status: string
  sellerName: string | null
  sellerPhone: string | null
  createdAt: string
  updatedAt?: string
}

export interface QuoteListResponse {
  data: QuoteListItem[]
  pagination: { page: number; per_page: number; total: number; total_pages: number }
}

export async function getQuotes(params?: { page?: number; perPage?: number; status?: string }): Promise<QuoteListResponse> {
  const sp = new URLSearchParams()
  if (params?.page) sp.set('page', String(params.page))
  if (params?.perPage) sp.set('per_page', String(params.perPage))
  if (params?.status) sp.set('status', params.status)
  const qs = sp.toString()
  return fetchApi<QuoteListResponse>(`/quotes${qs ? `?${qs}` : ''}`)
}

export interface QuoteStats {
  products: { total: number; active: number }
  quotations: { total: number; pending: number }
  revenue: number
  clients: number
  recentQuotes: QuoteListItem[]
}

export async function getQuoteStats(): Promise<QuoteStats> {
  return fetchApi<QuoteStats>('/quotes/stats')
}

export async function createOrder(data: CreateOrderData): Promise<CreateOrderResponse> {
  return fetchApi<CreateOrderResponse>('/orders', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function getOrders(params?: { page?: number; perPage?: number; status?: string }): Promise<OrderListResponse> {
  const sp = new URLSearchParams()
  if (params?.page) sp.set('page', String(params.page))
  if (params?.perPage) sp.set('per_page', String(params.perPage))
  if (params?.status) sp.set('status', params.status)
  const qs = sp.toString()
  return fetchApi<OrderListResponse>(`/orders${qs ? `?${qs}` : ''}`)
}

export async function getOrder(id: number): Promise<Order> {
  return fetchApi<Order>(`/orders/${id}`)
}

export async function cancelOrder(id: number): Promise<Order> {
  return fetchApi<Order>(`/orders/${id}/cancel`, { method: 'POST' })
}

export async function getAdminOrders(params?: { page?: number; perPage?: number; status?: string }): Promise<OrderListResponse> {
  const sp = new URLSearchParams()
  if (params?.page) sp.set('page', String(params.page))
  if (params?.perPage) sp.set('per_page', String(params.perPage))
  if (params?.status) sp.set('status', params.status)
  const qs = sp.toString()
  return fetchApi<OrderListResponse>(`/orders/admin${qs ? `?${qs}` : ''}`)
}

export async function getAdminOrder(id: number): Promise<Order> {
  return fetchApi<Order>(`/orders/admin/${id}`)
}

export async function updateOrderStatus(id: number, status: OrderStatus): Promise<Order> {
  return fetchApi<Order>(`/orders/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  })
}

export async function getPriceLists(): Promise<PriceList[]> {
  return fetchApi<PriceList[]>('/price-lists')
}

export interface CustomerAdminItem {
  id: number
  kind: 'persona' | 'empresa'
  name: string
  rut: string | null
  email: string | null
  phone: string | null
  address: string | null
  commune: string | null
  region: string | null
  billingAddress: string | null
  billingCommune: string | null
  billingRegion: string | null
  type: CompanyType
  paymentTerms: 'contado' | '30' | '60' | '90' | null
  priceLists: CustomerPriceList[]
  creditLimit: string
  creditUsed: string
  status: string
  userCount?: number
  createdAt: string
}

/** Vendedor registrado en la plataforma (catálogo propio). */
export interface CompanyAdminItem {
  id: number
  name: string
  slug: string
  legalName: string | null
  businessActivity: string | null
  rut: string | null
  address: string | null
  commune: string | null
  region: string | null
  phone: string | null
  email: string | null
  website: string | null
  logoUrl: string | null
  contactName: string | null
  contactRole: string | null
  contactEmail: string | null
  contactPhone: string | null
  status: string
  userCount: number
  createdAt: string
}

export async function getCompanies(params?: { search?: string }): Promise<CompanyAdminItem[]> {
  const sp = new URLSearchParams()
  if (params?.search) sp.set('search', params.search)
  const qs = sp.toString()
  return fetchApi<CompanyAdminItem[]>(`/companies${qs ? `?${qs}` : ''}`)
}

export async function createCustomer(
  data: Partial<Omit<CustomerAdminItem, 'id' | 'createdAt' | 'userCount'>> & { priceListIds?: number[] },
): Promise<CustomerAdminItem> {
  return fetchApi<CustomerAdminItem>('/customers', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function getCustomers(params?: { search?: string }): Promise<CustomerAdminItem[]> {
  const sp = new URLSearchParams()
  if (params?.search) sp.set('search', params.search)
  const qs = sp.toString()
  return fetchApi<CustomerAdminItem[]>(`/customers${qs ? `?${qs}` : ''}`)
}

export async function updateCustomer(
  id: number,
  data: Partial<Omit<CustomerAdminItem, 'id' | 'createdAt' | 'userCount'>> & { priceListIds?: number[] },
): Promise<CustomerAdminItem> {
  return fetchApi<CustomerAdminItem>(`/customers/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function updateCompany(
  id: number,
  data: {
    name?: string
    legalName?: string | null
    businessActivity?: string | null
    rut?: string | null
    address?: string | null
    commune?: string | null
    region?: string | null
    phone?: string | null
    email?: string | null
    website?: string | null
    contactName?: string | null
    contactRole?: string | null
    contactEmail?: string | null
    contactPhone?: string | null
    status?: string
  },
): Promise<CompanyAdminItem> {
  return fetchApi<CompanyAdminItem>(`/companies/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function getNotifications(): Promise<NotificationsResponse> {
  return fetchApi<NotificationsResponse>('/notifications')
}

export async function markNotificationRead(id: number): Promise<AppNotification> {
  return fetchApi<AppNotification>(`/notifications/${id}/read`, { method: 'PUT' })
}

export async function markAllNotificationsRead(): Promise<{ ok: boolean }> {
  return fetchApi<{ ok: boolean }>('/notifications/read-all', { method: 'PUT' })
}

export async function downloadOrderPdf(id: number): Promise<Blob> {
  const token = getToken()
  const res = await fetch(`${API_BASE}/orders/${id}/pdf`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })

  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error || `Error al descargar PDF: ${res.status}`)
  }
  return res.blob()
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
