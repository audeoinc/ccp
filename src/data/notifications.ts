// 表 notifications の読み書き。サーバーの /api/data/notifications を呼ぶ(src/gcp/services.ts)。
// 撮影・デモ用のビルド(vite.mock.config.ts)では、サンプルデータに差し替える。
import type { Notification, NotificationFields } from '../models/notifications'
import { tableService } from '../gcp/services'

export const NotificationsService = tableService<Notification, NotificationFields>('notifications')
