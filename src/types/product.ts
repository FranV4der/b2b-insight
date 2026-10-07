export interface ProductDocument {
  id: number
  productId: number
  docType: 'hoja_seguridad' | 'manual' | 'ficha_tecnica' | 'otro'
  title: string
  fileUrl: string
  fileName: string
  fileSize: number
  createdAt: string
}

export interface ProductImage {
  id: number
  productId: number
  url: string
  alt: string | null
  sortOrder: number
}

export interface ProductCategory {
  categoryId: number
  name: string
  slug: string
}

export interface Category {
  id: number
  name: string
  slug: string
  parentId: number | null
  productCount?: string | number
}

export interface Brand {
  id: number
  name: string
  slug: string
  createdAt?: string
  updatedAt?: string
  productCount?: string | number
}

export interface Product {
  id: number
  sku: string
  name: string
  description: string | null
  shortDesc: string | null
  regularPrice: string | null
  priceChilecompra: string | null
  priceConvenioMarco: string | null
  technicalSheetUrl: string | null
  lengthCm: string | null
  widthCm: string | null
  heightCm: string | null
  weightKg: string | null
  stock: number
  status: string
  featured: boolean
  priceListPrice: string | null
  priceListDiscount: string | null
  brandId: number | null
  brandName: string | null
  createdAt: string
  updatedAt: string
  categories?: ProductCategory[]
  images?: ProductImage[]
  documents?: ProductDocument[]
}

export interface ProductListResponse {
  data: Product[]
  pagination: {
    page: number
    per_page: number
    total: number
    total_pages: number
  }
}
