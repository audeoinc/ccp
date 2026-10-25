// 配信カードの入力欄の値(画面の state)と、配信カードの行からの作り方。配信カード(CardDetail・useCardEditor)と、案の出し入れ(useAbVariants)で使う
import type { DeliveryCard } from './models/deliveryCards'
import { statusOptions } from './status'

export interface Form {
  name: string
  scheduledAt: string
  country: string
  channel: string
  /** Type = テーマの種類(theme_type。値下げ・セール・新作 など。X41。これまでの種別 department は使わない) */
  themeType: string
  status: string
  owner: string
  /** 配信の対象(X40): 性別(women / men / 空 = 指定なし)と年代(カンマ区切り) */
  targetGender: string
  targetAges: string
  /** アプリ: 通知のタイトル・本文 */
  pushTitle: string
  pushBody: string
  /** メール: 件名(空は配信名)・プリヘッダー(X2) */
  subject: string
  preheader: string
  /** 制作の締め切り(YYYY-MM-DD) */
  productionDue: string
  productionOwner: string
  /** 制作に引き継いだ日時(ISO。空は、まだ) */
  handedOffAt: string
  theme: string
  headline: string
  copy: string
  instructions: string
  /** 採用したAIの案の補足(テーマの理由、コピー・制作指示の切り口)。手で書き換えたら消す */
  themeReason: string
  copyAngle: string
  instructionsAngle: string
}

export const pad = (n: number) => String(n).padStart(2, '0')
// 配信のステータス(選択肢の値)。承認・差し戻し・再承認の判定に使う
export const STATUS_NOT_STARTED = 'not_started'
export const STATUS_REVIEW = 'reviewing'
export const STATUS_APPROVED = 'approved'
// ISO文字列 → datetime-local の値(ローカル時刻)
export const toLocalInput = (v?: string) => {
  if (!v) return ''
  const d = new Date(v)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}


// 空の項目は、DB から null で届く。String(null) は「null」という文字になり、保存すると「使えない値」になるので、空の文字にする
export const str = (v?: string | null) => (v === undefined || v === null ? '' : String(v))

export const toForm = (c?: DeliveryCard): Form => ({
  name: c?.name ?? '',
  scheduledAt: toLocalInput(c?.scheduled_at),
  country: str(c?.country),
  channel: str(c?.channel),
  themeType: str(c?.theme_type),
  status: c?.status === undefined || c.status === null ? String(statusOptions[0].value) : String(c.status),
  owner: c?.owner ?? '',
  targetGender: str(c?.target_gender),
  targetAges: str(c?.target_ages),
  pushTitle: c?.push_title ?? '',
  subject: c?.subject ?? '',
  preheader: c?.preheader ?? '',
  pushBody: c?.push_body ?? '',
  productionDue: c?.production_due?.slice(0, 10) ?? '',
  productionOwner: c?.production_owner ?? '',
  handedOffAt: c?.handed_off_at ?? '',
  theme: c?.theme ?? '',
  headline: c?.headline ?? '',
  copy: c?.copy ?? '',
  instructions: c?.instructions ?? '',
  themeReason: c?.theme_reason ?? '',
  copyAngle: c?.copy_angle ?? '',
  instructionsAngle: c?.instructions_angle ?? '',
})
