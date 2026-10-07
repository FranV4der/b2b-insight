import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext.tsx'
import { getNotifications, markAllNotificationsRead, markNotificationRead } from '../services/api.ts'
import type { AppNotification } from '../types/notification.ts'

export function NotificationBell() {
  const { viewOrder } = useApp()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [unread, setUnread] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getNotifications()
      .then((res) => {
        if (!cancelled) {
          setNotifications(res.data)
          setUnread(res.unread)
          setError(null)
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Error al cargar notificaciones')
        }
      })
    return () => { cancelled = true }
  }, [open])

  function handleToggle(e: React.MouseEvent) {
    e.stopPropagation()
    setOpen((prev) => !prev)
  }

  async function handleRead(n: AppNotification) {
    if (!n.isRead) {
      try {
        await markNotificationRead(n.id)
        setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)))
        setUnread((prev) => Math.max(0, prev - 1))
      } catch {
        // la notificación se marcará en la próxima carga
      }
    }
    if (n.referenceType === 'order' && n.referenceId != null) {
      viewOrder(n.referenceId)
      setOpen(false)
    }
  }

  async function handleReadAll() {
    try {
      await markAllNotificationsRead()
      setNotifications((prev) => prev.map((x) => ({ ...x, isRead: true })))
      setUnread(0)
    } catch {
      // la marca de leídas se reintentará en la próxima carga
    }
  }

  return (
    <div className="notification-bell">
      <button className="bell-btn" onClick={handleToggle} aria-label="Notificaciones">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && <span className="bell-badge">{unread}</span>}
      </button>

      {open && (
        <div className="bell-dropdown">
          <div className="bell-header">
            <span>Notificaciones</span>
            {unread > 0 && (
              <button className="bell-read-all" onClick={handleReadAll}>Marcar todas como leídas</button>
            )}
          </div>

          {error && <div className="bell-error">{error}</div>}

          {notifications.length === 0 && !error ? (
            <div className="bell-empty">No hay notificaciones.</div>
          ) : (
            <ul className="bell-list">
              {notifications.map((n) => (
                <li key={n.id} className={n.isRead ? 'bell-item bell-item-read' : 'bell-item'}>
                  <button onClick={() => handleRead(n)}>
                    <strong>{n.title}</strong>
                    <span>{n.message}</span>
                    <small>{new Date(n.createdAt).toLocaleString('es-CL')}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
