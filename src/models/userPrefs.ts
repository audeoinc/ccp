// 表 user_prefs(人の設定。ST6)の、1 行の型。列を変えたら、server/schema.json と一緒に直す。
// 画面からは表を直接読み書きせず、/api/prefs を通す(だれの設定かはサーバーがログインから決める。src/userPrefs.ts)

export interface UserPref {
  id: string
  user_id?: string
  /** 設定の名前(localStorage の鍵と同じ。例 cardDetail.paneWidths.v6) */
  name: string
  /** 値(localStorage の文字のまま) */
  value?: string
}
