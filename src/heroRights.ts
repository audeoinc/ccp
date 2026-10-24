// メイン画像の使える期限と焦点(X59)
import type { HeroImage } from './models/heroImages'
import type { PartImage } from './models/partImages'
import { todayYmd } from './dates'

export const today = todayYmd

/** 使える期限の中か(期限なしは、いつでも使える)。期限を過ぎた画像は、選ぶ候補・AI の候補から外す */
export const isUsableHero = (h: HeroImage, on = today()) => !h.usable_until || h.usable_until.slice(0, 10) >= on

/** 切り出すときの拡大(1〜3。なければ 1) */
export const heroZoom = (h?: HeroImage) => Math.min(3, Math.max(1, Number(h?.focal_zoom) || 1))

/** 枠いっぱいに切り出す img の書式(焦点を中心に、拡大があれば拡大する。枠の側に overflow: hidden が要る。X59 ④) */
export const cropStyle = (x: number, y: number, zoom = 1) => {
  const pos = `${x * 100}% ${y * 100}%`
  return { objectFit: 'cover' as const, objectPosition: pos, ...(zoom > 1 ? { transform: `scale(${zoom})`, transformOrigin: pos } : {}) }
}
export const heroCropStyle = (h?: HeroImage) => cropStyle(h?.focal_x ?? 0.5, h?.focal_y ?? 0.5, heroZoom(h))

/** 部品の画像(X59 ③)が使える期限の中か。過ぎたものは、制作のページの候補から外す */
export const isUsablePart = (p: PartImage, on = today()) => !p.usable_until || p.usable_until.slice(0, 10) >= on
