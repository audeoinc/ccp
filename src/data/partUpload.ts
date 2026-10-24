// 部品の画像(ボタン・バナー・ロゴ・アイコン。X59 ③)を上げる窓口(server/ccp/parts.py)。表ではなくサーバーの API。
// 撮影・デモ用のビルド(vite.mock.config.ts)では、ブラウザの中だけに置く身代わり(src/mock/partUpload.ts)に差し替える。
import { appPath } from '../appRoot'
import { dropSharedReads } from '../gcp/readShare'

/** AI が画像を見て作った下書き(どれも空のことがある。人が確かめて直す) */
export interface PartDraft {
  name?: string
  kind?: string
  tags?: string
  description?: string
  alt_text?: string
}

async function post<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(appPath(path), { method: 'POST', ...init })
  dropSharedReads() // 書いたので、途中の読み込みに相乗りさせない(gcp/readShare.ts)
  const json = (await res.json().catch(() => null)) as { success: boolean; data?: T; error?: { message: string } } | null
  if (!json?.success || !json.data) throw new Error(json?.error?.message ?? `うまくいきませんでした(${res.status})`)
  return json.data
}

export const PartUpload = {
  /** 画像を置く。画像の URL(/img/parts/<名前>)を返す */
  upload: (file: File) =>
    post<{ image_url: string }>(`/api/parts/upload?name=${encodeURIComponent(file.name)}`, { headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file }),
  /** 上げた画像のファイルを消す(/img/parts/up-… のものだけ。表の行は、呼び出し側が消す) */
  async remove(imageUrl: string): Promise<void> {
    const name = imageUrl.match(/^\/img\/parts\/(up-[0-9a-f]{32}\.(?:jpg|png|webp))$/)?.[1]
    if (name) await fetch(appPath(`/api/parts/files/${name}`), { method: 'DELETE' })
  },
  /** 画像そのものを AI に見せて、名前・種類・タグ・説明・代替テキストの下書きを作る */
  describeImage: (image: Blob, language: 'ja' | 'en') =>
    post<PartDraft>(`/api/parts/describe-image?language=${language}`, { headers: { 'Content-Type': image.type || 'image/png' }, body: image }),
}
