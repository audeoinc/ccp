// 撮影・デモ用の /api/me の身代わり: ログインなし(画面で「あなた」を選ぶ)。vite.mock.config.ts が src/data/me を、これに差し替える。
// 見本の画面で、ログイン(OIDC。W2)の見た目を見せるために、URL に付けた印で切り替えられる:
//   ?login=oidc      Mika Tanaka がログインしている(右上の名前を押すと、ログアウトのメニュー)
//   ?login=expired   上と同じで、少しあとに「ログインが切れました」の案内を出す
import type { Me } from '../data/me'
import { users } from './seed'
import { showLoginExpired } from '../gcp/loginExpired'

// 画面が開いたあとに URL を書き換える(週・国など)ので、印は読み込んだときに 1 回だけ読む
const login = new URLSearchParams(location.search).get('login')
let expiredShown = false

export const MeService = {
  async get(): Promise<Me | null> {
    if (login !== 'oidc' && login !== 'expired') return { email: null, source: null, user: null }
    const u = users[0]
    if (login === 'expired' && !expiredShown) {
      expiredShown = true
      window.setTimeout(showLoginExpired, 3000)
    }
    return { email: String(u.email), source: 'oidc', user: { id: String(u.id), name: String(u.name), role: String(u.role) } }
  },
}
