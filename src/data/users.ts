// 表 users の読み書き。サーバーの /api/data/users を呼ぶ(src/gcp/services.ts)。
// 撮影・デモ用のビルド(vite.mock.config.ts)では、サンプルデータに差し替える。
import type { User, UserFields } from '../models/users'
import { tableService } from '../gcp/services'

export const UsersService = tableService<User, UserFields>('users')
