// 表 product_rankings(商品の販売順位。市場 × 週 × 販売チャネルごと。BigQuery の出力 ranking から取り込む)の、1 行の型。
// 列を変えたら、server/schema.json と一緒に直す(scripts/check-schema.mjs が食い違いを見つける)。

/** 販売チャネル: 全社 / EC / 配信経由(メール・アプリのすべての配信を通った売上) */
export type RankingChannel = 'all' | 'ec' | 'delivery'

export const RANKING_CHANNELS: RankingChannel[] = ['all', 'ec', 'delivery']

/** 列 */
export interface ProductRankingFields {
  market?: string
  product_code?: string
  /** 週の始まり(YYYY-MM-DD。週ごとの実績と同じ週) */
  week_start?: string
  /** all / ec / delivery */
  channel?: string
  /** 売れた数量の順位(市場の中で、1 が最も売れた) */
  rank?: number
  /** その週・そのチャネルで売れた数量 */
  units?: number
  as_of?: string
  state_code?: number
}

/** 読んだ 1 行 */
export interface ProductRanking extends ProductRankingFields {
  id: string
  created_on?: string
  modified_on?: string
}
