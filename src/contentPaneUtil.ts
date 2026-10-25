// 中ペイン(ContentPane・HeroTab・SectionsTab)で共通の小道具と型(整理 第3段 ③)
import type { MouseEvent } from 'react'
import { optionLabel } from './i18n'
import type { HeroImage } from './models/heroImages'

/** クリックしたタブを中央へ寄せる(端のタブを選んでも、次のタブが見えて、続けて選べる) */
export const revealTab = (e: MouseEvent<HTMLElement>) => {
  const el = e.currentTarget
  requestAnimationFrame(() => el.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }))
}

export const heroMeta = (h?: HeroImage) => (h ? `${h.image_code} ・ ${optionLabel(h.purpose_name)} ・ ${optionLabel(h.season_name)} ・ ${h.tags ?? ''}` : '')

/** AI チャットの対象(開いているタブ)。HeroTab・SectionsTab が、開いているサブタブを中ペインに知らせる */
export type ChatTargetInfo = { key: string; title: string }
export type RegisterChat = (target: ChatTargetInfo | null, run?: () => Promise<unknown>) => void
/** 入力欄の名前(配信カードの Form の項目のうち、中ペインが書くもの) */
export type FieldKey = 'theme' | 'headline' | 'copy' | 'instructions' | 'themeReason' | 'copyAngle' | 'instructionsAngle' | 'subject' | 'preheader' | 'pushTitle' | 'pushBody'
