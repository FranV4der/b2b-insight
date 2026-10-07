import type { LicitacionResponse } from '../types/mercadopublico.ts'

const API_BASE = '/api/mp'

export async function getLicitacionByCode(codigo: string): Promise<LicitacionResponse | null> {
  const res = await fetch(`${API_BASE}/licitaciones.json?codigo=${encodeURIComponent(codigo)}`)
  if (!res.ok) {
    if (res.status === 404) return null
    if (res.status === 401 || res.status === 403 || res.status >= 500) {
      throw new Error('Servicio de Mercado Público temporalmente no disponible')
    }
    throw new Error(`Mercado Público API error: ${res.status} ${res.statusText}`)
  }
  const data = await res.json() as LicitacionResponse
  return data
}
