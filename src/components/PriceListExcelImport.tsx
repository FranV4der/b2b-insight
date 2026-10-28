import { useRef, useState } from 'react'
import {
  importPriceListPrices,
  downloadPriceListTemplate,
  type PriceListImportPreview,
  type PriceListImportResult,
} from '../services/api.ts'
import { formatCLPWithSymbol } from '../utils/format.ts'

interface Props {
  priceListId: number
  onImported: () => void
}

export function PriceListExcelImport({ priceListId, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<PriceListImportPreview | null>(null)
  const [result, setResult] = useState<PriceListImportResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  function reset() {
    setFile(null)
    setPreview(null)
    setResult(null)
    setError(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function doPreview(f: File) {
    setLoading(true)
    setError(null)
    try {
      const res = await importPriceListPrices(priceListId, f, false)
      if (res.status === 'preview') setPreview(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al analizar archivo')
    } finally {
      setLoading(false)
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setPreview(null)
    setResult(null)
    setError(null)
    void doPreview(f)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (!f) return
    setFile(f)
    setPreview(null)
    setResult(null)
    setError(null)
    void doPreview(f)
  }

  async function handleConfirm() {
    if (!file) return
    setLoading(true)
    setError(null)
    try {
      const res = await importPriceListPrices(priceListId, file, true)
      if (res.status === 'completed') {
        setResult(res)
        setPreview(null)
        onImported()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al importar')
    } finally {
      setLoading(false)
    }
  }

  async function handleDownloadTemplate() {
    setError(null)
    try {
      const { blob, filename } = await downloadPriceListTemplate(priceListId)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al descargar plantilla')
    }
  }

  return (
    <div className="excel-uploader">
      <div className="uploader-header">
        <h4>Carga masiva de precios (Excel)</h4>
        <button type="button" className="template-link" onClick={handleDownloadTemplate}>
          Descargar plantilla
        </button>
      </div>

      {!file && (
        <div
          className={`drop-zone${dragOver ? ' drag-over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            handleDrop(e)
          }}
          onClick={() => fileRef.current?.click()}
        >
          <p className="drop-title">Arrastra un archivo .xlsx aquí o haz click para seleccionar</p>
          <p className="muted">Columnas: SKU | Precio | Descuento % (opcional) | Cantidad Mínima (opcional)</p>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileChange}
            hidden
          />
        </div>
      )}

      {file && !preview && !result && !error && (
        <div className="uploader-status">
          <p>Archivo: <strong>{file.name}</strong></p>
          {loading && <p className="loading">Analizando archivo...</p>}
        </div>
      )}

      {error && (
        <div className="uploader-status">
          <div className="form-error">{error}</div>
          <button onClick={reset}>Intentar otro archivo</button>
        </div>
      )}

      {preview && (
        <div className="preview-panel">
          <div className="preview-summary">
            <span>Precios válidos: <strong>{preview.valid_rows}</strong> de {preview.total_rows}</span>
            {preview.pending_rows > 0 && (
              <span className="muted"> · Pendientes (SKU sin producto): <strong>{preview.pending_rows}</strong></span>
            )}
          </div>

          {preview.errors.length > 0 && (
            <div className="preview-errors">
              <p>Errores:</p>
              <ul>
                {preview.errors.slice(0, 10).map((err, i) => <li key={i}>{err}</li>)}
                {preview.errors.length > 10 && <li>... y {preview.errors.length - 10} más</li>}
              </ul>
            </div>
          )}

          {preview.pending_rows > 0 && (
            <div className="preview-note">
              <p>
                {preview.pending_rows} SKU(s) aún no existen como producto. Se guardarán como
                <strong> precios pendientes</strong> y se engancharán automáticamente al crear el producto con ese SKU.
              </p>
            </div>
          )}

          {preview.preview.length > 0 && (
            <table className="preview-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Producto</th>
                  <th>Precio</th>
                  <th>Dto %</th>
                  <th>Min.</th>
                </tr>
              </thead>
              <tbody>
                {preview.preview.map((row, i) => (
                  <tr key={i}>
                    <td>{row.sku}</td>
                    <td>{row.pending ? <span className="muted">Pendiente</span> : row.productName}</td>
                    <td>{formatCLPWithSymbol(row.price)}</td>
                    <td>{row.discount != null ? `${row.discount}%` : '-'}</td>
                    <td>{row.minQuantity ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="preview-actions">
            <button onClick={reset}>Cancelar</button>
            <button
              className="send-quote-btn"
              onClick={handleConfirm}
              disabled={loading || preview.total_rows === 0}
            >
              {loading ? 'Importando...' : `Confirmar (${preview.valid_rows} con producto, ${preview.pending_rows} pendientes)`}
            </button>
          </div>
        </div>
      )}

      {result && (
        <div className="import-result">
          <div className="result-success">
            <p>Importación de precios completada</p>
            <p>Nuevos: <strong>{result.inserted}</strong> | Actualizados: <strong>{result.updated}</strong> | Pendientes: <strong>{result.pending}</strong></p>
          </div>
          {result.errors.length > 0 && (
            <div className="preview-errors">
              <p>Errores:</p>
              <ul>
                {result.errors.map((err, i) => <li key={i}>{err}</li>)}
              </ul>
            </div>
          )}
          <button onClick={reset}>Importar otro archivo</button>
        </div>
      )}
    </div>
  )
}