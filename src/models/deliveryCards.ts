// 表 delivery_cards の、1 行の型と選択肢。列を変えたら、server/schema.json と一緒に直す(scripts/check-schema.mjs が食い違いを見つける)。

export const DeliveryCardCountry = {
  US: 'US',
  JP: 'JP',
} as const
export type DeliveryCardCountry = keyof typeof DeliveryCardCountry

export const DeliveryCardChannel = {
  email: 'メール',
  app: 'プッシュ',
} as const
export type DeliveryCardChannel = keyof typeof DeliveryCardChannel

export const DeliveryCardDepartment = {
  promotion: '販促',
  crm: 'CRM',
  ec: 'EC',
} as const
export type DeliveryCardDepartment = keyof typeof DeliveryCardDepartment

export const DeliveryCardTargetGender = {
  women: '女性',
  men: '男性',
} as const
export type DeliveryCardTargetGender = keyof typeof DeliveryCardTargetGender

export const DeliveryCardStatus = {
  not_started: '未起案',
  reviewing: '検討中',
  approved: '承認済み',
  confirmed: '確定',
} as const
export type DeliveryCardStatus = keyof typeof DeliveryCardStatus

export const DeliveryCardEmailTemplate = {
  free: '自由',
  standard4: 'Standard4',
  collab: 'Collab',
  offer: 'Offer',
  cat2: 'Cat2',
  cat3: 'Cat3',
} as const
export type DeliveryCardEmailTemplate = keyof typeof DeliveryCardEmailTemplate

/** 書き込める列 */
export interface DeliveryCardFields {
  name: string
  scheduled_at?: string
  country?: DeliveryCardCountry
  channel?: DeliveryCardChannel
  department?: DeliveryCardDepartment
  status?: DeliveryCardStatus
  email_template?: DeliveryCardEmailTemplate
  layout_key?: string
  theme?: string
  theme_reason?: string
  headline?: string
  copy?: string
  copy_angle?: string
  instructions?: string
  instructions_angle?: string
  hero_reason?: string
  section_titles?: string
  section_copies?: string
  products?: string
  /** 担当者(自由記入。過去に入れた名前を候補に出す) */
  owner?: string
  /** 制作の締め切り(YYYY-MM-DD) */
  production_due?: string
  /** リンク先の URL と計測用のパラメーター(JSON。src/links.ts) */
  links?: string
  /** 制作の担当者 */
  production_owner?: string
  /** 制作に引き継いだ日時(ISO。空は、まだ) */
  handed_off_at?: string
  /** アプリ: 通知を押したときに開く画面(JSON。{"kind": "campaign" | "product" | "category" | "home" | "custom", "url"?: string}) */
  push_link?: string
  /** アプリ: 送る相手(all / members / inactive30 / notOpenedEmail) */
  audience?: string
  /** 配信の対象の性別(women / men。空は指定なし。src/target.ts) */
  target_gender?: DeliveryCardTargetGender
  /** 配信の対象の年代(10s,20s,… をカンマでつないだもの。空は指定なし) */
  target_ages?: string
  /** アプリ: 通知のタイトル(メッセージのヘッドラインとは別) */
  push_title?: string
  /** アプリ: 通知の本文(メッセージのコピーとは別) */
  push_body?: string
  /** テーマの種類(src/themeTypes.ts の THEME_TYPES のキー。空は、まだ分けていない) */
  theme_type?: string
  /** 取りやめた日時(ISO。空は、取りやめていない)。取りやめた配信は消さずに残す(src/cancel.ts) */
  cancelled_at?: string
  /** 取りやめの理由 */
  cancel_reason?: string
  /** AI でまとめて中身を作り、まだ人が確かめていない(作った日時。確かめたら空。W14) */
  ai_unchecked_at?: string | null
  /** 週の表示の上の「この週の枠を作る」で、中身のない枠として作った日時(W14 の古い形)。中身のない配信のうち、これがあるものだけを枠として出す */
  frame_at?: string | null
  /** hero_images の id(参照を外すときは null) */
  hero_image_id?: string | null
  state_code?: number
}

/** 読んだ 1 行 */
export interface DeliveryCard extends DeliveryCardFields {
  id: string
  country_name?: string
  channel_name?: string
  department_name?: string
  status_name?: string
  email_template_name?: string
  created_on?: string
  modified_on?: string
}
