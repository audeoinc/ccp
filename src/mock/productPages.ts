// 撮影・デモ用: 商品ページから画像を選ぶ窓口の身代わり(X64)。見本の EC サイトのページを、ブラウザの中で作る。
// 絵の型は、サーバーと同じもの(server/ccp/sample_shop/*.svg)を使う。色の決め方は、サーバーと同じでなくてよい(商品ごとに決まった色になればよい)
import type { ImageAngle, ImagePick, PageImage } from '../data/productPages'
import { getLang } from '../i18n'

export type { ImageAngle, ImagePick, PageImage }

const shapes = import.meta.glob('../../server/ccp/sample_shop/*.svg', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>
const ANGLES = ['front', 'back', 'worn', 'detail', 'texture', 'scene'] as const
const ALTS: Record<string, string> = { front: 'front view', back: 'back view', worn: 'on model', detail: 'close-up of buttons and stitching', texture: 'fabric texture', scene: 'lifestyle scene' }

const hue = (code: string) => [...code].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7)
function svg(code: string, angle: string): string {
  const h = hue(code)
  const colors: Record<string, string> = { main: `hsl(${h}, 45%, 52%)`, dark: `hsl(${h}, 50%, 28%)`, light: `hsl(${h}, 40%, 86%)`, bg: `hsl(${h}, 20%, 95%)` }
  const src = shapes[`../../server/ccp/sample_shop/${angle}.svg`] ?? ''
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(src.replace(/\{\{(\w+)\}\}/g, (_, k: string) => colors[k] ?? '#999'))}`
}
const codeOf = (url: string) => url.match(/\/p\/([A-Za-z0-9_-]{1,40})/)?.[1]
const angleOf = (src: string) => ANGLES.find((a) => src.includes(`#${a}`)) ?? 'other'

export const ProductPages = {
  async images(url: string): Promise<{ sample: boolean; page: string; images: PageImage[] }> {
    await new Promise((r) => setTimeout(r, 400))
    const code = /shop\.example\.com|\/sample-shop\//.test(url) ? codeOf(url) : undefined
    if (!code) throw new Error('ページを読めませんでした(撮影用の画面では、見本のサイトの URL だけ読めます)')
    // 画像の種類を、あとで身代わりの AI が分かるように、URL の末尾(#…)に残す
    return { sample: true, page: code, images: ANGLES.map((a) => ({ src: `${svg(code, a)}#${a}`, alt: a === 'front' ? '' : ALTS[a] })) }
  },
  async suggest(input: { images: PageImage[] }): Promise<{ images: ImageAngle[]; picks: ImagePick[] }> {
    await new Promise((r) => setTimeout(r, 900))
    const en = getLang() === 'en'
    const note: Record<string, [string, string]> = {
      front: ['全体の形が分かる正面', 'Front view showing the whole shape'],
      back: ['後ろ姿', 'Back view'],
      worn: ['着たときのシルエット', 'Silhouette when worn'],
      detail: ['ボタンと縫い目の寄り', 'Close-up of buttons and stitching'],
      texture: ['編み目の質感', 'Knit texture'],
      scene: ['秋の屋外で着ている場面', 'Worn outdoors in autumn'],
    }
    const images = input.images.map((img, index) => {
      const angle = angleOf(img.src)
      return { index, angle, note: note[angle]?.[en ? 1 : 0] }
    })
    const at = (a: string) => images.find((x) => x.angle === a)?.index
    const reasons: [string, string, string][] = [
      ['texture', '素材のよさを伝える配信なので、編み目の質感がいちばん伝わる', 'This delivery is about the material, so the knit texture tells it best'],
      ['worn', '着たときの形が分かり、サイズ感の不安を減らせる', 'Shows the fit when worn, which reduces doubts about size'],
      ['detail', 'ボタンと縫い目の作りのよさが見える', 'Shows the quality of the buttons and stitching'],
    ]
    const picks = reasons.flatMap(([a, ja, enText]) => {
      const index = at(a)
      return index === undefined ? [] : [{ index, reason: en ? enText : ja }]
    })
    return { images, picks }
  },
  async adopt(src: string) {
    return { image_url: src.replace(/#\w+$/, ''), copied: false }
  },
  async upload(file: File) {
    return URL.createObjectURL(file)
  },
  /** 撮影用: 見本のページを、画像を埋め込んだ HTML としてブラウザの中で作る */
  pageUrl(page: string) {
    const imgs = ANGLES.map((a) => `<figure style="margin:0"><img src="${svg(page, a)}" alt="${ALTS[a]}" style="width:240px"><figcaption>${ALTS[a]}</figcaption></figure>`).join('')
    const html = `<!doctype html><meta charset="utf-8"><title>${page} | Sample shop</title><body style="font-family:sans-serif;margin:24px"><p>This is a sample product page (mock).</p><h1>${page}</h1><div style="display:flex;flex-wrap:wrap;gap:12px">${imgs}</div></body>`
    return URL.createObjectURL(new Blob([html], { type: 'text/html' }))
  },
}
