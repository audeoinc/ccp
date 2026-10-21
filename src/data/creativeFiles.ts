// 素材(Creative Assets。X58)のファイルの置き場所の窓口(server/ccp/creative.py)。表ではなくサーバーの API。
// 撮影・デモ用のビルド(vite.mock.config.ts)では、ブラウザの中だけに置く身代わり(src/mock/creativeFiles.ts)に差し替える。
import { appPath } from '../appRoot'

interface Uploaded {
  stored: string
  size: number
  contentType: string
}

export const CreativeFiles = {
  /** ファイルを置く。置き場所の名前(stored)を返す */
  async upload(file: File): Promise<Uploaded> {
    const res = await fetch(appPath(`/api/creative/files?name=${encodeURIComponent(file.name)}`), {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    })
    const json = (await res.json().catch(() => null)) as { success: boolean; data?: Uploaded; error?: { message: string } } | null
    if (!json?.success || !json.data) throw new Error(json?.error?.message ?? `アップロードに失敗しました(${res.status})`)
    return json.data
  },
  /** ファイルを開く URL(download に名前を渡すと、その名前でダウンロード) */
  url(stored: string, download?: string): string {
    return appPath(`/api/creative/files/${encodeURIComponent(stored)}${download ? `?download=${encodeURIComponent(download)}` : ''}`)
  },
  /** ファイルを消す(表の行は、呼び出し側が消す) */
  async remove(stored: string): Promise<void> {
    await fetch(appPath(`/api/creative/files/${encodeURIComponent(stored)}`), { method: 'DELETE' })
  },
}
