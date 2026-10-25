// 配信カードの入力欄の値(画面の state)。配信カード(CardDetail)と、案の出し入れ(useAbVariants)で使う
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
