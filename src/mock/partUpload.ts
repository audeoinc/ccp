// 撮影・デモ用: 部品の画像を、ブラウザの中(object URL)だけに置く身代わり。AI の下書きは決まった文を返す
import type { PartDraft } from '../data/partUpload'

export type { PartDraft }

export const PartUpload = {
  async upload(file: File) {
    return { image_url: URL.createObjectURL(file) }
  },
  async remove(imageUrl: string) {
    if (imageUrl.startsWith('blob:')) URL.revokeObjectURL(imageUrl)
  },
  async describeImage(_image: Blob, language: 'ja' | 'en'): Promise<PartDraft> {
    await new Promise((r) => setTimeout(r, 500))
    const en = language === 'en'
    return {
      name: en ? 'Black "Shop now" button' : '黒の「今すぐ見る」ボタン',
      kind: 'button',
      tags: en ? 'black, rounded, call to action, shop now' : '黒, 角丸, 行動の呼びかけ, 今すぐ見る',
      description: en ? 'A dark rounded button with white text. For the main call to action.' : '白い文字の、黒い角丸のボタン。メインの行動の呼びかけに。',
      alt_text: en ? 'Shop now' : '今すぐ見る',
    }
  },
}
