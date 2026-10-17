// 撮影・デモ用の /api/me の身代わり: ログインなし(画面で「あなた」を選ぶ)。vite.mock.config.ts が src/data/me を、これに差し替える
import type { Me } from '../data/me'

export const MeService = {
  async get(): Promise<Me | null> {
    return { email: null, source: null, user: null }
  },
}
