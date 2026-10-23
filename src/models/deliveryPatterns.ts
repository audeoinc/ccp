// 表 delivery_patterns の、1 行の型。列を変えたら、server/schema.json と一緒に直す(scripts/check-schema.mjs が食い違いを見つける)。
// 国ごとの配信の型(ST9。BACKLOG 13 章)。「まとめて作る」が、この型どおりに枠を作る

/** 書き込める列 */
export interface DeliveryPatternFields {
  /** 型の名前(一覧で見分けるため。空なら曜日・時刻・チャネルから作る) */
  name: string
  /** 国(配信カードの country と同じ値) */
  country?: string
  /** 曜日。0 = 日曜 … 6 = 土曜(Date.getDay と同じ) */
  weekday?: number
  /** 配信の時刻 HH:MM(その国の時刻) */
  time?: string
  /** チャネル(email / app) */
  channel?: string
  /** 種類(theme_type) */
  theme_type?: string
  /** テンプレートの id(版は持たない。作るときの最新の版を使う) */
  layout_key?: string
  /** 同じ日・チャネルに 2 本以上あるときの並び順 */
  sort_order?: number
  note?: string
  state_code?: number
}

/** 読んだ 1 行 */
export interface DeliveryPattern extends DeliveryPatternFields {
  id: string
  created_on?: string
  modified_on?: string
}
