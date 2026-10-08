import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react'
import type { UserType } from '../types/user.ts'
import type { View, QuoteItem } from '../types/quote.ts'
import type { Product } from '../types/product.ts'
import type { AdminTab } from '../types/panel.ts'
import { useAuth } from './AuthContext.tsx'
import { loadCart, saveCart, clearCart, purgeLegacyCart } from '../utils/cartStorage.ts'

interface AppState {
  userType: UserType
  view: View
  items: QuoteItem[]
  licitacionCode: string
  selectedProduct: Product | null
  selectedOrder: number | null
  storeSearch: string
  storeCategory: number | null
  adminTab: AdminTab
  /** Producto en edición en el formulario del panel (null = formulario vacío). */
  editingProduct: Product | null
}

interface AppContextType extends AppState {
  setUserType: (t: UserType) => void
  navigate: (v: View) => void
  /** Selecciona una sección del panel y descarta el producto en edición. */
  gotoAdmin: (t: AdminTab) => void
  /** Abre el formulario de producto con un producto a editar. */
  editProduct: (p: Product) => void
  viewProduct: (product: Product) => void
  backToCatalog: () => void
  addItem: (product: Product, qty?: number) => void
  removeItem: (productId: number) => void
  updateQuantity: (productId: number, qty: number) => void
  setLicitacionCode: (code: string) => void
  setStoreSearch: (search: string) => void
  setStoreCategory: (categoryId: number | null) => void
  clearQuote: () => void
  isInQuote: (productId: number) => boolean
  viewOrder: (orderId: number) => void
  backToOrders: () => void
}

const AppContext = createContext<AppContextType | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const userEmail = user?.email ?? null

  const [state, setState] = useState<AppState>(() => {
    const saved = loadCart(userEmail)
    return {
      userType: null,
      view: 'home',
      items: saved.items,
      licitacionCode: saved.licitacionCode,
      selectedProduct: null,
      selectedOrder: null,
      storeSearch: '',
      storeCategory: null,
      adminTab: 'list',
      editingProduct: null,
    }
  })

  const [cartOwner, setCartOwner] = useState<string | null>(userEmail)

  // Ajustar el carrito en render cuando cambia el usuario activo.
  if (cartOwner !== userEmail) {
    setCartOwner(userEmail)
    const saved = userEmail ? loadCart(userEmail) : { items: [], licitacionCode: '' }
    setState((prev) => ({
      ...prev,
      items: saved.items,
      licitacionCode: saved.licitacionCode,
    }))
  }

  const lastEmailRef = useRef<string | null>(userEmail)

  useEffect(() => {
    purgeLegacyCart()
  }, [])

  useEffect(() => {
    const prev = lastEmailRef.current
    lastEmailRef.current = userEmail
    if (prev && !userEmail) clearCart(prev)
  }, [userEmail])

  useEffect(() => {
    if (!userEmail || cartOwner !== userEmail) return
    saveCart(userEmail, { items: state.items, licitacionCode: state.licitacionCode })
  }, [userEmail, cartOwner, state.items, state.licitacionCode])

  const setUserType = useCallback((userType: UserType) => {
    setState((prev) => ({ ...prev, userType }))
  }, [])

  const navigate = useCallback((view: View) => {
    setState((prev) => ({ ...prev, view }))
  }, [])

  // Navega al panel, selecciona una sección y descarta el producto en edición.
  const gotoAdmin = useCallback((adminTab: AdminTab) => {
    setState((prev) => ({ ...prev, view: 'admin', adminTab, editingProduct: null }))
  }, [])

  const editProduct = useCallback((editingProduct: Product) => {
    setState((prev) => ({ ...prev, view: 'admin', adminTab: 'create', editingProduct }))
  }, [])

  const viewProduct = useCallback((product: Product) => {
    setState((prev) => ({ ...prev, selectedProduct: product, view: 'product-detail' }))
  }, [])

  const backToCatalog = useCallback(() => {
    setState((prev) => ({ ...prev, selectedProduct: null, view: 'catalog' }))
  }, [])

  const addItem = useCallback((product: Product, qty = 1) => {
    setState((prev) => {
      const existing = prev.items.find((i) => i.product.id === product.id)
      if (existing) {
        return {
          ...prev,
          items: prev.items.map((i) =>
            i.product.id === product.id ? { ...i, quantity: i.quantity + qty } : i,
          ),
        }
      }
      return { ...prev, items: [...prev.items, { product, quantity: qty }] }
    })
  }, [])

  const removeItem = useCallback((productId: number) => {
    setState((prev) => ({
      ...prev,
      items: prev.items.filter((i) => i.product.id !== productId),
    }))
  }, [])

  const updateQuantity = useCallback((productId: number, qty: number) => {
    setState((prev) => ({
      ...prev,
      items: qty < 1
        ? prev.items.filter((i) => i.product.id !== productId)
        : prev.items.map((i) =>
            i.product.id === productId ? { ...i, quantity: qty } : i,
          ),
    }))
  }, [])

  const setLicitacionCode = useCallback((code: string) => {
    setState((prev) => ({ ...prev, licitacionCode: code }))
  }, [])

  const setStoreSearch = useCallback((storeSearch: string) => {
    setState((prev) => ({ ...prev, storeSearch }))
  }, [])

  const setStoreCategory = useCallback((storeCategory: number | null) => {
    setState((prev) => ({ ...prev, storeCategory }))
  }, [])

  const clearQuote = useCallback(() => {
    setState((prev) => ({ ...prev, items: [], licitacionCode: '' }))
  }, [])

  const isInQuote = useCallback((productId: number) => {
    return state.items.some((i) => i.product.id === productId)
  }, [state.items])

  const viewOrder = useCallback((orderId: number) => {
    setState((prev) => ({ ...prev, selectedOrder: orderId, view: 'order-detail' }))
  }, [])

  const backToOrders = useCallback(() => {
    setState((prev) => ({ ...prev, selectedOrder: null, view: 'orders' }))
  }, [])

  return (
    <AppContext.Provider
      value={{
        ...state,
        setUserType,
        navigate,
        gotoAdmin,
        editProduct,
        viewProduct,
        backToCatalog,
        addItem,
        removeItem,
        updateQuantity,
        setLicitacionCode,
        setStoreSearch,
        setStoreCategory,
        clearQuote,
        isInQuote,
        viewOrder,
        backToOrders,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useApp(): AppContextType {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
