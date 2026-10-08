import { useState, useRef, useEffect } from 'react'
import type { Product, ProductImage, ProductDocument, Category } from '../types/product.ts'
import {
  createProduct,
  updateProduct,
  uploadImages,
  deleteImage,
  uploadTechnicalSheet,
  deleteTechnicalSheet,
  getCategories,
  getBrands,
  uploadDocuments,
  deleteDocument,
  type ProductDocType,
} from '../services/api.ts'

interface Props {
  product: Product | null
  onSaved: () => void
  onCancel: () => void
}

interface FormData {
  sku: string
  name: string
  description: string
  shortDesc: string
  regularPrice: string
  stock: string
  status: string
  featured: boolean
  brandId: string
  lengthCm: string
  widthCm: string
  heightCm: string
  weightKg: string
}

const EMPTY_FORM: FormData = {
  sku: '',
  name: '',
  description: '',
  shortDesc: '',
  regularPrice: '',
  stock: '0',
  status: 'active',
  featured: false,
  brandId: '',
  lengthCm: '',
  widthCm: '',
  heightCm: '',
  weightKg: '',
}

function toForm(p: Product): FormData {
  return {
    sku: p.sku,
    name: p.name,
    description: p.description || '',
    shortDesc: p.shortDesc || '',
    regularPrice: p.regularPrice || '',
    stock: String(p.stock),
    status: p.status,
    featured: !!p.featured,
    brandId: p.brandId ? String(p.brandId) : '',
    lengthCm: p.lengthCm || '',
    widthCm: p.widthCm || '',
    heightCm: p.heightCm || '',
    weightKg: p.weightKg || '',
  }
}

