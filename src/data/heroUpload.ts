// メイン画像のライブラリに画像を上げる窓口(server/ccp/heroes.py。X59)。表ではなくサーバーの API。
// 撮影・デモ用のビルド(vite.mock.config.ts)では、ブラウザの中だけに置く身代わり(src/mock/heroUpload.ts)に差し替える。
import { appPath } from '../appRoot'

/** AI が画像を見て作った下書き(どれも空のことがある。人が確かめて直す) */
export interface HeroDraft {
  name?: string
  purpose?: string
  season?: string
  tags?: string
  description?: string
  colors?: string
  subjects?: string
  focal?: { x?: number; y?: number }
}

async function post<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(appPath(path), { method: 'POST', ...init })
  const json = (await res.json().catch(() => null)) as { success: boolean; data?: T; error?: { message: string } } | null
  if (!json?.success || !json.data) throw new Error(json?.error?.message ?? `うまくいきませんでした(${res.status})`)
  return json.data
}

export const HeroUpload = {
  /** 画像を置く。画像の URL(/img/heroes/<名前>)を返す */
  upload: (file: File) =>
    post<{ image_url: string }>(`/api/heroes/upload?name=${encodeURIComponent(file.name)}`, { headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file }),
  /** AI に画像を見せて、名前・用途・季節・タグ・説明などの下書きを作る */
  describe: (imageUrl: string, language: 'ja' | 'en') =>
    post<HeroDraft>('/api/heroes/describe', { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_url: imageUrl, language }) }),
}
