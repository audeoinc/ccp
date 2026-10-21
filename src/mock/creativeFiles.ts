// 撮影・デモ用: 素材のファイルを、ブラウザの中(object URL)だけに置く身代わり。ページを読み込み直すと消える

const files = new Map<string, string>()
let seq = 0

export const CreativeFiles = {
  async upload(file: File) {
    const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : 'bin'
    const stored = `${String(++seq).padStart(32, '0')}.${ext}`
    files.set(stored, URL.createObjectURL(file))
    return { stored, size: file.size, contentType: file.type || 'application/octet-stream' }
  },
  url(stored: string) {
    return files.get(stored) ?? ''
  },
  // 撮影用: ページは読まず、URL から決まった見本カードを作る(画像は、画面の中で描く)
  async preview(url: string) {
    const host = (() => {
      try {
        return new URL(url).hostname
      } catch {
        return url
      }
    })()
    const c = document.createElement('canvas')
    c.width = 1200
    c.height = 630
    const g = c.getContext('2d')!
    const bg = g.createLinearGradient(0, 0, 1200, 630)
    bg.addColorStop(0, '#23395d')
    bg.addColorStop(1, '#5b8bd0')
    g.fillStyle = bg
    g.fillRect(0, 0, 1200, 630)
    g.fillStyle = '#ffffff'
    g.font = '600 56px sans-serif'
    g.fillText(host, 60, 330)
    const blob = await new Promise<Blob>((ok) => c.toBlob((b) => ok(b!), 'image/png'))
    const stored = `${String(++seq).padStart(32, '0')}.png`
    files.set(stored, URL.createObjectURL(blob))
    return { title: `${host} — sample page`, description: 'A sample description of the page (mock).', site: host, image_stored: stored }
  },
  async remove(stored: string) {
    const u = files.get(stored)
    if (u) URL.revokeObjectURL(u)
    files.delete(stored)
  },
}