export function ProductForm({ product, onSaved, onCancel }: Props) {
  const [form, setForm] = useState<FormData>(product ? toForm(product) : EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [images, setImages] = useState<ProductImage[]>(product?.images || [])
  const [uploadingImages, setUploadingImages] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)

  const [pendingImages, setPendingImages] = useState<{ file: File; url: string }[]>([])

  const [pendingDocs, setPendingDocs] = useState<{ file: File; docType: ProductDocType }[]>([])
  const [pendingPdf, setPendingPdf] = useState<File | null>(null)

  const [docs, setDocs] = useState<ProductDocument[]>(product?.documents || [])
  const [docType, setDocType] = useState<ProductDocType>('hoja_seguridad')
  const [uploadingDocs, setUploadingDocs] = useState(false)
  const docInputRef = useRef<HTMLInputElement>(null)

  const [techSheetUrl, setTechSheetUrl] = useState<string | null>(product?.technicalSheetUrl || null)
  const [uploadingPdf, setUploadingPdf] = useState(false)
  const pdfInputRef = useRef<HTMLInputElement>(null)

  const [categories, setCategories] = useState<Category[]>([])
  const [selectedCategories, setSelectedCategories] = useState<number[]>(
    product?.categories?.map((c) => c.categoryId) || [],
  )

  const [brands, setBrands] = useState<{ id: number; name: string }[]>([])

  useEffect(() => {
    let cancelled = false
    getCategories()
      .then((cats) => { if (!cancelled) setCategories(cats) })
      .catch(() => {})
    getBrands()
      .then((rows) => { if (!cancelled) setBrands(rows) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    return () => {
      setPendingImages((prev) => {
        prev.forEach((p) => URL.revokeObjectURL(p.url))
        return []
      })
    }
  }, [])

  function toggleCategory(id: number) {
    setSelectedCategories((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    )
  }

  function update(field: keyof FormData, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files?.length || !product) return

    setUploadingImages(true)
    setError(null)
    try {
      const uploaded = await uploadImages(product.id, Array.from(files))
      setImages((prev) => [...prev, ...uploaded])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error subiendo imágenes')
    } finally {
      setUploadingImages(false)
      if (imageInputRef.current) imageInputRef.current.value = ''
    }
  }

  function handlePendingImages(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files?.length) return
    const entries = Array.from(files).map((file) => ({
      file,
      url: URL.createObjectURL(file),
    }))
    setPendingImages((prev) => [...prev, ...entries])
    if (imageInputRef.current) imageInputRef.current.value = ''
  }

  function removePendingImage(index: number) {
    setPendingImages((prev) => {
      const target = prev[index]
      if (target) URL.revokeObjectURL(target.url)
      return prev.filter((_, i) => i !== index)
    })
  }

  function handlePendingDocUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files?.length) return
    const entries = Array.from(files).map((file) => ({ file, docType }))
    setPendingDocs((prev) => [...prev, ...entries])
    if (docInputRef.current) docInputRef.current.value = ''
  }

  function removePendingDoc(index: number) {
    setPendingDocs((prev) => prev.filter((_, i) => i !== index))
  }

  function handlePendingPdf(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPendingPdf(file)
    if (pdfInputRef.current) pdfInputRef.current.value = ''
  }

  async function handleDeleteImage(imageId: number) {
    if (!product) return
    try {
      await deleteImage(product.id, imageId)
      setImages((prev) => prev.filter((img) => img.id !== imageId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error eliminando imagen')
    }
  }

  async function handlePdfUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !product) return

    setUploadingPdf(true)
    setError(null)
    try {
      const result = await uploadTechnicalSheet(product.id, file)
      setTechSheetUrl(result.url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error subiendo ficha técnica')
    } finally {
      setUploadingPdf(false)
      if (pdfInputRef.current) pdfInputRef.current.value = ''
    }
  }

  async function handleDeletePdf() {
    if (!product) return
    try {
      await deleteTechnicalSheet(product.id)
      setTechSheetUrl(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error eliminando ficha técnica')
    }
  }

  async function handleDocUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files?.length || !product) return

    setUploadingDocs(true)
    setError(null)
    try {
      const uploaded = await uploadDocuments(product.id, Array.from(files), docType)
      setDocs((prev) => [...prev, ...uploaded])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error subiendo documentos')
    } finally {
      setUploadingDocs(false)
      if (docInputRef.current) docInputRef.current.value = ''
    }
  }

  async function handleDeleteDoc(docId: number) {
    if (!product) return
    try {
      await deleteDocument(product.id, docId)
      setDocs((prev) => prev.filter((d) => d.id !== docId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error eliminando documento')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!form.sku.trim() || !form.name.trim()) {
      setError('SKU y Nombre son requeridos')
      return
    }
    if (!form.regularPrice || Number(form.regularPrice) < 0) {
      setError('Precio regular es requerido y debe ser >= 0')
      return
    }

    setSaving(true)
    let createdId: number | null = null
    try {
      const data = {
        sku: form.sku.trim(),
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        shortDesc: form.shortDesc.trim() || undefined,
        regularPrice: Number(form.regularPrice),
        stock: Number(form.stock) || 0,
        status: form.status,
        featured: form.featured,
        categoryIds: selectedCategories,
        brandId: form.brandId ? Number(form.brandId) : null,
        lengthCm: form.lengthCm ? Number(form.lengthCm) : null,
        widthCm: form.widthCm ? Number(form.widthCm) : null,
        heightCm: form.heightCm ? Number(form.heightCm) : null,
        weightKg: form.weightKg ? Number(form.weightKg) : null,
      }

      if (product) {
        await updateProduct(product.id, data)
      } else {
        const created = await createProduct(data)
        createdId = created.id
        if (pendingImages.length > 0) {
          await uploadImages(created.id, pendingImages.map((p) => p.file))
        }
        if (pendingDocs.length > 0) {
          const grouped = new Map<ProductDocType, File[]>()
          for (const d of pendingDocs) {
            const arr = grouped.get(d.docType) ?? []
            arr.push(d.file)
            grouped.set(d.docType, arr)
          }
          for (const [type, files] of grouped) {
            await uploadDocuments(created.id, files, type)
          }
        }
        if (pendingPdf) {
          await uploadTechnicalSheet(created.id, pendingPdf)
        }
      }
      onSaved()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al guardar'
      setError(
        createdId
          ? `Producto creado, pero falló la subida de fotos/PDFs: ${msg}`
          : msg,
      )
      if (createdId) onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="product-form" onSubmit={handleSubmit}>
      <h3>{product ? 'Editar Producto' : 'Nuevo Producto'}</h3>

      {error && <div className="form-error">{error}</div>}

      <div className="form-section">
        <h4>Información del Producto</h4>
        <div className="form-grid">
          <div className="form-field">
            <label htmlFor="pf-sku">SKU *</label>
            <input id="pf-sku" value={form.sku} onChange={(e) => update('sku', e.target.value)} />
          </div>
          <div className="form-field">
            <label htmlFor="pf-name">Nombre *</label>
            <input id="pf-name" value={form.name} onChange={(e) => update('name', e.target.value)} />
          </div>
          <div className="form-field form-field-full">
            <label htmlFor="pf-short">Descripción Corta</label>
            <input id="pf-short" value={form.shortDesc} onChange={(e) => update('shortDesc', e.target.value)} />
          </div>
          <div className="form-field form-field-full">
            <label htmlFor="pf-desc">Descripción</label>
            <textarea id="pf-desc" rows={4} value={form.description} onChange={(e) => update('description', e.target.value)} />
          </div>
        </div>
      </div>

      <div className="form-section">
        <h4>Precios y Stock</h4>
        <div className="form-grid">
          <div className="form-field">
            <label htmlFor="pf-price">Precio Regular *</label>
            <input id="pf-price" type="number" min="0" step="1" value={form.regularPrice} onChange={(e) => update('regularPrice', e.target.value)} />
          </div>
          <div className="form-field">
            <label htmlFor="pf-stock">Stock</label>
            <input id="pf-stock" type="number" min="0" value={form.stock} onChange={(e) => update('stock', e.target.value)} />
          </div>
          <div className="form-field">
            <label htmlFor="pf-status">Estado</label>
            <select id="pf-status" value={form.status} onChange={(e) => update('status', e.target.value)}>
              <option value="active">Activo</option>
              <option value="inactive">Inactivo</option>
            </select>
          </div>
          <div className="form-field">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={form.featured}
                onChange={(e) => update('featured', e.target.checked)}
              />
              Mostrar en Destacados (home)
            </label>
          </div>
        </div>
      </div>

      <div className="form-section">
        <h4>Dimensiones y peso</h4>
        <div className="form-grid">
          <div className="form-field">
            <label htmlFor="pf-len">Largo (cm)</label>
            <input id="pf-len" type="number" min="0" step="0.01" value={form.lengthCm} onChange={(e) => update('lengthCm', e.target.value)} />
          </div>
          <div className="form-field">
            <label htmlFor="pf-width">Ancho (cm)</label>
            <input id="pf-width" type="number" min="0" step="0.01" value={form.widthCm} onChange={(e) => update('widthCm', e.target.value)} />
          </div>
          <div className="form-field">
            <label htmlFor="pf-height">Alto (cm)</label>
            <input id="pf-height" type="number" min="0" step="0.01" value={form.heightCm} onChange={(e) => update('heightCm', e.target.value)} />
          </div>
          <div className="form-field">
            <label htmlFor="pf-weight">Peso (kg)</label>
            <input id="pf-weight" type="number" min="0" step="0.001" value={form.weightKg} onChange={(e) => update('weightKg', e.target.value)} />
          </div>
        </div>
      </div>

      <div className="form-section">
        <h4>Categoría y Marca</h4>
        <div className="form-grid">
          <div className="form-field">
            <label htmlFor="pf-brand">Marca</label>
            <select
              id="pf-brand"
              value={form.brandId}
              onChange={(e) => update('brandId', e.target.value)}
            >
              <option value="">Sin marca</option>
              {brands.map((brand) => (
                <option key={brand.id} value={String(brand.id)}>{brand.name}</option>
              ))}
            </select>
          </div>
        </div>
        {categories.length === 0 ? (
          <p className="form-hint">No hay categorías disponibles. Créalas en Productos → Categorías.</p>
        ) : (
          <div className="category-picker">
            {categories.map((cat) => (
              <label key={cat.id} className="category-chip">
                <input
                  type="checkbox"
                  checked={selectedCategories.includes(cat.id)}
                  onChange={() => toggleCategory(cat.id)}
                />
                {cat.name}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="form-section">
        <h4>Fotos del Producto</h4>
        {product ? (
          <>
            <div className="image-upload-zone" onClick={() => imageInputRef.current?.click()}>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                onChange={handleImageUpload}
                hidden
              />
              {uploadingImages ? (
                <p>Subiendo imágenes...</p>
              ) : (
                <p>Haz clic o arrastra imágenes aquí (máx. 5MB cada una)</p>
              )}
            </div>
            {images.length > 0 && (
              <div className="image-preview-grid">
                {images.map((img) => (
                  <div key={img.id} className="image-preview-item">
                    <img src={img.url} alt={img.alt || ''} />
                    <button type="button" className="image-delete-btn" onClick={() => handleDeleteImage(img.id)}>
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <p className="form-hint">
              Selecciona las fotos ahora; se subirán al guardar el producto. Puedes elegir varias.
            </p>
            <div className="image-upload-zone" onClick={() => imageInputRef.current?.click()}>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                onChange={handlePendingImages}
                hidden
              />
              {pendingImages.length === 0 ? (
                <p>Haz clic para seleccionar las fotos (max. 5MB cada una)</p>
              ) : (
                <p>{pendingImages.length} foto(s) seleccionada(s) - haz clic para agregar más</p>
              )}
            </div>
            {pendingImages.length > 0 && (
              <div className="image-preview-grid">
                {pendingImages.map((p, i) => (
                  <div key={i} className="image-preview-item">
                    <img src={p.url} alt="" />
                    <button type="button" className="image-delete-btn" onClick={() => removePendingImage(i)}>
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {product ? (
        <>
          <div className="form-section">
            <h4>Documentos adicionales (PDF)</h4>
            <p className="form-hint">
              Hojas de seguridad, manuales y otras fichas. Un producto puede tener varios documentos.
            </p>
            <div className="form-field">
              <label htmlFor="pf-doctype">Tipo de documento</label>
              <select id="pf-doctype" value={docType} onChange={(e) => setDocType(e.target.value as ProductDocType)}>
                <option value="hoja_seguridad">Hoja de seguridad</option>
                <option value="manual">Manual</option>
                <option value="ficha_tecnica">Ficha técnica</option>
                <option value="otro">Otro</option>
              </select>
            </div>
            <div className="image-upload-zone" onClick={() => docInputRef.current?.click()}>
              <input
                ref={docInputRef}
                type="file"
                accept="application/pdf"
                multiple
                onChange={handleDocUpload}
                hidden
              />
              {uploadingDocs ? <p>Subiendo documentos...</p> : <p>Haz clic para subir uno o varios PDF (máx. 10MB c/u)</p>}
            </div>
            {docs.length > 0 && (
              <ul className="doc-manage-list">
                {docs.map((doc) => (
                  <li key={doc.id}>
                    <a href={doc.fileUrl} target="_blank" rel="noreferrer">{doc.title}</a>
                    <button type="button" className="pdf-delete-btn" onClick={() => handleDeleteDoc(doc.id)}>
                      Eliminar
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="form-section">
            <h4>Ficha Técnica (PDF)</h4>
            {techSheetUrl ? (
              <div className="pdf-existing">
                <a href={techSheetUrl} target="_blank" rel="noreferrer">📄 Ver ficha técnica</a>
                <button type="button" className="pdf-delete-btn" onClick={handleDeletePdf}>Eliminar</button>
              </div>
            ) : (
              <div className="image-upload-zone" onClick={() => pdfInputRef.current?.click()}>
                <input
                  ref={pdfInputRef}
                  type="file"
                  accept="application/pdf"
                  onChange={handlePdfUpload}
                  hidden
                />
                {uploadingPdf ? (
                  <p>Subiendo ficha técnica...</p>
                ) : (
                  <p>Haz clic para subir un archivo PDF</p>
                )}
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="form-section">
            <h4>Documentos adicionales (PDF)</h4>
            <p className="form-hint">
              Hojas de seguridad, manuales y otras fichas. Se subirán al guardar el producto.
            </p>
            <div className="form-field">
              <label htmlFor="pf-doctype-new">Tipo de documento</label>
              <select id="pf-doctype-new" value={docType} onChange={(e) => setDocType(e.target.value as ProductDocType)}>
                <option value="hoja_seguridad">Hoja de seguridad</option>
                <option value="manual">Manual</option>
                <option value="ficha_tecnica">Ficha técnica</option>
                <option value="otro">Otro</option>
              </select>
            </div>
            <div className="image-upload-zone" onClick={() => docInputRef.current?.click()}>
              <input
                ref={docInputRef}
                type="file"
                accept="application/pdf"
                multiple
                onChange={handlePendingDocUpload}
                hidden
              />
              <p>Haz clic para elegir uno o varios PDF (máx. 10MB c/u)</p>
            </div>
            {pendingDocs.length > 0 && (
              <ul className="doc-manage-list">
                {pendingDocs.map((d, i) => (
                  <li key={i}>
                    <span>{d.file.name}</span>
                    <button type="button" className="pdf-delete-btn" onClick={() => removePendingDoc(i)}>
                      Eliminar
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="form-section">
            <h4>Ficha Técnica (PDF)</h4>
            {pendingPdf ? (
              <div className="pdf-existing">
                <span>📄 {pendingPdf.name}</span>
                <button type="button" className="pdf-delete-btn" onClick={() => setPendingPdf(null)}>Eliminar</button>
              </div>
            ) : (
              <div className="image-upload-zone" onClick={() => pdfInputRef.current?.click()}>
                <input
                  ref={pdfInputRef}
                  type="file"
                  accept="application/pdf"
                  onChange={handlePendingPdf}
                  hidden
                />
                <p>Haz clic para elegir un archivo PDF</p>
              </div>
            )}
          </div>
        </>
      )}

      <div className="form-actions">
        <button type="button" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="send-quote-btn" disabled={saving}>
          {saving ? 'Guardando...' : product ? 'Actualizar' : 'Crear Producto'}
        </button>
      </div>
    </form>
  )
}
