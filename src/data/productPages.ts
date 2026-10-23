// 商品ページから、配信で使う商品の画像を選ぶ窓口(server/ccp/product_pages.py。X64)。表ではなくサーバーの API。
// 撮影・デモ用のビルド(vite.mock.config.ts)では、ブラウザの中で見本のページを作る身代わり(src/mock/productPages.ts)に差し替える。
import { appPath } from '../appRoot'
import { CreativeFiles } from './creativeFiles'

/** ページに載っている画像 1 枚(src は、見本ならアプリの中のパス、本物なら https://…) */
export interface PageImage {
  src: string
  alt: string
  /** 画像の説明(ページの alt → title → figcaption → JSON-LD の、最初にあるもの。AI に画像を勧めてもらうときの材料) */
  description?: string
  /** 取り込んだ商品の画像のうち、メイン画像(商品のマスタにある画像) */
  main?: boolean
}

/** AI が見た、画像ごとのアングル(index は渡した画像の番号) */
export interface ImageAngle {
  index: number
  angle: string
  note?: string
}

/** AI が勧める画像(よい順) */
export interface ImagePick {
  index: number
  reason: string
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(appPath(path), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const json = (await res.json().catch(() => null)) as { success: boolean; data?: T; error?: { message: string } } | null
  if (!json?.success || !json.data) throw new Error(json?.error?.message ?? `うまくいきませんでした(${res.status})`)
  return json.data
}

export const ProductPages = {
  /** ページを読み、載っている画像の一覧を返す。sample = 見本の EC サイトのページ。page = ブラウザで開くときの URL */
  images: (url: string) => post<{ sample: boolean; page: string; images: PageImage[] }>('/api/product-pages/images', { url }),
  /** 画像を AI に見せ、アングルと、この配信に合う画像(理由つき)を返す */
  suggest: (input: { images: PageImage[]; product: Record<string, unknown>; delivery: Record<string, unknown>; language: 'ja' | 'en' }) =>
    post<{ images: ImageAngle[]; picks: ImagePick[] }>('/api/product-pages/suggest', input),
  /** 選んだ画像を写し、配信に入れる画像の URL を返す(見本の画像は写さない) */
  adopt: (src: string) => post<{ image_url: string; copied: boolean }>('/api/product-pages/adopt', { src }),
  /** 貼り付けた・選んだ画像のファイルを置き、配信に入れる画像の URL を返す(置き場所は素材と同じ) */
  async upload(file: File): Promise<string> {
    const { stored } = await CreativeFiles.upload(file)
    return `/api/creative/files/${stored}`
  },
  /** 見本の EC サイトのページを、ブラウザで開くときの URL */
  pageUrl: (page: string) => appPath(page),
}
