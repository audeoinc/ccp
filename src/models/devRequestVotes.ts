// 表 dev_request_votes(開発へのリクエストへの賛同。いいね)の、1 行の型。列を変えたら、server/schema.json と一緒に直す。
// 1 人 1 回(同じ名前でもう一度押すと、行を消して取り消す)。押した日時は created_on

/** 書き込める列 */
export interface DevRequestVoteFields {
  dev_request_id?: string
  /** 賛同した人(リクエスト用の名前) */
  voter_name?: string
}

/** 読んだ 1 行 */
export interface DevRequestVote extends DevRequestVoteFields {
  id: string
  created_on?: string
}
