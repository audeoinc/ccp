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
  async remove(stored: string) {
    const u = files.get(stored)
    if (u) URL.revokeObjectURL(u)
    files.delete(stored)
  },
}
