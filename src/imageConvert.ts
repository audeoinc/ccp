// 画像の形の変換(X59)。AVIF を JPEG に変えてから上げる・AI に見せるために、画面に出している画像を JPEG にする。
// どちらもブラウザの中(canvas)で行い、サーバーには画像を変える仕組みを置かない

const isAvif = (f: File) => /\.avif$/i.test(f.name) || f.type === 'image/avif'

const canvasJpeg = (c: HTMLCanvasElement, quality = 0.92) =>
  new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('画像を変換できませんでした'))), 'image/jpeg', quality))

/** 上げる前の画像。AVIF は JPEG に変える(メールでは AVIF を出せない受信ソフトが多いため)。ほかはそのまま */
export async function toUploadable(file: File): Promise<File> {
  if (!isAvif(file)) return file
  let bmp: ImageBitmap
  try {
    bmp = await createImageBitmap(file)
  } catch {
    throw new Error('この AVIF 画像を読めませんでした(ブラウザが対応していないか、壊れています)')
  }
  const c = document.createElement('canvas')
  c.width = bmp.width
  c.height = bmp.height
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('画像を変換できませんでした')
  // 透明な部分は白にする(JPEG は透明を持てない)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.drawImage(bmp, 0, 0)
  bmp.close()
  const blob = await canvasJpeg(c)
  return new File([blob], file.name.replace(/\.avif$/i, '') + '.jpg', { type: 'image/jpeg' })
}

/** 画面に出している画像(URL)を、AI に見せるための JPEG にする(長い辺は max まで縮める)。SVG の見本の画像も、ここで絵にする */
export async function rasterize(url: string, max = 1600): Promise<Blob> {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.decoding = 'async'
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('画像を読めませんでした'))
    img.src = url
  })
  const w = img.naturalWidth || 1200
  const h = img.naturalHeight || 675
  const k = Math.min(1, max / Math.max(w, h))
  const c = document.createElement('canvas')
  c.width = Math.round(w * k)
  c.height = Math.round(h * k)
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('画像を変換できませんでした')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.drawImage(img, 0, 0, c.width, c.height)
  return canvasJpeg(c, 0.85)
}
