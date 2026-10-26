// 表 campaigns の、1 行の型。列を変えたら、server/schema.json と一緒に直す(scripts/check-schema.mjs が食い違いを見つける)。
// キャンペーン(配信カードの親。X79)。期間・配信日・状態は持たない(日付はカードの scheduled_at、状態は子のカードから出す。src/campaigns.ts)

/** 書き込める列 */
export interface CampaignFields {
  /** キャンペーンの名前(子の配信カードの名前は「キャンペーン名 + チャネル」で作る) */
  name: string
  /** 国(配信カードの country と同じ値)。キャンペーンは国をまたがない */
  country?: string
  /** テーマ */
  theme?: string
  /** テーマの理由 */
  theme_reason?: string
  /** テーマの種類(src/themeTypes.ts の THEME_TYPES のキー) */
  theme_type?: string
  /** 目的 */
  purpose?: string
  state_code?: number
}

/** 読んだ 1 行 */
export interface Campaign extends CampaignFields {
  id: string
  created_on?: string
  modified_on?: string
}
