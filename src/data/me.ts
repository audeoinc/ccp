// だれが開いているか(バックログ U7 の下地)。サーバーの /api/me(server/ccp/identity.py)を呼ぶ。
// ログインがなければ user も email も null で、これまでどおり画面で「あなた」を選ぶ。
// 撮影・デモ用のビルド(vite.mock.config.ts)では、src/mock/me.ts(ログインなし)に差し替える。
import { appPath } from '../appRoot'

export interface Me {
  /** ログインしている人のメールアドレス(ログインがなければ null) */
  email: string | null
  /** iap = IAP のログイン / env = 手元の CCP_DEV_USER_EMAIL */
  source: 'iap' | 'env' | null
  /** そのメールアドレスに当たるユーザー(users)。登録がなければ null */
  user: { id: string; name: string; role?: string } | null
}

export const MeService = {
  async get(): Promise<Me | null> {
    try {
      const res = await fetch(appPath('/api/me'))
      const json = (await res.json().catch(() => null)) as { success: boolean; data?: Me } | null
      return json?.success ? (json.data ?? null) : null
    } catch {
      return null
    }
  },
}
