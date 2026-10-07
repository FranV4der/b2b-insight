import { useEffect, useRef, useState } from 'react'
import type { Licitacion } from '../types/mercadopublico.ts'
import { getLicitacionByCode } from '../services/mercadopublico.ts'

interface Props {
  code: string
}

export function LicitacionInfo({ code }: Props) {
  const [data, setData] = useState<Licitacion | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const prevCode = useRef('')

  useEffect(() => {
    const trimmed = code.trim()
    if (!trimmed || trimmed === prevCode.current) return
    prevCode.current = trimmed

    let ignore = false
    setLoading(true); setError(null); setData(null)

    getLicitacionByCode(trimmed).then((res) => {
      if (ignore) return
      if (!res) {
        setError('Licitación no encontrada')
      } else {
        setData(res.Licitaciones.Listado.Licitacion)
      }
      setLoading(false)
    }).catch((e: unknown) => {
      if (ignore) return
      if (e instanceof Error && /(ticket|502|503|504|servicio|no disponible|API)/i.test(e.message)) {
        setError('Temporalmente no podemos verificar la licitación con Mercado Público. Puedes continuar con el código ingresado.')
      } else {
        setError(e instanceof Error ? e.message : 'Error al consultar licitación')
      }
      setLoading(false)
    })

    return () => { ignore = true }
  }, [code])

  if (!code.trim()) return null

  return (
    <div className="licitacion-info">
      {loading && <p className="mp-loading">Consultando licitación...</p>}
      {error && <p className="mp-error">{error}</p>}
      {data && (
        <div className="licitacion-detail">
          <h4>Licitación: {data.CodigoExterno}</h4>
          <p><strong>Nombre:</strong> {data.Nombre}</p>
          {data.Descripcion && <p><strong>Descripción:</strong> {data.Descripcion}</p>}
          <p><strong>Estado:</strong> {data.Estado}</p>
          <p><strong>Comprador:</strong> {data.Comprador.NombreOrganismo}</p>
          {data.MontoEstimado > 0 && (
            <p><strong>Monto estimado:</strong> ${data.MontoEstimado.toLocaleString('es-CL')} {data.UnidadMoneda}</p>
          )}
        </div>
      )}
    </div>
  )
}
