import { useEffect, useState } from 'react'
import type { UserListItem, UserRole } from '../types/auth.ts'
import { getUsers, createUser, updateUser, deleteUser } from '../services/api.ts'
import { useAuth } from '../context/AuthContext.tsx'

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador',
  empresa: 'Empresa',
  cotizador: 'Cotizador',
}

export function UserManagement() {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState<UserListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'cotizador' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadUsers()
  }, [])

  async function loadUsers() {
    setLoading(true)
    try {
      const data = await getUsers()
      setUsers(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar usuarios')
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!form.name.trim() || !form.email.trim() || !form.password) {
      setError('Nombre, email y contraseña son requeridos')
      return
    }

    if (form.password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres')
      return
    }

    setSaving(true)
    try {
      await createUser({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        role: form.role,
      })
      setForm({ name: '', email: '', password: '', role: 'cotizador' })
      setShowForm(false)
      await loadUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear usuario')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleActive(u: UserListItem) {
    try {
      await updateUser(u.id, { active: !u.active })
      await loadUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar usuario')
    }
  }

  async function handleToggleMp(u: UserListItem) {
    try {
      await updateUser(u.id, { isMercadoPublico: !u.isMercadoPublico })
      await loadUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar usuario')
    }
  }

  async function handleDelete(u: UserListItem) {
    if (u.id === currentUser?.id) {
      setError('No puedes eliminar tu propia cuenta')
      return
    }
    if (!confirm(`¿Eliminar al usuario ${u.name}?`)) return

    try {
      await deleteUser(u.id)
      await loadUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar usuario')
    }
  }

  return (
    <div className="user-management">
      <div className="user-mgmt-header">
        <h3>Gestión de Usuarios</h3>
        <button className="send-quote-btn" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancelar' : '+ Nuevo Usuario'}
        </button>
      </div>

      {error && <div className="form-error">{error}</div>}

      {showForm && (
        <form className="user-form" onSubmit={handleCreate}>
          <div className="form-grid">
            <div className="form-field">
              <label>Nombre *</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="form-field">
              <label>Email *</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="form-field">
              <label>Contraseña *</label>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Mínimo 8 caracteres" />
            </div>
            <div className="form-field">
              <label>Rol</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="cotizador">Cotizador</option>
                <option value="empresa">Empresa</option>
              </select>
            </div>
          </div>
          <div className="form-actions">
            <button type="submit" className="send-quote-btn" disabled={saving}>
              {saving ? 'Creando...' : 'Crear Usuario'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="loading">Cargando usuarios...</div>
      ) : (
        <table className="product-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Email</th>
              <th>Rol</th>
              <th>M. Público</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>
                  <span className={`role-badge role-${u.role}`}>
                    {ROLE_LABELS[u.role]}
                  </span>
                </td>
                <td>
                  <button className="table-btn" onClick={() => handleToggleMp(u)}>
                    {u.isMercadoPublico ? 'Sí' : 'No'}
                  </button>
                </td>
                <td>
                  <span className={`status-badge ${u.active ? 'status-active' : 'status-inactive'}`}>
                    {u.active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="actions-cell">
                  {u.id !== currentUser?.id && (
                    <>
                      <button className="table-btn" onClick={() => handleToggleActive(u)}>
                        {u.active ? 'Desactivar' : 'Activar'}
                      </button>
                      <button className="table-btn table-btn-danger" onClick={() => handleDelete(u)}>
                        Eliminar
                      </button>
                    </>
                  )}
                  {u.id === currentUser?.id && (
                    <span className="current-user-label">Tú</span>
                  )}
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={6} className="empty-cell">No hay usuarios</td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  )
}
