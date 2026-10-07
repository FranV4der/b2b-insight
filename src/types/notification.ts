export interface AppNotification {
  id: number
  userId: number
  title: string
  message: string
  type: string | null
  referenceId: number | null
  referenceType: string | null
  isRead: boolean
  createdAt: string
}

export interface NotificationsResponse {
  data: AppNotification[]
  unread: number
}
