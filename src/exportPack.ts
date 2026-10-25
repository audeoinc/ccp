// ⚙ の「データと画像を書き出す」(GET /api/export)。
// 以前は <a download> でブラウザに任せていたが、サーバーは ZIP を一時ファイルに作り終えてから返すので、
// 作っている間(写真が多いと 1 分ほど)は何も起きず、押せたのか分からなかった(2026-10-25)。
// fetch で受け取りながら、受け取った大きさを知らせ、受け取り終えてから保存させる
import { appPath } from './appRoot'
import { tr } from './i18n'

export interface PackDownload {
  bytes: number
  filename: string
}

/** パックを受け取って保存させる。onBytes には、受け取った大きさ(バイト)が届く(作っている間は 0 のまま) */
export async function downloadPack(onBytes: (bytes: number) => void): Promise<PackDownload> {
  const res = await fetch(appPath('/api/export'))
  if (!res.ok) {
    // 失敗のときは、サーバーの理由(JSON の error.message・detail)を出す
    const body = (await res.json().catch(() => null)) as { error?: { message?: string }; detail?: string } | null
    throw new Error(body?.error?.message ?? body?.detail ?? tr(`サーバーが書き出せませんでした(${res.status})`, `The server could not export (${res.status})`))
  }
  if (!(res.headers.get('content-type') ?? '').includes('zip')) throw new Error(tr('サーバーの応答が ZIP ではありません', 'The server did not return a ZIP'))
  const chunks: Uint8Array<ArrayBuffer>[] = []
  let bytes = 0
  const reader = res.body?.getReader()
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      bytes += value.byteLength
      onBytes(bytes)
    }
  } else {
    const all = new Uint8Array(await res.arrayBuffer())
    chunks.push(all)
    bytes = all.byteLength
  }
  const filename = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'ccp-pack.zip'
  const url = URL.createObjectURL(new Blob(chunks, { type: 'application/zip' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  // 保存が始まる前に消さないよう、少し待ってから消す
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return { bytes, filename }
}

/** 大きさを MB で(小さいときも 0.1 MB 単位) */
export const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`
