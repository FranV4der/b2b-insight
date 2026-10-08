import { useRef, useState } from 'react'
import { importProducts, downloadTemplate, type ImportPreview, type ImportResult } from '../services/api.ts'

interface Props {
  onImported: () => void
}

export function ExcelUploader({ onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setPreview(null)
    setResult(null)
    setError(null)
    doPreview(f)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (!f) return
    setFile(f)
    setPreview(null)
    setResult(null)
    setError(null)
    doPreview(f)
  }

  async function doPreview(f: File) {
    setLoading(true)
    setError(null)
    try {
      const res = await importProducts(f, false)
      if (res.status === 'preview') {
        setPreview(res)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al analizar archivo')
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirm() {
    if (!file) return
    setLoading(true)
    setError(null)
    try {
      const res = await importProducts(file, true)
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
      const { blob, filename } = await downloadTemplate()
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

  function handleReset() {
    setFile(null)
    setPreview(null)
    setResult(null)
    setError(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="excel-uploader">
      <div className="uploader-header">
        <h3>Carga Masiva de Productos</h3>
        <button type="button" className="template-link" onClick={handleDownloadTemplate}>Descargar plantilla Excel</button>
      </div>

      {!file && (
        <div
          className="drop-zone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
        >
          <p>Arrastra un archivo .xlsx aquí o haz click para seleccionar</p>
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
          <button onClick={handleReset}>Intentar otro archivo</button>
        </div>
      )}

      {preview && (
        <div className="preview-panel">
          <div className="preview-summary">
            <span>Filas válidas: <strong>{preview.valid_rows}</strong> de {preview.total_rows}</span>
          </div>

          {preview.errors.length > 0 && (
            <div className="preview-errors">
              <p>Errores:</p>
              <ul>
                {preview.errors.slice(0, 10).map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
                {preview.errors.length > 10 && <li>... y {preview.errors.length - 10} más</li>}
              </ul>
            </div>
          )}

          {preview.preview.length > 0 && (
            <table className="preview-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Nombre</th>
                  <th>Precio</th>
                  <th>P. ChileCompra</th>
                  <th>P. Convenio Marco</th>
                  <th>Stock</th>
                </tr>
              </thead>
              <tbody>
                {preview.preview.map((row, i) => (
                  <tr key={i}>
                    <td>{String(row.sku || '')}</td>
                    <td>{String(row.name || '')}</td>
                    <td>{row.regular_price != null ? `$${Number(row.regular_price).toLocaleString('es-CL')}` : '-'}</td>
                    <td>{row.price_chilecompra != null ? `$${Number(row.price_chilecompra).toLocaleString('es-CL')}` : '-'}</td>
                    <td>{row.price_convenio_marco != null ? `$${Number(row.price_convenio_marco).toLocaleString('es-CL')}` : '-'}</td>
                    <td>{row.stock != null ? String(row.stock) : '0'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="preview-actions">
            <button onClick={handleReset}>Cancelar</button>
            <button
              className="send-quote-btn"
              onClick={handleConfirm}
              disabled={loading || preview.valid_rows === 0}
            >
              {loading ? 'Importando...' : `Confirmar Importación (${preview.valid_rows} productos)`}
            </button>
          </div>
        </div>
      )}

      {result && (
        <div className="import-result">
          <div className="result-success">
            <p>Importación completada</p>
            <p>Creados: <strong>{result.created}</strong> | Actualizados: <strong>{result.updated}</strong></p>
          </div>
          {result.errors.length > 0 && (
            <div className="preview-errors">
              <p>Errores:</p>
              <ul>
                {result.errors.map((err, i) => <li key={i}>{err}</li>)}
              </ul>
            </div>
          )}
          <button onClick={handleReset}>Importar otro archivo</button>
        </div>
      )}
    </div>
  )
}
