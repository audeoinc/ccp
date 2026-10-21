// 撮影・デモ用: メイン画像を、ブラウザの中(object URL)だけに置く身代わり。AI の下書きは決まった文を返す
import type { HeroDraft } from '../data/heroUpload'

export type { HeroDraft }

export const HeroUpload = {
  async upload(file: File) {
    return { image_url: URL.createObjectURL(file) }
  },
  async describe(_imageUrl: string, language: 'ja' | 'en'): Promise<HeroDraft> {
    await new Promise((r) => setTimeout(r, 600))
    const en = language === 'en'
    return {
      name: en ? 'Warm autumn layers outdoors' : '秋の屋外で、暖かい重ね着',
      purpose: 'feature',
      season: 'autumn',
      tags: en ? 'autumn, outdoor, layering, warm tones, lifestyle' : '秋, 屋外, 重ね着, 暖色, ライフスタイル',
      description: en ? 'A warm, calm outdoor scene. Fits seasonal features and new arrivals.' : '暖かく落ち着いた屋外の場面。季節の特集や新作の告知に合う。',
      colors: en ? 'brick, mustard, olive' : 'レンガ色, からし色, オリーブ',
      subjects: en ? 'outerwear, knitwear' : 'アウター, ニット',
      focal: { x: 0.5, y: 0.4 },
    }
  },
}
