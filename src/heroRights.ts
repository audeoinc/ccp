// メイン画像の使える期限と焦点(X59)
import type { HeroImage } from './models/heroImages'

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 使える期限の中か(期限なしは、いつでも使える)。期限を過ぎた画像は、選ぶ候補・AI の候補から外す */
export const isUsableHero = (h: HeroImage, on = today()) => !h.usable_until || h.usable_until.slice(0, 10) >= on

/** 切り出すときの中心(焦点。なければ真ん中)。img の object-position に渡す */
export const heroPosition = (h?: HeroImage) => `${(h?.focal_x ?? 0.5) * 100}% ${(h?.focal_y ?? 0.5) * 100}%`
